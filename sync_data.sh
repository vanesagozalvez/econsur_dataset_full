#!/usr/bin/env bash
# sync_data.sh — EconSur Dataset Studio v4
# Descarga archivos de datos usando la API de GitHub.
# Para archivos LFS usa la API de GitHub LFS directamente (sin necesitar git-lfs instalado).
set -e

GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

echo "══════════════════════════════════════════"
echo " EconSur — Sincronización de datos"
echo "══════════════════════════════════════════"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "⚠ GITHUB_TOKEN no definido — necesario para descargar archivos LFS"
  echo "  Definir en Render → Environment → GITHUB_TOKEN"
fi

mkdir -p "$DATA_DIR"

# ── Función: descargar un archivo desde GitHub (normal o LFS) ────────────────
# Uso: download_github_file REPO FILEPATH_IN_REPO DESTINO_LOCAL
download_github_file() {
  local REPO="$1"
  local FILEPATH="$2"
  local DEST="$3"
  local DESTDIR=$(dirname "$DEST")
  mkdir -p "$DESTDIR"

  local AUTH_HEADER=""
  if [ -n "$GITHUB_TOKEN" ]; then
    AUTH_HEADER="-H \"Authorization: token $GITHUB_TOKEN\""
  fi

  # 1) Intentar descarga directa via raw.githubusercontent.com
  local RAW_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${REPO}/main/${FILEPATH}"
  echo "    Descargando $FILEPATH..."

  HTTP_CODE=$(curl -s -o "$DEST" -w "%{http_code}" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -L "$RAW_URL" 2>/dev/null)

  if [ "$HTTP_CODE" = "200" ]; then
    local SIZE=$(wc -c < "$DEST")
    if [ "$SIZE" -gt 1024 ]; then
      echo "    ✓ OK — $(du -h "$DEST" | cut -f1)"
      return 0
    fi
    # El archivo llegó pero es pequeño → es un puntero LFS
    echo "    → Es un puntero LFS (${SIZE} bytes), usando API LFS..."
  fi

  # 2) Descargar via GitHub LFS API
  # Primero leer el puntero para obtener el OID y size
  local POINTER_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${REPO}/main/${FILEPATH}"
  local POINTER=$(curl -s \
    -H "Authorization: token $GITHUB_TOKEN" \
    "$POINTER_URL" 2>/dev/null)

  local OID=$(echo "$POINTER" | grep "oid sha256:" | awk '{print $2}' | sed 's/sha256://')
  local FSIZE=$(echo "$POINTER" | grep "^size " | awk '{print $2}')

  if [ -z "$OID" ]; then
    echo "    ✗ No se pudo obtener OID del puntero LFS"
    return 1
  fi

  echo "    → OID: ${OID:0:16}...  Tamaño: $FSIZE bytes"

  # Solicitar la URL de descarga del objeto LFS
  local LFS_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.git-lfs+json" \
    -H "Content-Type: application/vnd.git-lfs+json" \
    -d "{\"operation\":\"download\",\"transfers\":[\"basic\"],\"objects\":[{\"oid\":\"${OID}\",\"size\":${FSIZE}}]}" \
    "https://github.com/${GITHUB_USER}/${REPO}.git/info/lfs/objects/batch" 2>/dev/null)

  local DOWNLOAD_URL=$(echo "$LFS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    obj = data['objects'][0]
    print(obj['actions']['download']['href'])
except:
    print('')
" 2>/dev/null)

  if [ -z "$DOWNLOAD_URL" ]; then
    echo "    ✗ No se pudo obtener URL de descarga LFS"
    echo "    Response: $LFS_RESPONSE" | head -3
    return 1
  fi

  echo "    → Descargando desde LFS storage..."
  HTTP_CODE=$(curl -s -o "$DEST" -w "%{http_code}" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -L "$DOWNLOAD_URL" 2>/dev/null)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "    ✓ OK — $(du -h "$DEST" | cut -f1)"
    return 0
  else
    echo "    ✗ Descarga LFS falló (HTTP $HTTP_CODE)"
    return 1
  fi
}

# ── Macro INDEC (usa LFS) ─────────────────────────────────────────────────────
echo ""
echo "→ econsur-macro-consulta-v1 [macro_indec]"
REPO="econsur-macro-consulta-v1"
DEST_DIR="$DATA_DIR/macro_indec"
mkdir -p "$DEST_DIR"

download_github_file "$REPO" "data/macro_indec1.db"       "$DEST_DIR/macro_indec1.db"
download_github_file "$REPO" "data/macro_indec2_final.db" "$DEST_DIR/macro_indec2_final.db"

# JSON de metadata (no son LFS, descarga directa)
for JSON_FILE in "series_metadata1.json" "series_metadata2_final.json" \
                 "data/series_metadata1.json" "data/series_metadata2_final.json"; do
  BASENAME=$(basename "$JSON_FILE")
  if [ ! -f "$DEST_DIR/$BASENAME" ]; then
    HTTP_CODE=$(curl -s -o "$DEST_DIR/$BASENAME" -w "%{http_code}" \
      -H "Authorization: token $GITHUB_TOKEN" \
      -L "https://raw.githubusercontent.com/${GITHUB_USER}/${REPO}/main/${JSON_FILE}" 2>/dev/null)
    [ "$HTTP_CODE" = "200" ] && echo "    ✓ $BASENAME" || rm -f "$DEST_DIR/$BASENAME"
  fi
done

# ── Repos sin LFS: clonar normalmente ────────────────────────────────────────
export GIT_TERMINAL_PROMPT=0
TMPDIR_BASE="/tmp/econsur_clone"
rm -rf "$TMPDIR_BASE"
mkdir -p "$TMPDIR_BASE"

for ENTRY in \
  "saldo_comercial:econsur_saldo_comercial" \
  "empleo_ingresos:empleo_e_ingresos" \
  "precios_ipc:econsur_precios_ipc"
do
  SUBDIR="${ENTRY%%:*}"
  REPO="${ENTRY##*:}"
  DEST="$DATA_DIR/$SUBDIR"
  TMPCLONE="$TMPDIR_BASE/$SUBDIR"

  if [ -n "$GITHUB_TOKEN" ]; then
    URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"
  else
    URL="https://github.com/${GITHUB_USER}/${REPO}.git"
  fi

  echo ""
  echo "→ $REPO [$SUBDIR]"
  rm -rf "$TMPCLONE"
  git clone --depth=1 "$URL" "$TMPCLONE" 2>&1
  mkdir -p "$DEST"

  DB_COUNT=0
  for f in "$TMPCLONE"/*.db "$TMPCLONE"/data/*.db; do
    [ -f "$f" ] && cp "$f" "$DEST/" && \
      echo "  ✓ $(basename $f) — $(du -h "$DEST/$(basename $f)" | cut -f1)" && \
      DB_COUNT=$((DB_COUNT+1))
  done

  JSON_COUNT=0
  for f in "$TMPCLONE"/*.json "$TMPCLONE"/data/*.json; do
    [ -f "$f" ] && cp "$f" "$DEST/" && JSON_COUNT=$((JSON_COUNT+1))
  done

  echo "  → $DB_COUNT .db  |  $JSON_COUNT .json"
done

rm -rf "$TMPDIR_BASE"

echo ""
echo "══════════════════════════════════════════"
echo " Resumen final:"
for d in macro_indec saldo_comercial empleo_ingresos precios_ipc; do
  COUNT=$(ls "$DATA_DIR/$d/"*.db 2>/dev/null | wc -l)
  echo "  $d: $COUNT .db"
done
echo "══════════════════════════════════════════"
echo " ✓ Sincronización completa"
echo "══════════════════════════════════════════"
