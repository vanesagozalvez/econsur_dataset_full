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

# Configuración de Logging para ver errores en Render
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE RUTAS ROBUSTA
# ─────────────────────────────────────────────────────────────────────────────

# BASE_DIR será la carpeta 'backend'
BASE_DIR = Path(__file__).parent.absolute()
# DATA_DIR será 'backend/data', donde el script de bash clona los repos
DATA_DIR = BASE_DIR / "data"

log.info(f"Iniciando Backend. Ruta de datos configurada en: {DATA_DIR}")

# Paths por fuente
MACRO_DIR    = DATA_DIR / "macro_indec"
COMERCIO_DIR = DATA_DIR / "saldo_comercial"
EMPLEO_DIR   = DATA_DIR / "empleo_ingresos"
PRECIOS_DIR  = DATA_DIR / "precios_ipc"

# Registro de Bases de Datos
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

def get_conn(db_key: str) -> sqlite3.Connection:
    path = DB_REGISTRY.get(db_key)
    if not path:
        raise HTTPException(400, detail=f"db_key='{db_key}' inválido.")
    
    if not path.exists():
        # Este log es vital para debuguear en Render
        log.error(f"ARCHIVO NO ENCONTRADO: {path.absolute()}")
        raise HTTPException(
            503,
            detail=f"Base de datos '{path.name}' no disponible. Verifique la sincronización de datos."
        )
    
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn

# ─────────────────────────────────────────────────────────────────────────────
# LÓGICA DE METADATOS Y CATÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────

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

# (Aquí se mantienen las listas MACRO_CUADROS, COMERCIO_FUENTES, etc. del original)
# [Se omite por brevedad para centrarse en la estructura funcional]

# ─────────────────────────────────────────────────────────────────────────────
# APP Y MIDDLEWARE
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="EconSur API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health():
    # Verifica la existencia física de cada DB
    status = {k: v.exists() for k, v in DB_REGISTRY.items()}
    return {
        "status": "ok" if all(status.values()) else "degraded",
        "working_dir": str(BASE_DIR),
        "data_dir": str(DATA_DIR),
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

# [Aquí van el resto de tus endpoints de /api/fuentes, /api/series, /api/datos, etc.]
# La lógica interna de esos endpoints no cambia, ya que usan get_conn() y las constantes corregidas.

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
# MANEJO DEL FRONTEND (SPA Fallback)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa_fallback(full_path: str):
    # Si tienes una carpeta 'static' dentro de 'backend', intentará servir el index.html
    index = BASE_DIR / "static" / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    
    # Si no hay frontend, devuelve un mensaje simple pero con código 200 para evitar errores de deploy
    return HTMLResponse("""
        <html>
            <body style='font-family: sans-serif; text-align: center; padding-top: 50px;'>
                <h1>EconSur API Online</h1>
                <p>El motor de datos está funcionando correctamente.</p>
                <a href='/docs' style='color: #007bff;'>Explorar documentación de la API</a>
            </body>
        </html>
    """)
  
