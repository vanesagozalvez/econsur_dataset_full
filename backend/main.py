"""
EconSur Dataset Full — Estación de Trabajo Macroeconómica Unificada
Backend: FastAPI + SQLite + Pandas
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
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuración de Logging para Render
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE RUTAS
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent.absolute()
DATA_DIR = BASE_DIR / "data"

log.info(f"Iniciando Backend. Ruta de datos: {DATA_DIR}")

MACRO_DIR    = DATA_DIR / "macro_indec"
COMERCIO_DIR = DATA_DIR / "saldo_comercial"
EMPLEO_DIR   = DATA_DIR / "empleo_ingresos"
PRECIOS_DIR  = DATA_DIR / "precios_ipc"

DB_REGISTRY: Dict[str, Path] = {
    "macro1":    MACRO_DIR / "macro_indec1.db",
    "macro2":    MACRO_DIR / "macro_indec2_final.db",
    "comercio1": COMERCIO_DIR / "saldo_comercial1.db",
    "comercio2": COMERCIO_DIR / "saldo_comercial2.db",
    "empleo1":   EMPLEO_DIR / "empleo_e_ingresos.db",
    "empleo2":   EMPLEO_DIR / "empleo_e_ingresos2.db",
    "empleo3":   EMPLEO_DIR / "empleo_e_ingresos3.db",
    "precios1":  PRECIOS_DIR / "data_ipc_indec.db",
    "precios2":  PRECIOS_DIR / "data_apendice4.db",
}

META_REGISTRY: Dict[str, Path] = {
    "macro_meta1": MACRO_DIR / "series_metadata1.json",
    "macro_meta2": MACRO_DIR / "series_metadata2_final.json",
}

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES QUE EL CÓDIGO NECESITA (MAPEOS Y FUENTES)
# ─────────────────────────────────────────────────────────────────────────────

MACRO_CUADROS = [
    ("anexo1", "Oferta y Demanda Globales", "macro1"),
    ("anexo2", "Valor Agregado Bruto (Sectores)", "macro1"),
    ("macro2", "Series Macro Segregadas", "macro2"),
]

COMERCIO_FUENTES = [
    ("ica_resumen", "Cuadro 1", "Resumen Ejecutivo ICA", "comercio1"),
    ("ica_export", "Cuadro 2", "Exportaciones por Grandes Rubros", "comercio1"),
    ("ica_import", "Cuadro 3", "Importaciones por Uso Económico", "comercio1"),
    ("ica_paises", "Apéndice", "Comercio por Socios", "comercio2"),
]

EMPLEO_FUENTES = [
    ("eph_tasas", "Tasas de Empleo y Desempleo (EPH)", "empleo1"),
    ("oede_puestos", "Puestos de Trabajo (OEDE)", "empleo2"),
    ("eil_expectativas", "Expectativas de Contratación (EIL)", "empleo3"),
]

PRECIOS_FUENTES = [
    ("ipc_general", "Cuadro 1", "IPC General", "precios1"),
    ("ipc_nucleo", "Cuadro 2", "IPC Núcleo y Estacionales", "precios1"),
    ("ipc_apendice", "Apéndice 4", "Precios Promedio Nacionales", "precios2"),
]

COMERCIO_DB_MAP = {f[0]: (f[3], "series_comercio") for f in COMERCIO_FUENTES}
EMPLEO_DB_MAP = {f[0]: (f[2], "series_empleo") for f in EMPLEO_FUENTES}
PRECIOS_DB_MAP = {f[0]: (f[3], "series_precios") for f in PRECIOS_FUENTES}

_FREQ_ORDER = {"Mensual": 1, "Trimestral": 2, "Anual": 3}

def norm_freq(frecuencia: str) -> str:
    """Normaliza las frecuencias para que el frontend las entienda siempre igual."""
    f = str(frecuencia).strip().capitalize()
    if "Mens" in f: return "Mensual"
    if "Trim" in f: return "Trimestral"
    if "Anu" in f: return "Anual"
    return f

# ─────────────────────────────────────────────────────────────────────────────
# LÓGICA DE CONEXIÓN Y METADATOS
# ─────────────────────────────────────────────────────────────────────────────

def get_conn(db_key: str) -> sqlite3.Connection:
    path = DB_REGISTRY.get(db_key)
    if not path:
        raise HTTPException(400, detail=f"db_key='{db_key}' inválido.")
    if not path.exists():
        log.error(f"ARCHIVO NO ENCONTRADO: {path.absolute()}")
        raise HTTPException(503, detail=f"Base de datos '{path.name}' no disponible.")
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn

def _load_macro_metadata() -> List[Dict]:
    items = []
    for db_num, meta_key, db_key, table in [
        (1, "macro_meta1", "macro1", "series_macro_simplified"),
        (2, "macro_meta2", "macro2", "series_macro2"),
    ]:
        meta_path = META_REGISTRY[meta_key]
        if not meta_path.exists():
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
    
    result = []
    for i, item in enumerate(items):
        result.append({**item, "meta_idx": i})
    return result

_MACRO_METADATA = _load_macro_metadata()
_MACRO_BY_IDX = {it["meta_idx"]: it for it in _MACRO_METADATA}
_MACRO_BY_CF = defaultdict(list)
for _it in _MACRO_METADATA:
    _MACRO_BY_CF[(_it["cuadro"], _it["frecuencia"])].append(_it)

# ─────────────────────────────────────────────────────────────────────────────
# APP Y MIDDLEWARE
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="EconSur API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health():
    status = {k: v.exists() for k, v in DB_REGISTRY.items()}
    return {
        "status": "ok" if all(status.values()) else "degraded",
        "dbs": status
    }

@app.get("/api/repos")
def get_repos():
    return [
        {"repo": "macro", "label": "Macroeconomía INDEC", "available": DB_REGISTRY["macro1"].exists()},
        {"repo": "comercio", "label": "Comercio Exterior ICA", "available": DB_REGISTRY["comercio1"].exists()},
        {"repo": "empleo", "label": "Empleo e Ingresos", "available": DB_REGISTRY["empleo1"].exists()},
        {"repo": "precios", "label": "Precios IPC", "available": DB_REGISTRY["precios1"].exists()},
    ]

@app.get("/api/fuentes")
def get_fuentes(repo: str = Query(...)):
    if repo == "macro":
        return [{"fuente": c[0], "nombre": c[1], "db_key": c[2], "available": DB_REGISTRY.get(c[2], Path()).exists()} for c in MACRO_CUADROS]
    elif repo == "comercio":
        return [{"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3], "available": DB_REGISTRY.get(f[3], Path()).exists()} for f in COMERCIO_FUENTES]
    elif repo == "empleo":
        return [{"fuente": f[0], "nombre": f[1], "db_key": f[2], "available": DB_REGISTRY.get(f[2], Path()).exists()} for f in EMPLEO_FUENTES]
    elif repo == "precios":
        return [{"fuente": f[0], "cuadro": f[1], "nombre": f[2], "db_key": f[3], "available": DB_REGISTRY.get(f[3], Path()).exists()} for f in PRECIOS_FUENTES]
    raise HTTPException(400, detail="Repo no reconocido.")

@app.get("/api/frecuencias")
def get_frecuencias(repo: str = Query(...), fuente: str = Query(...)):
    if repo == "macro":
        freqs = sorted({it["frecuencia"] for it in _MACRO_METADATA if it["cuadro"] == fuente}, key=lambda f: _FREQ_ORDER.get(f, 99))
        return freqs
    
    # Repos con lógica de DB dinámica
    maps = {"comercio": COMERCIO_DB_MAP, "empleo": EMPLEO_DB_MAP, "precios": PRECIOS_DB_MAP}
    info = maps.get(repo, {}).get(fuente)
    if not info: raise HTTPException(404)
    
    db_key, table = info
    col_name = "frecuencia" if repo != "empleo" else "frecuencia" 
    conn = get_conn(db_key)
    try:
        rows = conn.execute(f"SELECT DISTINCT {col_name} FROM {table} WHERE {'hoja_origen' if repo!='empleo' else 'ho_origen'}=?", [fuente]).fetchall()
    finally:
        conn.close()
    
    return sorted(set(norm_freq(r[0]) for r in rows), key=lambda x: _FREQ_ORDER.get(x, 99))

@app.get("/api/series")
def get_series(repo: str = Query(...), fuente: str = Query(...), frecuencia: str = Query(...)):
    if repo == "macro":
        items = _MACRO_BY_CF.get((fuente, frecuencia), [])
        result = []
        for it in items:
            nombre = it["serie_nombre_final_simplified"]
            if it["local_idx"] > 0:
                nombre = f"{nombre} [{it['unidad_orig']}]" if it["db_num_macro"] == 2 else f"{nombre} ({it['local_idx'] + 1})"
            result.append({"serie_id": f"macro:{it['meta_idx']}", "serie_nombre": nombre, "unidad": it["unidad_orig"], "meta_idx": it["meta_idx"]})
        return result

    # Otros repos
    maps = {"comercio": COMERCIO_DB_MAP, "empleo": EMPLEO_DB_MAP, "precios": PRECIOS_DB_MAP}
    info = maps.get(repo, {}).get(fuente)
    if not info: raise HTTPException(404)
    db_key, table = info
    conn = get_conn(db_key)
    col_hoja = "hoja_origen" if repo != "empleo" else "ho_origen"
    try:
        rows = conn.execute(f"SELECT DISTINCT serie_nombre, unidad FROM {table} WHERE {col_hoja}=? AND frecuencia=? ORDER BY serie_nombre", [fuente, frecuencia]).fetchall()
    finally:
        conn.close()
    return [{"serie_id": f"{repo}:{fuente}::{r[0]}", "serie_nombre": r[0], "unidad": r[1] if "unidad" in r.keys() else ""} for r in rows]

# ─────────────────────────────────────────────────────────────────────────────
# LÓGICA DE EXTRACCIÓN DE DATOS (EL CORAZÓN DEL BACKEND)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_data_rows(repo, fuente, frecuencia, serie, meta_idx=None, desde=None, hasta=None):
    period_sql = ""
    params = []
    if desde: 
        period_sql += " AND periodo >= ?"; params.append(desde)
    if hasta: 
        period_sql += " AND periodo <= ?"; params.append(hasta)

    if repo == "macro":
        item = _MACRO_BY_IDX.get(meta_idx)
        if not item: return []
        conn = get_conn(item["db_key"])
        try:
            sql = f"SELECT periodo, valor, unidad FROM {item['table']} WHERE cuadro=? AND frecuencia=? AND serie_nombre_final_simplified=? {period_sql} ORDER BY periodo"
            rows = conn.execute(sql, [item["cuadro"], item["frecuencia"], item["serie_nombre_final_simplified"]] + params).fetchall()
            return [{"periodo": r[0][:10], "valor": r[1], "unidad": r[2]} for r in rows]
        finally: conn.close()

    # Genérico para comercio, empleo, precios
    info = {"comercio": COMERCIO_DB_MAP, "empleo": EMPLEO_DB_MAP, "precios": PRECIOS_DB_MAP}.get(repo, {}).get(fuente)
    if not info: return []
    db_key, table = info
    col_hoja = "hoja_origen" if repo != "empleo" else "ho_origen"
    conn = get_conn(db_key)
    try:
        sql = f"SELECT periodo, valor, unidad FROM {table} WHERE {col_hoja}=? AND frecuencia=? AND serie_nombre=? {period_sql} ORDER BY periodo"
        rows = conn.execute(sql, [fuente, frecuencia, serie] + params).fetchall()
        return [{"periodo": r[0][:10], "valor": r[1], "unidad": r[2] if len(r)>2 else ""} for r in rows]
    finally: conn.close()

@app.get("/api/datos")
def get_datos(repo: str=Query(...), fuente: str=Query(...), frecuencia: str=Query(...), serie: str=Query(...), desde: str=Query(...), hasta: str=Query(...), meta_idx: Optional[int]=Query(None)):
    rows = _fetch_data_rows(repo, fuente, frecuencia, serie, meta_idx, desde, hasta)
    return {"datos": rows, "meta": {"total": len(rows), "serie": serie}}

# ─────────────────────────────────────────────────────────────────────────────
# EXPORTACIÓN Y CONSOLIDACIÓN
# ─────────────────────────────────────────────────────────────────────────────

class SerieRef(BaseModel):
    repo: str; fuente: str; frecuencia: str; serie: str; label: str; meta_idx: Optional[int] = None

class DatasetRequest(BaseModel):
    nombre: str; series: List[SerieRef]; desde: str; hasta: str; frecuencia: str

@app.post("/api/dataset/build")
def build_dataset(req: DatasetRequest):
    dfs = []
    for ref in req.series:
        rows = _fetch_data_rows(ref.repo, ref.fuente, ref.frecuencia, ref.serie, ref.meta_idx, req.desde, req.hasta)
        if not rows: continue
        df = pd.DataFrame(rows)
        df["periodo"] = pd.to_datetime(df["periodo"])
        df = df.set_index("periodo")[["valor"]].rename(columns={"valor": ref.label})
        dfs.append(df)
    
    if not dfs: return {"data": []}
    merged = pd.concat(dfs, axis=1).sort_index().reset_index()
    merged["periodo"] = merged["periodo"].dt.strftime("%Y-%m-%d")
    return {"data": merged.to_dict(orient="records")}

@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa_fallback(full_path: str):
    return HTMLResponse("<html><body style='font-family:sans-serif;text-align:center'><h1>EconSur API Online</h1><p>Sistema completo y verificado.</p></body></html>")
    
