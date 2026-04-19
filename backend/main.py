"""
EconSur Dataset Full — Estación de Trabajo Macroeconómica Unificada
Consolida 4 fuentes de datos:
  1. macro_indec  → Series macroeconómicas INDEC (Cuentas Nacionales)
  2. saldo_comercial → Comercio Exterior (ICA)
  3. empleo_ingresos → Empleo e Ingresos (EPH, EIL, OEDE)
  4. precios_ipc → Precios IPC Argentina

Backend: FastAPI + SQLite + Pandas
"""

import sqlite3
import io
import json
import logging
import re
from pathlib import Path
from collections import defaultdict
from typing import Optional, List, Dict, Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE RUTAS
# Los repos originales se clonan como submódulos/subcarpetas bajo data/
# Estructura esperada:
#   data/
#     macro_indec/          ← repo econsur_macro_indec
#       macro_indec1.db
#       macro_indec2_final.db
#       series_metadata1.json
#       series_metadata2_final.json
#     saldo_comercial/      ← repo econsur_saldo_comercial
#       saldo_comercial1.db
#       saldo_comercial2.db
#     empleo_ingresos/      ← repo econsur_empleo_ingresos
#       empleo_e_ingresos.db
#       empleo_e_ingresos2.db
#       empleo_e_ingresos3.db
#     precios_ipc/          ← repo econsur_precios_ipc
#       data_ipc_indec.db
#       data_apendice4.db
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

STATIC_DIR = BASE_DIR / "static"

# ── Paths por fuente ──────────────────────────────────────────────────────────
MACRO_DIR    = DATA_DIR / "macro_indec"
COMERCIO_DIR = DATA_DIR / "saldo_comercial"
EMPLEO_DIR   = DATA_DIR / "empleo_ingresos"
PRECIOS_DIR  = DATA_DIR / "precios_ipc"

for d in [MACRO_DIR, COMERCIO_DIR, EMPLEO_DIR, PRECIOS_DIR]:
    d.mkdir(exist_ok=True)

# ── DB registry ──────────────────────────────────────────────────────────────
# Cada entrada: db_key → Path
DB_REGISTRY: Dict[str, Path] = {
    # Macro INDEC
    "macro1":    MACRO_DIR / "macro_indec1.db",
    "macro2":    MACRO_DIR / "macro_indec2_final.db",
    # Saldo Comercial
    "comercio1": COMERCIO_DIR / "saldo_comercial1.db",
    "comercio2": COMERCIO_DIR / "saldo_comercial2.db",
    # Empleo e Ingresos
    "empleo1":   EMPLEO_DIR / "empleo_e_ingresos.db",
    "empleo2":   EMPLEO_DIR / "empleo_e_ingresos2.db",
    "empleo3":   EMPLEO_DIR / "empleo_e_ingresos3.db",
    # Precios IPC
    "precios1":  PRECIOS_DIR / "data_ipc_indec.db",
    "precios2":  PRECIOS_DIR / "data_apendice4.db",
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
        raise HTTPException(
            503,
            detail=f"Base de datos '{path.name}' no disponible. Verificar carpeta data/{path.parent.name}/",
        )
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


# ── Normalización de frecuencias ──────────────────────────────────────────────
_FREQ_NORM = {
    "ANUAL": "Anual", "TRIMESTRAL": "Trimestral",
    "MENSUAL": "Mensual", "SEMESTRAL": "Semestral",
    "Anual": "Anual", "Trimestral": "Trimestral",
    "Mensual": "Mensual", "Semestral": "Semestral",
}
_FREQ_ORDER = {"Anual": 0, "Semestral": 1, "Trimestral": 2, "Mensual": 3}


def norm_freq(raw: str) -> str:
    return _FREQ_NORM.get(raw, raw.title())


# ─────────────────────────────────────────────────────────────────────────────
# CATÁLOGOS DE FUENTES (1 estructura unificada)
# Cada entrada: {
#   source_id:    str  (identificador único global)
#   repo:         str  (macro | comercio | empleo | precios)
#   fuente:       str  (hoja_origen / cuadro_id nativo)
#   nombre:       str
#   descripcion:  str
#   db_key:       str
#   table:        str
#   query_type:   str  (simple | macro_meta)
#   meta_idx_map: dict (solo para macro_meta)
# }
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. MACRO INDEC (metadata-based) ──────────────────────────────────────────
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
                items.append({
                    **item,
                    "local_idx": local_idx,
                    "db_key": db_key,
                    "table": table,
                    "db_num_macro": db_num,
                    "unidad_orig": item.get("unidad", ""),
                })
        except Exception as e:
            log.error(f"Error cargando {meta_path}: {e}")
    # Asignar meta_idx global
    result = []
    for i, item in enumerate(items):
        result.append({**item, "meta_idx": i})
    return result


_MACRO_METADATA: List[Dict] = _load_macro_metadata()
_MACRO_BY_IDX:   Dict[int, Dict] = {it["meta_idx"]: it for it in _MACRO_METADATA}
_MACRO_BY_CF:    Dict[tuple, List[Dict]] = defaultdict(list)
for _it in _MACRO_METADATA:
    _MACRO_BY_CF[(_it["cuadro"], _it["frecuencia"])].append(_it)

MACRO_CUADROS = [
    ("CUADRO 1.2.1",  "Oferta y Demanda Globales - desestacionalizadas",               "macro1"),
    ("CUADRO 1.3.1",  "Producto Interno Bruto, precios constantes",                    "macro1"),
    ("CUADRO 1.3.2",  "Valor Agregado Bruto por rama - precios constantes",            "macro1"),
    ("CUADRO 1.3.3",  "Valor Bruto de Producción por rama - precios constantes",       "macro1"),
    ("CUADRO 1.4.1",  "EMAE - nivel general y componentes",                            "macro1"),
    ("CUADRO 1.5.1",  "Oferta y Demanda Globales por componente",                      "macro1"),
    ("CUADRO 1.6.1",  "PIB - precios corrientes",                                      "macro1"),
    ("CUADRO 1.6.2",  "Valor Agregado Bruto por rama - precios corrientes",            "macro1"),
    ("CUADRO 1.6.3",  "Valor Bruto de Producción por rama - precios corrientes",       "macro1"),
    ("CUADRO 1.7.1",  "PIB - Índice de precios implícitos",                            "macro1"),
    ("CUADRO 1.7.1B", "Oferta y demanda globales - precios implícitos",                "macro1"),
    ("CUADRO 1.7.2",  "Índice de Precios Implícitos del VAB por rama",                 "macro1"),
    ("CUADRO 1.8",    "PIB en dólares, PIB per cápita, TCN y Población",               "macro1"),
    ("CUADRO 1.10.1", "Estadísticas de Servicios Públicos",                            "macro1"),
    ("CUADRO 1.11.1", "Encuesta de Supermercados",                                     "macro2"),
    ("CUADRO 1.11.2", "Encuesta de Autoservicios Mayoristas",                          "macro2"),
    ("CUADRO 1.12.1", "Encuesta de Centros de Compras",                                "macro2"),
    ("CUADRO 1.13",   "Ventas al Mercado Interno de Producción Nacional",              "macro2"),
    ("CUADRO 1.14",   "IPI Manufacturero - Nivel General y Divisiones",                "macro2"),
    ("CUADRO 1.16C",  "Utilización de la Capacidad Instalada en la Industria",         "macro2"),
    ("CUADRO 1.17",   "Indicadores de Producción de la Industria Manufacturera",       "macro2"),
    ("CUADRO 1.18B",  "ISAC - Construcción",                                           "macro2"),
    ("CUADRO 1.20",   "Faena de Ganado",                                               "macro2"),
    ("CUADRO 1.22",   "Industria Automotriz",                                          "macro2"),
    ("CUADRO 1.23",   "Industria Siderúrgica",                                         "macro2"),
    ("CUADRO 1.24",   "Producción y Ventas de Petróleo y Derivados",                   "macro2"),
    ("CUADRO 1.25",   "Producción y Consumo de Gas Natural",                           "macro2"),
    ("CUADRO 1.28",   "Demanda de Electricidad",                                       "macro2"),
    ("CUADRO 1.30",   "Índice de Confianza del Consumidor (ICC)",                      "macro2"),
    ("CUADRO 1.31",   "Encuesta de Ocupación Hotelera (EOH)",                          "macro2"),
    ("CUADRO 1.32",   "Índice de Confianza en el Gobierno (ICG)",                      "macro2"),
]

# ── 2. SALDO COMERCIAL ────────────────────────────────────────────────────────
COMERCIO_FUENTES = [
    ("1. ICA",                          "CUADRO 1",  "Intercambio Comercial Argentino",                 "comercio1", "saldo_comercial"),
    ("2. X Rubro",                      "CUADRO 2",  "Exportaciones FOB por Rubro",                     "comercio1", "saldo_comercial"),
    ("3. M usos",                       "CUADRO 3",  "Importaciones CIF por Uso Económico",             "comercio1", "saldo_comercial"),
    ("7. X Paises",                     "CUADRO 7",  "Exportaciones FOB por Países y Regiones",         "comercio1", "saldo_comercial"),
    ("8. M Paises",                     "CUADRO 8",  "Importaciones CIF por Regiones y Países",         "comercio1", "saldo_comercial"),
    ("9. Saldo Paises",                 "CUADRO 9",  "Saldo Comercial por Países y Regiones",           "comercio1", "saldo_comercial"),
    ("10. X pyq",                       "CUADRO 10", "Índices de Exportaciones (valor, precio, cant.)", "comercio2", "series_datos"),
    ("11. M pyq",                       "CUADRO 11", "Índices de Importaciones (valor, precio, cant.)", "comercio2", "series_datos"),
    ("12. TdI",                         "CUADRO 12", "Índices de Términos del Intercambio",             "comercio2", "series_datos"),
    ("13. Poder de Compra X",           "CUADRO 13", "Poder de Compra de las Exportaciones",            "comercio2", "series_datos"),
    ("14.a Bce Pagos 6-17",             "CUADRO 14", "Estimación del Balance de Pagos",                 "comercio2", "series_datos"),
    ("15.a Deuda Ext. Bruta x S. 6-17", "CUADRO 15", "Deuda Externa Bruta por Sector Residente",       "comercio2", "series_datos"),
    ("17. ETI",                         "CUADRO 34", "Encuesta de Turismo Internacional (ETI)",         "comercio2", "series_datos"),
    ("18. IPMP",                        "CUADRO 18", "Índice de Precios de Materias Primas (IPMP)",     "comercio2", "series_datos"),
    ("20.Balance cambiario",            "CUADRO 20", "Balance Cambiario",                               "comercio2", "series_datos"),
    ("21.Bienes por modalidad de pago", "CUADRO 21", "Cobros y Pagos por Bienes — Modalidad",          "comercio2", "series_datos"),
    ("22.Bienes por sector",            "CUADRO 22", "Cobros y Pagos por Bienes — Sector",             "comercio2", "series_datos"),
    ("23.Servicios por tipo",           "CUADRO 23", "Cobros y Pagos por Tipo de Servicio",            "comercio2", "series_datos"),
    ("35. Liquidaciones OyC CIARA-CEC", "CUADRO 36", "Liquidaciones CIARA-CEC",                        "comercio2", "series_datos"),
]

# ── 3. EMPLEO E INGRESOS ──────────────────────────────────────────────────────
EMPLEO_FUENTES = [
    ("EPH",              "EPH - Tasas generales",              "empleo1", "empleo_datos"),
    ("EPH - Asal",       "EPH - Asalariados",                  "empleo1", "empleo_datos"),
    ("EPH-Poblaciones",  "EPH - Poblaciones",                  "empleo1", "empleo_datos"),
    ("TA 03-",           "Tasa de Actividad (2003-)",           "empleo1", "empleo_datos"),
    ("TD 03-",           "Tasa de Desocupación (2003-)",        "empleo1", "empleo_datos"),
    ("TE 03-",           "Tasa de Empleo (2003-)",              "empleo1", "empleo_datos"),
    ("TS 03-",           "Tasa de Subocupación (2003-)",        "empleo1", "empleo_datos"),
    ("TSD 03-",          "Tasa de Suboc. Demandante (2003-)",   "empleo1", "empleo_datos"),
    ("TSND 03-",         "Tasa de Suboc. No Dem. (2003-)",      "empleo1", "empleo_datos"),
    ("EIL - Aglo",       "EIL - Por Aglomerado",               "empleo1", "empleo_datos"),
    ("EIL - Sector",     "EIL - Por Sector",                   "empleo1", "empleo_datos"),
    ("EAHU-Tasas",       "EAHU - Tasas",                       "empleo1", "empleo_datos"),
    ("EAHU-Poblaciones", "EAHU - Poblaciones",                 "empleo1", "empleo_datos"),
    ("CGI-2016",         "CGI - Costo Salarial Total",         "empleo2", "empleo_datos"),
    ("CGI ManodeObra",   "CGI - Mano de Obra",                 "empleo2", "empleo_datos"),
    ("CGI VABpb",        "CGI - VAB pb",                       "empleo2", "empleo_datos"),
    ("IS oct16=100",     "Índice de Salarios",                 "empleo2", "empleo_datos"),
    ("RIPTE",            "RIPTE",                              "empleo2", "empleo_datos"),
    ("SMVM",             "Salario Mínimo (SMVM)",              "empleo2", "empleo_datos"),
    ("HaberMin",         "Haber Mínimo Jubilatorio",           "empleo2", "empleo_datos"),
    ("CBA y CBT 2016",   "CBA y CBT",                          "empleo2", "empleo_datos"),
    ("LP - Pers",        "Línea de Pobreza",                   "empleo2", "empleo_datos"),
    ("DP",               "Distribución del Ingreso",           "empleo2", "empleo_datos"),
    ("DP Deciles",       "Distribución por Deciles",           "empleo2", "empleo_datos"),
    ("AUH",              "Asignación Universal por Hijo (AUH)","empleo2", "empleo_datos"),
    ("OEDE Total",       "OEDE - Totales",                     "empleo3", "empleo_datos"),
    ("OEDE Asal rama",   "OEDE - Asalariados por Rama",        "empleo3", "empleo_datos"),
    ("OEDE Asal prov",   "OEDE - Asalariados por Provincia",   "empleo3", "empleo_datos"),
    ("OEDE Puestos Rama","OEDE - Puestos por Rama",            "empleo3", "empleo_datos"),
    ("OEDE Puestos Sector","OEDE - Puestos por Sector",        "empleo3", "empleo_datos"),
    ("OEDE Remuneraciones","OEDE - Remuneraciones Totales",    "empleo3", "empleo_datos"),
    ("OEDE Remuneraciones Rama","OEDE - Remuneraciones por Rama","empleo3","empleo_datos"),
]

# ── 4. PRECIOS IPC ────────────────────────────────────────────────────────────
PRECIOS_FUENTES = [
    ("4.1.1 IPC NG",           "CUADRO 4.1.1", "IPC Nivel General — Nacional y Regiones",       "precios1", "series_ipc_indec"),
    ("4.1.2 IPC Capitulos",    "CUADRO 4.1.2", "IPC por Capítulos — Nacional y Regiones",       "precios1", "series_ipc_indec"),
    ("4.1.3 IPC Bs Ss",        "CUADRO 4.1.3", "IPC Bienes y Servicios — Nacional y Regiones",  "precios1", "series_ipc_indec"),
    ("4.1.4 IPC Incidencia Cap","CUADRO 4.1.4","Incidencia del IPC por Capítulos",               "precios1", "series_ipc_indec"),
    ("4.1.5 IPC Incidencia Bs Ss","CUADRO 4.1.5","Incidencia IPC — Bienes y Servicios",         "precios1", "series_ipc_indec"),
    ("4.1.6 IPC Categorias",   "CUADRO 4.1.6", "IPC por Categorías — Nacional y Regiones",      "precios1", "series_ipc_indec"),
    ("4.1.7 Incidencia Cat",   "CUADRO 4.1.7", "Incidencia del IPC por Categorías",             "precios1", "series_ipc_indec"),
    ("4.1.8 IPC precios canasta","CUADRO 4.1.8","Precios de la Canasta del IPC",                "precios1", "series_ipc_indec"),
    ("4.2.1",                  "CUADRO 4.2.1", "IPC por División — Gran Buenos Aires",          "precios2", "series_apendice4"),
    ("4.2.2",                  "CUADRO 4.2.2", "IPC GBA — Bienes y Servicios",                  "precios2", "series_apendice4"),
    ("4.2.3",                  "CUADRO 4.2.3", "IPC GBA — Apertura Geográfica",                 "precios2", "series_apendice4"),
    ("4.2.4",                  "CUADRO 4.2.4", "IPC GBA — Subgrupos COICOP",                    "precios2", "series_apendice4"),
    ("4.3.1 IPIM 4 dígitos",   "CUADRO 4.3.1", "IPIM por Actividad — 4 dígitos CIIU",          "precios2", "series_apendice4"),
    ("4.4.1 IPIB 4 dígitos",   "CUADRO 4.4.1", "IPIB por Actividad — 4 dígitos CIIU",          "precios2", "series_apendice4"),
    ("4.5.1 IPP 4 dígitos",    "CUADRO 4.5.1", "IPP por Actividad — 4 dígitos CIIU",           "precios2", "series_apendice4"),
    ("4.6 ICC",                "CUADRO 4.6",   "Índice del Costo de la Construcción (ICC)",     "precios2", "series_apendice4"),
]

# ── Lookup maps ───────────────────────────────────────────────────────────────
COMERCIO_DB_MAP  = {f[0]: (f[3], f[4]) for f in COMERCIO_FUENTES}
EMPLEO_DB_MAP    = {f[0]: (f[2], f[3]) for f in EMPLEO_FUENTES}
PRECIOS_DB_MAP   = {f[0]: (f[3], f[4]) for f in PRECIOS_FUENTES}

REPO_LABELS = {
    "macro":    "Macroeconomía INDEC",
    "comercio": "Comercio Exterior ICA",
    "empleo":   "Empleo e Ingresos",
    "precios":  "Precios IPC",
}

# ─────────────────────────────────────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="EconSur — Estación Macroeconómica Unificada",
    description="Consolida series de Macro INDEC, Comercio Exterior, Empleo e Ingresos, y Precios IPC",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS CATÁLOGO
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    status = {k: v.exists() for k, v in DB_REGISTRY.items()}
    all_ok = all(status.values())
    return {"status": "ok" if all_ok else "degraded", "dbs": status}


@app.get("/api/debug")
def debug():
    dirs = {}
    for name, d in [("macro", MACRO_DIR), ("comercio", COMERCIO_DIR),
                    ("empleo", EMPLEO_DIR), ("precios", PRECIOS_DIR)]:
        dirs[name] = [f.name for f in d.iterdir()] if d.exists() else []
    return {
        "version": "1.0.0",
        "macro_series": len(_MACRO_METADATA),
        "dirs": dirs,
        "dbs": {k: v.exists() for k, v in DB_REGISTRY.items()},
    }


@app.get("/api/repos")
def get_repos():
    """Lista los 4 repositorios/fuentes con disponibilidad."""
    return [
        {
            "repo": "macro",
            "label": "Macroeconomía INDEC",
            "descripcion": "Cuentas nacionales, EMAE, IPI, demanda, servicios (31 cuadros, ~1980 series)",
            "available": DB_REGISTRY["macro1"].exists() or DB_REGISTRY["macro2"].exists(),
        },
        {
            "repo": "comercio",
            "label": "Comercio Exterior ICA",
            "descripcion": "Exportaciones, importaciones, balanza de pagos, deuda externa (19 cuadros)",
            "available": DB_REGISTRY["comercio1"].exists() or DB_REGISTRY["comercio2"].exists(),
        },
        {
            "repo": "empleo",
            "label": "Empleo e Ingresos",
            "descripcion": "EPH, EIL, EAHU, OEDE, salarios, canastas, pobreza (32 fuentes)",
            "available": DB_REGISTRY["empleo1"].exists() or DB_REGISTRY["empleo2"].exists() or DB_REGISTRY["empleo3"].exists(),
        },
        {
            "repo": "precios",
            "label": "Precios IPC",
            "descripcion": "IPC nacional y regional, IPIM, IPIB, IPP, ICC (16 cuadros)",
            "available": DB_REGISTRY["precios1"].exists() or DB_REGISTRY["precios2"].exists(),
        },
    ]


@app.get("/api/fuentes")
def get_fuentes(repo: str = Query(...)):
    """Cuadros/fuentes disponibles para un repositorio."""
    if repo == "macro":
        return [
            {"fuente": c[0], "nombre": c[1], "db_key": c[2],
             "available": DB_REGISTRY.get(c[2], Path()).exists()}
            for c in MACRO_CUADROS
        ]
    elif repo == "comercio":
        return [
            {"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3],
             "available": DB_REGISTRY.get(f[3], Path()).exists()}
            for f in COMERCIO_FUENTES
        ]
    elif repo == "empleo":
        return [
            {"fuente": f[0], "nombre": f[1], "db_key": f[2],
             "available": DB_REGISTRY.get(f[2], Path()).exists()}
            for f in EMPLEO_FUENTES
        ]
    elif repo == "precios":
        return [
            {"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3],
             "available": DB_REGISTRY.get(f[3], Path()).exists()}
            for f in PRECIOS_FUENTES
        ]
    else:
        raise HTTPException(400, detail=f"repo='{repo}' no reconocido.")


@app.get("/api/frecuencias")
def get_frecuencias(repo: str = Query(...), fuente: str = Query(...)):
    if repo == "macro":
        freqs = sorted(
            {it["frecuencia"] for it in _MACRO_METADATA if it["cuadro"] == fuente},
            key=lambda f: _FREQ_ORDER.get(f, 99),
        )
        return freqs

    elif repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404, f"Fuente comercio '{fuente}' no encontrada.")
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT frecuencia FROM {table} WHERE hoja_origen=?", [fuente]
            ).fetchall()
        finally:
            conn.close()
        normed = sorted(set(norm_freq(r["frecuencia"]) for r in rows),
                        key=lambda x: _FREQ_ORDER.get(x, 99))
        return normed

    elif repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404, f"Fuente empleo '{fuente}' no encontrada.")
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT frecuencia FROM {table} WHERE ho_origen=?", [fuente]
            ).fetchall()
        finally:
            conn.close()
        freqs = sorted(set(norm_freq(r["frecuencia"]) for r in rows),
                       key=lambda f: _FREQ_ORDER.get(f, 99))
        return freqs

    elif repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404, f"Fuente precios '{fuente}' no encontrada.")
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT frecuencia FROM {table} WHERE hoja_origen=?", [fuente]
            ).fetchall()
        finally:
            conn.close()
        normed = sorted(set(norm_freq(r["frecuencia"]) for r in rows),
                        key=lambda x: _FREQ_ORDER.get(x, 99))
        return normed

    raise HTTPException(400, f"repo='{repo}' no reconocido.")


@app.get("/api/series")
def get_series(repo: str = Query(...), fuente: str = Query(...), frecuencia: str = Query(...)):
    if repo == "macro":
        items = _MACRO_BY_CF.get((fuente, frecuencia), [])
        result = []
        for it in items:
            nombre = it["serie_nombre_final_simplified"]
            if it["local_idx"] > 0:
                if it["db_num_macro"] == 2:
                    nombre = f"{nombre}  [{it['unidad_orig']}]"
                else:
                    nombre = f"{nombre} ({it['local_idx'] + 1})"
            result.append({
                "serie_id": f"macro:{it['meta_idx']}",
                "serie_nombre": nombre,
                "serie_nombre_original": it["serie_nombre_final_simplified"],
                "unidad": it["unidad_orig"],
                "meta_idx": it["meta_idx"],
            })
        return result

    elif repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        freq_native = frecuencia.upper() if db_key == "comercio2" else frecuencia
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT serie_nombre FROM {table} "
                f"WHERE hoja_origen=? AND frecuencia=? AND serie_nombre!='' ORDER BY serie_nombre",
                [fuente, freq_native],
            ).fetchall()
        finally:
            conn.close()
        return [{"serie_id": f"comercio:{fuente}::{r['serie_nombre']}", "serie_nombre": r["serie_nombre"]} for r in rows]

    elif repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT serie_nombre, unidad FROM {table} "
                f"WHERE ho_origen=? AND frecuencia=? AND serie_nombre!='' ORDER BY serie_nombre",
                [fuente, frecuencia],
            ).fetchall()
        finally:
            conn.close()
        return [{"serie_id": f"empleo:{fuente}::{r['serie_nombre']}", "serie_nombre": r["serie_nombre"], "unidad": r["unidad"]} for r in rows]

    elif repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT DISTINCT serie_nombre FROM {table} "
                f"WHERE hoja_origen=? AND frecuencia=? AND serie_nombre!='' ORDER BY serie_nombre",
                [fuente, frecuencia],
            ).fetchall()
        finally:
            conn.close()
        return [{"serie_id": f"precios:{fuente}::{r['serie_nombre']}", "serie_nombre": r["serie_nombre"]} for r in rows]

    raise HTTPException(400, f"repo='{repo}' no reconocido.")


@app.get("/api/periodos")
def get_periodos(
    repo: str = Query(...),
    fuente: str = Query(...),
    frecuencia: str = Query(...),
    serie: str = Query(...),
    meta_idx: Optional[int] = Query(None),
):
    rows = _fetch_data_rows(repo, fuente, frecuencia, serie, meta_idx)
    if not rows:
        return {"desde": None, "hasta": None}
    periodos = [r["periodo"][:10] for r in rows if r.get("periodo")]
    return {"desde": min(periodos), "hasta": max(periodos)}


def _fetch_data_rows(repo, fuente, frecuencia, serie, meta_idx=None, desde=None, hasta=None):
    period_sql = ""
    period_params = []
    if desde:
        period_sql += " AND periodo >= ?"
        period_params.append(desde)
    if hasta:
        period_sql += " AND periodo <= ?"
        period_params.append(hasta)

    if repo == "macro":
        item = _MACRO_BY_IDX.get(meta_idx)
        if not item:
            raise HTTPException(404, f"meta_idx={meta_idx} no encontrado.")
        db_key = item["db_key"]
        table  = item["table"]
        nombre = item["serie_nombre_final_simplified"]
        cuadro = item["cuadro"]
        freq   = item["frecuencia"]
        local_idx = item["local_idx"]
        unidad = item["unidad_orig"]
        conn = get_conn(db_key)
        try:
            SELECT = (f"SELECT periodo, valor, unidad, serie_nombre_final_simplified, "
                      f"cuadro, frecuencia, hoja_origen FROM {table} ")
            if local_idx == 0:
                rows = conn.execute(
                    SELECT + "WHERE cuadro=? AND frecuencia=? AND serie_nombre_final_simplified=?"
                    + period_sql + " ORDER BY periodo",
                    [cuadro, freq, nombre] + period_params,
                ).fetchall()
                if rows and item["db_num_macro"] == 1:
                    first_hoja = rows[0]["hoja_origen"]
                    rows = [r for r in rows if r["hoja_origen"] == first_hoja]
            elif item["db_num_macro"] == 1:
                hojas = conn.execute(
                    f"SELECT DISTINCT hoja_origen FROM {table} WHERE cuadro=? AND frecuencia=? AND serie_nombre_final_simplified=? ORDER BY hoja_origen",
                    [cuadro, freq, nombre],
                ).fetchall()
                if local_idx >= len(hojas):
                    return []
                target_hoja = hojas[local_idx]["hoja_origen"]
                rows = conn.execute(
                    SELECT + "WHERE cuadro=? AND frecuencia=? AND serie_nombre_final_simplified=? AND hoja_origen=?"
                    + period_sql + " ORDER BY periodo",
                    [cuadro, freq, nombre, target_hoja] + period_params,
                ).fetchall()
            else:
                rows = conn.execute(
                    SELECT + "WHERE cuadro=? AND frecuencia=? AND serie_nombre_final_simplified=? AND unidad=?"
                    + period_sql + " ORDER BY periodo",
                    [cuadro, freq, nombre, unidad] + period_params,
                ).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r["unidad"]} for r in rows]

    elif repo == "comercio":
        info = COMERCIO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        freq_native = frecuencia.upper() if db_key == "comercio2" else frecuencia
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, serie_nombre FROM {table} "
                f"WHERE hoja_origen=? AND frecuencia=? AND serie_nombre=?"
                + period_sql + " ORDER BY periodo",
                [fuente, freq_native, serie] + period_params,
            ).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"]} for r in rows]

    elif repo == "empleo":
        info = EMPLEO_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, unidad FROM {table} "
                f"WHERE ho_origen=? AND frecuencia=? AND serie_nombre=?"
                + period_sql + " ORDER BY periodo",
                [fuente, frecuencia, serie] + period_params,
            ).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r.get("unidad", "")} for r in rows]

    elif repo == "precios":
        info = PRECIOS_DB_MAP.get(fuente)
        if not info:
            raise HTTPException(404)
        db_key, table = info
        conn = get_conn(db_key)
        try:
            rows = conn.execute(
                f"SELECT periodo, valor, unidad FROM {table} "
                f"WHERE hoja_origen=? AND frecuencia=? AND serie_nombre=?"
                + period_sql + " ORDER BY periodo",
                [fuente, frecuencia, serie] + period_params,
            ).fetchall()
        finally:
            conn.close()
        return [{"periodo": r["periodo"][:10] if r["periodo"] else None,
                 "valor": r["valor"], "unidad": r.get("unidad", "")} for r in rows]

    raise HTTPException(400, f"repo='{repo}' no reconocido.")


@app.get("/api/datos")
def get_datos(
    repo: str = Query(...),
    fuente: str = Query(...),
    frecuencia: str = Query(...),
    serie: str = Query(...),
    desde: str = Query(...),
    hasta: str = Query(...),
    meta_idx: Optional[int] = Query(None),
):
    if desde > hasta:
        raise HTTPException(400, "'desde' debe ser ≤ 'hasta'.")
    rows = _fetch_data_rows(repo, fuente, frecuencia, serie, meta_idx, desde, hasta)
    return {
        "datos": rows,
        "meta": {
            "repo": repo,
            "fuente": fuente,
            "serie": serie,
            "frecuencia": frecuencia,
            "desde": desde,
            "hasta": hasta,
            "total": len(rows),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT DATASET — Consolida múltiples series en un DataFrame alineado
# ─────────────────────────────────────────────────────────────────────────────

class SerieRef(BaseModel):
    repo: str
    fuente: str
    frecuencia: str
    serie: str
    label: str
    meta_idx: Optional[int] = None


class DatasetRequest(BaseModel):
    nombre: str
    series: List[SerieRef]          # máx 20
    desde: str
    hasta: str
    frecuencia: str                 # frecuencia global target


@app.post("/api/dataset/build")
def build_dataset(req: DatasetRequest):
    if len(req.series) > 20:
        raise HTTPException(400, "Máximo 20 series por dataset.")

    result: Dict[str, Any] = {"nombre": req.nombre, "columnas": [], "periodos": []}
    dfs: List[pd.DataFrame] = []

    for ref in req.series:
        try:
            rows = _fetch_data_rows(
                ref.repo, ref.fuente, ref.frecuencia,
                ref.serie, ref.meta_idx, req.desde, req.hasta,
            )
            if not rows:
                continue
            df = pd.DataFrame(rows)
            df["periodo"] = pd.to_datetime(df["periodo"], errors="coerce")
            df = df.dropna(subset=["periodo", "valor"])
            df = df.set_index("periodo")[["valor"]].rename(columns={"valor": ref.label})
            dfs.append(df)
            result["columnas"].append({
                "label": ref.label,
                "repo": ref.repo,
                "serie": ref.serie,
                "unidad": rows[0].get("unidad", "") if rows else "",
            })
        except Exception as e:
            log.warning(f"Error fetching {ref.serie}: {e}")
            continue

    if not dfs:
        return {**result, "data": []}

    merged = pd.concat(dfs, axis=1).sort_index()
    merged.index = merged.index.strftime("%Y-%m-%d")
    result["periodos"] = merged.index.tolist()
    result["data"] = merged.reset_index().rename(columns={"index": "periodo"}).to_dict(orient="records")
    return result


@app.post("/api/dataset/export/csv")
def export_dataset_csv(req: DatasetRequest):
    result = build_dataset(req)
    buf = io.StringIO()
    buf.write(f"# Dataset: {req.nombre}\n")
    buf.write(f"# Período: {req.desde} → {req.hasta}\n")
    buf.write(f"# Frecuencia: {req.frecuencia}\n")
    buf.write(f"# Series: {', '.join(c['label'] for c in result.get('columnas', []))}\n")

    data = result.get("data", [])
    if data:
        headers = list(data[0].keys())
        buf.write(",".join(headers) + "\n")
        for row in data:
            buf.write(",".join(str(row.get(h, "")) for h in headers) + "\n")
    buf.seek(0)

    fname = f"econsur_{req.nombre[:30]}_{req.desde}_{req.hasta}.csv".replace(" ", "_")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND
# ─────────────────────────────────────────────────────────────────────────────
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa_fallback(full_path: str):
    index = STATIC_DIR / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    return HTMLResponse("<h2>Frontend no disponible.</h2>", status_code=503)
