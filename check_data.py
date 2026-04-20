#!/usr/bin/env python3
"""
check_data.py — Verifica el estado de todas las bases de datos de EconSur.
Uso: python check_data.py   (desde la raíz del proyecto)
"""
import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).parent / "backend" / "data"

CHECKS = [
    ("macro_indec",     "macro_indec1.db",             "series_macro_simplified", "serie_nombre_final_simplified"),
    ("macro_indec",     "macro_indec2_final.db",        "series_macro2",           "serie_nombre_final_simplified"),
    ("macro_indec",     "series_metadata1.json",        None, None),
    ("macro_indec",     "series_metadata2_final.json",  None, None),
    ("saldo_comercial", "saldo_comercial1.db",          "saldo_comercial",         "serie_nombre"),
    ("saldo_comercial", "saldo_comercial2.db",          "series_datos",            "serie_nombre"),
    ("empleo_ingresos", "empleo_e_ingresos.db",         "empleo_datos",            "serie_nombre"),
    ("empleo_ingresos", "empleo_e_ingresos2.db",        "empleo_datos",            "serie_nombre"),
    ("empleo_ingresos", "empleo_e_ingresos3.db",        "empleo_datos",            "serie_nombre"),
    ("precios_ipc",     "data_ipc_indec.db",            "series_ipc_indec",        "serie_nombre"),
    ("precios_ipc",     "data_apendice4.db",            "series_apendice4",        "serie_nombre"),
]

OK   = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"
total_ok = total_fail = 0
current_dir = None

print("\n EconSur — Estado de bases de datos")
print("─" * 62)

for subdir, filename, table, col in CHECKS:
    if subdir != current_dir:
        print(f"\n  [{subdir}]")
        current_dir = subdir
    path = DATA_DIR / subdir / filename
    if not path.exists():
        print(f"  {FAIL}  {filename:<48} NO ENCONTRADO")
        total_fail += 1
        continue
    size_mb = path.stat().st_size / 1_048_576
    if filename.endswith(".json"):
        print(f"  {OK}  {filename:<48} {size_mb:.1f} MB")
        total_ok += 1
        continue
    try:
        conn = sqlite3.connect(str(path))
        series = conn.execute(f"SELECT COUNT(DISTINCT {col}) FROM {table}").fetchone()[0]
        rows   = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        conn.close()
        print(f"  {OK}  {filename:<48} {size_mb:>5.1f} MB  {series:>5} series  {rows:>9,} filas")
        total_ok += 1
    except Exception as e:
        print(f"  {WARN}  {filename:<48} {size_mb:.1f} MB  ERROR: {e}")
        total_fail += 1

print("\n" + "─" * 62)
print(f"  Resultado: {total_ok} OK  /  {total_fail} faltantes\n")
if total_fail:
    print("  → Ejecutá sync_data.sh para clonar los repos de datos\n")
