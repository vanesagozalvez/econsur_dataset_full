"""
EconSur Dataset Studio — Backend Unificado
Sirve el frontend compilado de React desde backend/static/
y consolida las 4 fuentes de datos macroeconómicos.
"""

import sqlite3
import io
import json
import logging
from pathlib import Path
from collections import defaultdict
from typing import Optional, List, Dict, Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ── Rutas base ────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent          # backend/
STATIC_DIR = BASE_DIR / "static"            # backend/static/  ← build de React
DATA_DIR   = BASE_DIR / "data"              # backend/data/
DATA_DIR.mkdir(exist_ok=True)

MACRO_DIR    = DATA_DIR / "macro_indec"
COMERCIO_DIR = DATA_DIR / "saldo_comercial"
EMPLEO_DIR   = DATA_DIR / "empleo_ingresos"
PRECIOS_DIR  = DATA_DIR / "precios_ipc"

for d in [MACRO_DIR, COMERCIO_DIR, EMPLEO_DIR, PRECIOS_DIR]:
    d.mkdir(exist_ok=True)

# ── Registro de bases de datos ────────────────────────────────────────────────
DB_REGISTRY: Dict[str, Path] = {
    "macro1":    MACRO_DIR    / "macro_indec1.db",
    "macro2":    MACRO_DIR    / "macro_indec2_final.db",
    "comercio1": COMERCIO_DIR / "saldo_comercial1.db",
    "comercio2": COMERCIO_DIR / "saldo_comercial2.db",
    "empleo1":   EMPLEO_DIR   / "empleo_e_ingresos.db",
    "empleo2":   EMPLEO_DIR   / "empleo_e_ingresos2.db",
    "empleo3":   EMPLEO_DIR   / "empleo_e_ingresos3.db",
    "precios1":  PRECIOS_DIR  / "data_ipc_indec.db",
    "precios2":  PRECIOS_DIR  / "data_apendice4.db",
}

META_REGISTRY: Dict[str, Path] = {
    "macro_meta1": MACRO_DIR / "series_metadata1.json",
    "macro_meta2": MACRO_DIR / "series_metadata2_final.json",
}

def get_conn(db_key: str) -> sqlite3.Connection:
    path = DB_REGISTRY.get(db_key)
    if not path:
        raise HTTPException(400, detail=f"db_key='{db_key}' inválido.")
    if not path.exists():
        raise HTTPException(503, detail=f"Base '{path.name}' no disponible.")
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn

# ── Frecuencias ───────────────────────────────────────────────────────────────
_FREQ_NORM  = {"ANUAL":"Anual","TRIMESTRAL":"Trimestral","MENSUAL":"Mensual",
               "SEMESTRAL":"Semestral","Anual":"Anual","Trimestral":"Trimestral",
               "Mensual":"Mensual","Semestral":"Semestral"}
_FREQ_ORDER = {"Anual":0,"Semestral":1,"Trimestral":2,"Mensual":3}

def norm_freq(raw: str) -> str:
    return _FREQ_NORM.get(raw, raw.title())

# ── Metadata Macro INDEC ──────────────────────────────────────────────────────
def _load_macro_metadata() -> List[Dict]:
    items = []
    for db_num, meta_key, db_key, table in [
        (1, "macro_meta1", "macro1", "series_macro_simplified"),
        (2, "macro_meta2", "macro2", "series_macro2"),
    ]:
        meta_path = META_REGISTRY[meta_key]
        if not meta_path.exists():
            log.warning(f"Metadata no encontrada: {meta_path}")
            continue
        try:
            raw = json.loads(meta_path.read_text(encoding="utf-8"))
            group_counter: Dict[tuple, int] = defaultdict(int)
            for item in raw:
                key = (item["cuadro"], item["frecuencia"], item["serie_nombre_final_simplified"])
                local_idx = group_counter[key]
                group_counter[key] += 1
                items.append({**item, "local_idx": local_idx, "db_key": db_key,
                               "table": table, "db_num_macro": db_num,
                               "unidad_orig": item.get("unidad", "")})
        except Exception as e:
            log.error(f"Error cargando {meta_path}: {e}")
    result = []
    for i, item in enumerate(items):
        result.append({**item, "meta_idx": i})
    return result

_MACRO_METADATA: List[Dict] = _load_macro_metadata()
_MACRO_BY_IDX:   Dict[int, Dict] = {it["meta_idx"]: it for it in _MACRO_METADATA}
_MACRO_BY_CF:    Dict[tuple, List[Dict]] = defaultdict(list)
for _it in _MACRO_METADATA:
    _MACRO_BY_CF[(_it["cuadro"], _it["frecuencia"])].append(_it)

# ── Catálogos ─────────────────────────────────────────────────────────────────
MACRO_CUADROS = [
    ("CUADRO 1.2.1",  "Oferta y Demanda Globales - desestacionalizadas",          "macro1"),
    ("CUADRO 1.3.1",  "Producto Interno Bruto, precios constantes",               "macro1"),
    ("CUADRO 1.3.2",  "Valor Agregado Bruto por rama - precios constantes",       "macro1"),
    ("CUADRO 1.3.3",  "Valor Bruto de Producción por rama - precios constantes",  "macro1"),
    ("CUADRO 1.4.1",  "EMAE - nivel general y componentes",                       "macro1"),
    ("CUADRO 1.5.1",  "Oferta y Demanda Globales por componente",                 "macro1"),
    ("CUADRO 1.6.1",  "PIB - precios corrientes",                                 "macro1"),
    ("CUADRO 1.6.2",  "Valor Agregado Bruto por rama - precios corrientes",       "macro1"),
    ("CUADRO 1.6.3",  "Valor Bruto de Producción por rama - precios corrientes",  "macro1"),
    ("CUADRO 1.7.1",  "PIB - Índice de precios implícitos",                       "macro1"),
    ("CUADRO 1.7.1B", "Oferta y demanda globales - precios implícitos",           "macro1"),
    ("CUADRO 1.7.2",  "Índice de Precios Implícitos del VAB por rama",            "macro1"),
    ("CUADRO 1.8",    "PIB en dólares, PIB per cápita, TCN y Población",          "macro1"),
    ("CUADRO 1.10.1", "Estadísticas de Servicios Públicos",                       "macro1"),
    ("CUADRO 1.11.1", "Encuesta de Supermercados",                                "macro2"),
    ("CUADRO 1.11.2", "Encuesta de Autoservicios Mayoristas",                     "macro2"),
    ("CUADRO 1.12.1", "Encuesta de Centros de Compras",                           "macro2"),
    ("CUADRO 1.13",   "Ventas al Mercado Interno de Producción Nacional",         "macro2"),
    ("CUADRO 1.14",   "IPI Manufacturero - Nivel General y Divisiones",           "macro2"),
    ("CUADRO 1.16C",  "Utilización de la Capacidad Instalada en la Industria",    "macro2"),
    ("CUADRO 1.17",   "Indicadores de Producción de la Industria Manufacturera",  "macro2"),
    ("CUADRO 1.18B",  "ISAC - Construcción",                                      "macro2"),
    ("CUADRO 1.20",   "Faena de Ganado",                                          "macro2"),
    ("CUADRO 1.22",   "Industria Automotriz",                                     "macro2"),
    ("CUADRO 1.23",   "Industria Siderúrgica",                                    "macro2"),
    ("CUADRO 1.24",   "Producción y Ventas de Petróleo y Derivados",              "macro2"),
    ("CUADRO 1.25",   "Producción y Consumo de Gas Natural",                      "macro2"),
    ("CUADRO 1.28",   "Demanda de Electricidad",                                  "macro2"),
    ("CUADRO 1.30",   "Índice de Confianza del Consumidor (ICC)",                 "macro2"),
    ("CUADRO 1.31",   "Encuesta de Ocupación Hotelera (EOH)",                     "macro2"),
    ("CUADRO 1.32",   "Índice de Confianza en el Gobierno (ICG)",                 "macro2"),
]

COMERCIO_FUENTES = [
    ("1. ICA",                           "CUADRO 1",  "Intercambio Comercial Argentino",                  "comercio1", "saldo_comercial"),
    ("2. X Rubro",                       "CUADRO 2",  "Exportaciones FOB por Rubro",                      "comercio1", "saldo_comercial"),
    ("3. M usos",                        "CUADRO 3",  "Importaciones CIF por Uso Económico",              "comercio1", "saldo_comercial"),
    ("7. X Paises",                      "CUADRO 7",  "Exportaciones FOB por Países y Regiones",          "comercio1", "saldo_comercial"),
    ("8. M Paises",                      "CUADRO 8",  "Importaciones CIF por Regiones y Países",          "comercio1", "saldo_comercial"),
    ("9. Saldo Paises",                  "CUADRO 9",  "Saldo Comercial por Países y Regiones",            "comercio1", "saldo_comercial"),
    ("10. X pyq",                        "CUADRO 10", "Índices de Exportaciones (valor, precio, cant.)",  "comercio2", "series_datos"),
    ("11. M pyq",                        "CUADRO 11", "Índices de Importaciones (valor, precio, cant.)",  "comercio2", "series_datos"),
    ("12. TdI",                          "CUADRO 12", "Índices de Términos del Intercambio",              "comercio2", "series_datos"),
    ("13. Poder de Compra X",            "CUADRO 13", "Poder de Compra de las Exportaciones",             "comercio2", "series_datos"),
    ("14.a Bce Pagos 6-17",              "CUADRO 14", "Estimación del Balance de Pagos",                  "comercio2", "series_datos"),
    ("15.a Deuda Ext. Bruta x S. 6-17",  "CUADRO 15", "Deuda Externa Bruta por Sector Residente",        "comercio2", "series_datos"),
    ("17. ETI",                          "CUADRO 34", "Encuesta de Turismo Internacional (ETI)",          "comercio2", "series_datos"),
    ("18. IPMP",                         "CUADRO 18", "Índice de Precios de Materias Primas (IPMP)",      "comercio2", "series_datos"),
    ("20.Balance cambiario",             "CUADRO 20", "Balance Cambiario",                                "comercio2", "series_datos"),
    ("21.Bienes por modalidad de pago",  "CUADRO 21", "Cobros y Pagos por Bienes — Modalidad",           "comercio2", "series_datos"),
    ("22.Bienes por sector",             "CUADRO 22", "Cobros y Pagos por Bienes — Sector",              "comercio2", "series_datos"),
    ("23.Servicios por tipo",            "CUADRO 23", "Cobros y Pagos por Tipo de Servicio",             "comercio2", "series_datos"),
    ("35. Liquidaciones OyC CIARA-CEC",  "CUADRO 36", "Liquidaciones CIARA-CEC",                         "comercio2", "series_datos"),
]

EMPLEO_FUENTES = [
    ("EPH",               "EPH - Tasas generales",               "empleo1", "empleo_datos"),
    ("EPH - Asal",        "EPH - Asalariados",                   "empleo1", "empleo_datos"),
    ("EPH-Poblaciones",   "EPH - Poblaciones",                   "empleo1", "empleo_datos"),
    ("TA 03-",            "Tasa de Actividad (2003-)",            "empleo1", "empleo_datos"),
    ("TD 03-",            "Tasa de Desocupación (2003-)",         "empleo1", "empleo_datos"),
    ("TE 03-",            "Tasa de Empleo (2003-)",               "empleo1", "empleo_datos"),
    ("TS 03-",            "Tasa de Subocupación (2003-)",         "empleo1", "empleo_datos"),
    ("TSD 03-",           "Tasa de Suboc. Demandante (2003-)",    "empleo1", "empleo_datos"),
    ("TSND 03-",          "Tasa de Suboc. No Dem. (2003-)",       "empleo1", "empleo_datos"),
    ("EIL - Aglo",        "EIL - Por Aglomerado",                "empleo1", "empleo_datos"),
    ("EIL - Sector",      "EIL - Por Sector",                    "empleo1", "empleo_datos"),
    ("EAHU-Tasas",        "EAHU - Tasas",                        "empleo1", "empleo_datos"),
    ("EAHU-Poblaciones",  "EAHU - Poblaciones",                  "empleo1", "empleo_datos"),
    ("CGI-2016",          "CGI - Costo Salarial Total",          "empleo2", "empleo_datos"),
    ("CGI ManodeObra",    "CGI - Mano de Obra",                  "empleo2", "empleo_datos"),
    ("CGI VABpb",         "CGI - VAB pb",                        "empleo2", "empleo_datos"),
    ("IS oct16=100",      "Índice de Salarios",                  "empleo2", "empleo_datos"),
    ("RIPTE",             "RIPTE",                               "empleo2", "empleo_datos"),
    ("SMVM",              "Salario Mínimo (SMVM)",               "empleo2", "empleo_datos"),
    ("HaberMin",          "Haber Mínimo Jubilatorio",            "empleo2", "empleo_datos"),
    ("CBA y CBT 2016",    "CBA y CBT",                           "empleo2", "empleo_datos"),
    ("LP - Pers",         "Línea de Pobreza",                    "empleo2", "empleo_datos"),
    ("DP",                "Distribución del Ingreso",            "empleo2", "empleo_datos"),
    ("DP Deciles",        "Distribución por Deciles",            "empleo2", "empleo_datos"),
    ("AUH",               "Asignación Universal por Hijo (AUH)", "empleo2", "empleo_datos"),
    ("OEDE Total",        "OEDE - Totales",                      "empleo3", "empleo_datos"),
    ("OEDE Asal rama",    "OEDE - Asalariados por Rama",         "empleo3", "empleo_datos"),
    ("OEDE Asal prov",    "OEDE - Asalariados por Provincia",    "empleo3", "empleo_datos"),
    ("OEDE Puestos Rama", "OEDE - Puestos por Rama",             "empleo3", "empleo_datos"),
    ("OEDE Puestos Sector","OEDE - Puestos por Sector",          "empleo3", "empleo_datos"),
    ("OEDE Remuneraciones","OEDE - Remuneraciones Totales",      "empleo3", "empleo_datos"),
    ("OEDE Remuneraciones Rama","OEDE - Remuneraciones por Rama","empleo3","empleo_datos"),
]

PRECIOS_FUENTES = [
    ("4.1.1 IPC NG",              "CUADRO 4.1.1", "IPC Nivel General — Nacional y Regiones",      "precios1", "series_ipc_indec"),
    ("4.1.2 IPC Capitulos",       "CUADRO 4.1.2", "IPC por Capítulos — Nacional y Regiones",      "precios1", "series_ipc_indec"),
    ("4.1.3 IPC Bs Ss",           "CUADRO 4.1.3", "IPC Bienes y Servicios — Nacional y Regiones", "precios1", "series_ipc_indec"),
    ("4.1.4 IPC Incidencia Cap",  "CUADRO 4.1.4", "Incidencia del IPC por Capítulos",             "precios1", "series_ipc_indec"),
    ("4.1.5 IPC Incidencia Bs Ss","CUADRO 4.1.5", "Incidencia IPC — Bienes y Servicios",          "precios1", "series_ipc_indec"),
    ("4.1.6 IPC Categorias",      "CUADRO 4.1.6", "IPC por Categorías — Nacional y Regiones",     "precios1", "series_ipc_indec"),
    ("4.1.7 Incidencia Cat",      "CUADRO 4.1.7", "Incidencia del IPC por Categorías",            "precios1", "series_ipc_indec"),
    ("4.1.8 IPC precios canasta", "CUADRO 4.1.8", "Precios de la Canasta del IPC",                "precios1", "series_ipc_indec"),
    ("4.2.1",                     "CUADRO 4.2.1", "IPC por División — Gran Buenos Aires",         "precios2", "series_apendice4"),
    ("4.2.2",                     "CUADRO 4.2.2", "IPC GBA — Bienes y Servicios",                 "precios2", "series_apendice4"),
    ("4.2.3",                     "CUADRO 4.2.3", "IPC GBA — Apertura Geográfica",                "precios2", "series_apendice4"),
    ("4.2.4",                     "CUADRO 4.2.4", "IPC GBA — Subgrupos COICOP",                   "precios2", "series_apendice4"),
    ("4.3.1 IPIM 4 dígitos",      "CUADRO 4.3.1", "IPIM por Actividad — 4 dígitos CIIU",         "precios2", "series_apendice4"),
    ("4.4.1 IPIB 4 dígitos",      "CUADRO 4.4.1", "IPIB por Actividad — 4 dígitos CIIU",         "precios2", "series_apendice4"),
    ("4.5.1 IPP 4 dígitos",       "CUADRO 4.5.1", "IPP por Actividad — 4 dígitos CIIU",          "precios2", "series_apendice4"),
    ("4.6 ICC",                   "CUADRO 4.6",   "Índice del Costo de la Construcción (ICC)",    "precios2", "series_apendice4"),
]

COMERCIO_DB_MAP = {f[0]: (f[3], f[4]) for f in COMERCIO_FUENTES}
EMPLEO_DB_MAP   = {f[0]: (f[2], f[3]) for f in EMPLEO_FUENTES}
PRECIOS_DB_MAP  = {f[0]: (f[3], f[4]) for f in PRECIOS_FUENTES}

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="EconSur Dataset Studio", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Health & Debug ────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    status = {k: v.exists() for k, v in DB_REGISTRY.items()}
    return {"status": "ok" if all(status.values()) else "degraded", "dbs": status,
            "static_ok": (STATIC_DIR / "index.html").exists(),
            "macro_series": len(_MACRO_METADATA)}

@app.get("/api/debug")
def debug():
    dirs = {}
    for name, d in [("macro", MACRO_DIR), ("comercio", COMERCIO_DIR),
                    ("empleo", EMPLEO_DIR), ("precios", PRECIOS_DIR)]:
        dirs[name] = [f.name for f in d.iterdir()] if d.exists() else []
    return {"version": "2.0.0", "static_exists": STATIC_DIR.exists(),
            "index_html": (STATIC_DIR / "index.html").exists(),
            "macro_series": len(_MACRO_METADATA),
            "dbs": {k: v.exists() for k, v in DB_REGISTRY.items()},
            "dirs": dirs}

# ── Repos ─────────────────────────────────────────────────────────────────────
@app.get("/api/repos")
def get_repos():
    return [
        {"repo": "macro",    "label": "Macroeconomía INDEC",
         "descripcion": "Cuentas nacionales, EMAE, IPI (~1980 series)",
         "available": DB_REGISTRY["macro1"].exists() or DB_REGISTRY["macro2"].exists()},
        {"repo": "comercio", "label": "Comercio Exterior ICA",
         "descripcion": "Exportaciones, importaciones, balanza de pagos (19 cuadros)",
         "available": DB_REGISTRY["comercio1"].exists() or DB_REGISTRY["comercio2"].exists()},
        {"repo": "empleo",   "label": "Empleo e Ingresos",
         "descripcion": "EPH, EIL, OEDE, salarios, canastas, pobreza (32 fuentes)",
         "available": DB_REGISTRY["empleo1"].exists() or DB_REGISTRY["empleo2"].exists()},
        {"repo": "precios",  "label": "Precios IPC",
         "descripcion": "IPC nacional y regional, IPIM, IPIB, ICC (16 cuadros)",
         "available": DB_REGISTRY["precios1"].exists() or DB_REGISTRY["precios2"].exists()},
    ]

# ── Fuentes ───────────────────────────────────────────────────────────────────
@app.get("/api/fuentes")
def get_fuentes(repo: str = Query(...)):
    if repo == "macro":
        return [{"fuente": c[0], "nombre": c[1], "db_key": c[2],
                 "available": DB_REGISTRY.get(c[2], Path()).exists()} for c in MACRO_CUADROS]
    if repo == "comercio":
        return [{"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3],
                 "available": DB_REGISTRY.get(f[3], Path()).exists()} for f in COMERCIO_FUENTES]
    if repo == "empleo":
        return [{"fuente": f[0], "nombre": f[1], "db_key": f[2],
                 "available": DB_REGISTRY.get(f[2], Path()).exists()} for f in EMPLEO_FUENTES]
    if repo == "precios":
        return [{"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3],
                 "available": DB_REGISTRY.get(f[3], Path()).exists()} for f in PRECIOS_FUENTES]
    raise HTTPException(400, f"repo='{repo}' no reconocido.")

# ── Frecuencias ───────────────────────────────────────────────────────────────
@app.get("/api/frecuencias")
def get_frecuencias(repo: str = Query(...), fuente: str = Query(...)):
    if repo == "macro":
        freqs = sorted({it["frecuencia"] for it in _MACRO_METADATA if it["cuadro"] == fuente},
                       key=lambda f: _FREQ_ORDER.get(f, 99))
        return freqs

    def _query_freq(db_key, table, col_fuente):
        conn = get_conn(db_key)
        try:
            rows = conn.execute(f"SELECT DISTINCT frecuencia FROM {table} WHERE {col_fuente}=?",
                                [fuente]).fetchall()
        finally:
            conn.close()
        return sorted(set(norm_freq(r["frecuencia"]) for r in rows),
                      key=lambda x: _FREQ_ORDER.get(x, 99))

    if repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        return _query_freq(info[0], info[1], "hoja_origen")
    if repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        return _query_freq(info[0], info[1], "ho_origen")
    if repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        return _query_freq(info[0], info[1], "hoja_origen")
    raise HTTPException(400)

# ── Series ────────────────────────────────────────────────────────────────────
@app.get("/api/series")
def get_series(repo: str = Query(...), fuente: str = Query(...), frecuencia: str = Query(...)):
    if repo == "macro":
        items = _MACRO_BY_CF.get((fuente, frecuencia), [])
        result = []
        for it in items:
            nombre = it["serie_nombre_final_simplified"]
            if it["local_idx"] > 0:
                nombre = f"{nombre}  [{it['unidad_orig']}]" if it["db_num_macro"] == 2 \
                         else f"{nombre} ({it['local_idx'] + 1})"
            result.append({"serie_id": f"macro:{it['meta_idx']}", "serie_nombre": nombre,
                            "serie_nombre_original": it["serie_nombre_final_simplified"],
                            "unidad": it["unidad_orig"], "meta_idx": it["meta_idx"]})
        return result

    def _query_series(db_key, table, col_fuente, freq_val):
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT serie_nombre FROM {table} "
                f"WHERE {col_fuente}=? AND frecuencia=? AND serie_nombre!='' ORDER BY serie_nombre",
                [fuente, freq_val]).fetchall()
        finally:
            conn.close()
        return rows

    if repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        freq_native = frecuencia.upper() if info[0] == "comercio2" else frecuencia
        rows = _query_series(info[0], info[1], "hoja_origen", freq_native)
        return [{"serie_id": f"comercio:{fuente}::{r['serie_nombre']}",
                 "serie_nombre": r["serie_nombre"]} for r in rows]
    if repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        rows = _query_series(info[0], info[1], "ho_origen", frecuencia)
        return [{"serie_id": f"empleo:{fuente}::{r['serie_nombre']}",
                 "serie_nombre": r["serie_nombre"]} for r in rows]
    if repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        rows = _query_series(info[0], info[1], "hoja_origen", frecuencia)
        return [{"serie_id": f"precios:{fuente}::{r['serie_nombre']}",
                 "serie_nombre": r["serie_nombre"]} for r in rows]
    raise HTTPException(400)

# ── Periodos ──────────────────────────────────────────────────────────────────
@app.get("/api/periodos")
def get_periodos(repo: str = Query(...), fuente: str = Query(...),
                 frecuencia: str = Query(...), serie: str = Query(...),
                 meta_idx: Optional[int] = Query(None)):
    rows = _fetch_rows(repo, fuente, frecuencia, serie, meta_idx)
    if not rows:
        return {"desde": None, "hasta": None}
    periodos = [r["periodo"][:10] for r in rows if r.get("periodo")]
    return {"desde": min(periodos), "hasta": max(periodos)}

# ── Core fetch logic ──────────────────────────────────────────────────────────
def _fetch_rows(repo, fuente, frecuencia, serie, meta_idx=None, desde=None, hasta=None):
    psql, pparams = "", []
    if desde:  psql += " AND periodo >= ?"; pparams.append(desde)
    if hasta:  psql += " AND periodo <= ?"; pparams.append(hasta)

    if repo == "macro":
        item = _MACRO_BY_IDX.get(meta_idx)
        if not item: raise HTTPException(404, f"meta_idx={meta_idx} no encontrado.")
        db_key, table = item["db_key"], item["table"]
        nombre, cuadro, freq = item["serie_nombre_final_simplified"], item["cuadro"], item["frecuencia"]
        local_idx, unidad = item["local_idx"], item["unidad_orig"]
        conn = get_conn(db_key)
        SEL = (f"SELECT periodo, valor, unidad, serie_nombre_final_simplified, "
               f"cuadro, frecuencia, hoja_origen FROM {table} ")
        try:
            if local_idx == 0:
                rows = conn.execute(SEL + "WHERE cuadro=? AND frecuencia=? AND "
                    "serie_nombre_final_simplified=?" + psql + " ORDER BY periodo",
                    [cuadro, freq, nombre] + pparams).fetchall()
                if rows and item["db_num_macro"] == 1:
                    fh = rows[0]["hoja_origen"]
                    rows = [r for r in rows if r["hoja_origen"] == fh]
            elif item["db_num_macro"] == 1:
                hojas = conn.execute(
                    f"SELECT DISTINCT hoja_origen FROM {table} WHERE cuadro=? AND "
                    "frecuencia=? AND serie_nombre_final_simplified=? ORDER BY hoja_origen",
                    [cuadro, freq, nombre]).fetchall()
                if local_idx >= len(hojas): return []
                rows = conn.execute(SEL + "WHERE cuadro=? AND frecuencia=? AND "
                    "serie_nombre_final_simplified=? AND hoja_origen=?" + psql + " ORDER BY periodo",
                    [cuadro, freq, nombre, hojas[local_idx]["hoja_origen"]] + pparams).fetchall()
            else:
                rows = conn.execute(SEL + "WHERE cuadro=? AND frecuencia=? AND "
                    "serie_nombre_final_simplified=? AND unidad=?" + psql + " ORDER BY periodo",
                    [cuadro, freq, nombre, unidad] + pparams).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r["unidad"]} for r in rows]

    if repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        db_key, table = info
        freq_native = frecuencia.upper() if db_key == "comercio2" else frecuencia
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, serie_nombre FROM {table} "
                "WHERE hoja_origen=? AND frecuencia=? AND serie_nombre=?" + psql + " ORDER BY periodo",
                [fuente, freq_native, serie] + pparams).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None, "valor": r["valor"]} for r in rows]

    if repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, unidad FROM {table} "
                "WHERE ho_origen=? AND frecuencia=? AND serie_nombre=?" + psql + " ORDER BY periodo",
                [fuente, frecuencia, serie] + pparams).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r.get("unidad", "")} for r in rows]

    if repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info: raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, unidad FROM {table} "
                "WHERE hoja_origen=? AND frecuencia=? AND serie_nombre=?" + psql + " ORDER BY periodo",
                [fuente, frecuencia, serie] + pparams).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r.get("unidad", "")} for r in rows]

    raise HTTPException(400, f"repo='{repo}' no reconocido.")

# ── Datos ─────────────────────────────────────────────────────────────────────
@app.get("/api/datos")
def get_datos(repo: str = Query(...), fuente: str = Query(...),
              frecuencia: str = Query(...), serie: str = Query(...),
              desde: str = Query(...), hasta: str = Query(...),
              meta_idx: Optional[int] = Query(None)):
    if desde > hasta: raise HTTPException(400, "'desde' debe ser ≤ 'hasta'.")
    rows = _fetch_rows(repo, fuente, frecuencia, serie, meta_idx, desde, hasta)
    return {"datos": rows, "meta": {"repo": repo, "fuente": fuente, "serie": serie,
                                    "frecuencia": frecuencia, "total": len(rows)}}

# ── Dataset build ─────────────────────────────────────────────────────────────
class SerieRef(BaseModel):
    repo: str
    fuente: str
    frecuencia: str
    serie: str
    label: str
    meta_idx: Optional[int] = None

class DatasetRequest(BaseModel):
    nombre: str
    series: List[SerieRef]
    desde: str
    hasta: str
    frecuencia: str

@app.post("/api/dataset/build")
def build_dataset(req: DatasetRequest):
    if len(req.series) > 20:
        raise HTTPException(400, "Máximo 20 series por dataset.")
    result: Dict[str, Any] = {"nombre": req.nombre, "columnas": [], "data": []}
    dfs: List[pd.DataFrame] = []
    for ref in req.series:
        try:
            rows = _fetch_rows(ref.repo, ref.fuente, ref.frecuencia,
                               ref.serie, ref.meta_idx, req.desde, req.hasta)
            if not rows: continue
            df = pd.DataFrame(rows)
            df["periodo"] = pd.to_datetime(df["periodo"], errors="coerce")
            df = df.dropna(subset=["periodo", "valor"])
            df = df.set_index("periodo")[["valor"]].rename(columns={"valor": ref.label})
            dfs.append(df)
            result["columnas"].append({"label": ref.label, "repo": ref.repo, "serie": ref.serie,
                                       "unidad": rows[0].get("unidad", "") if rows else ""})
        except Exception as e:
            log.warning(f"Error fetching {ref.serie}: {e}")
    if dfs:
        merged = pd.concat(dfs, axis=1).sort_index()
        merged.index = merged.index.strftime("%Y-%m-%d")
        result["data"] = merged.reset_index().rename(columns={"index": "periodo"}).to_dict(orient="records")
    return result

@app.post("/api/dataset/export/csv")
def export_dataset_csv(req: DatasetRequest):
    result = build_dataset(req)
    buf = io.StringIO()
    buf.write(f"# Dataset: {req.nombre}\n# Período: {req.desde} → {req.hasta}\n")
    buf.write(f"# Frecuencia: {req.frecuencia}\n")
    data = result.get("data", [])
    if data:
        headers = list(data[0].keys())
        buf.write(",".join(headers) + "\n")
        for row in data:
            buf.write(",".join(str(row.get(h, "")) for h in headers) + "\n")
    buf.seek(0)
    fname = f"econsur_{req.nombre[:30]}_{req.desde}_{req.hasta}.csv".replace(" ", "_")
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"})

# ── Frontend — SPA fallback ───────────────────────────────────────────────────
# IMPORTANTE: el mount de StaticFiles debe ir AL FINAL,
# después de todos los endpoints /api/*, para no interceptarlos.
if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets") \
        if (STATIC_DIR / "assets").exists() else None
    app.mount("/static-files", StaticFiles(directory=str(STATIC_DIR)), name="static-files")
    log.info(f"Frontend estático disponible en {STATIC_DIR}")
else:
    log.warning("Frontend no encontrado en backend/static/. "
                "Ejecutá: cd frontend && npm run build && cp -r dist ../backend/static")

@app.get("/", response_class=HTMLResponse)
@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa_fallback(full_path: str = ""):
    # No interceptar rutas /api/*
    if full_path.startswith("api/"):
        raise HTTPException(404)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    return HTMLResponse(
        "<h1 style='font-family:sans-serif;padding:40px'>EconSur API está corriendo ✓<br>"
        "<small style='color:#888'>Frontend no compilado aún. "
        "Ver /api/health para estado de las bases.</small></h1>",
        status_code=200
    )
