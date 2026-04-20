#!/usr/bin/env bash
# sync_data.sh — EconSur Dataset Studio
# Clona los 4 repos y copia los .db y .json al lugar correcto.
# Los repos tienen los archivos dentro de una subcarpeta data/
# y los copia directamente a backend/data/SUBDIR/
set -e

GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

# nombre_local → nombre_repo_en_github
declare -A REPOS=(
  ["macro_indec"]="econsur-macro-consulta-v1"
  ["saldo_comercial"]="econsur_saldo_comercial"
  ["empleo_ingresos"]="empleo_e_ingresos"
  ["precios_ipc"]="econsur_precios_ipc"
)

echo "══════════════════════════════════════════"
echo " EconSur — Sincronización de datos"
echo "══════════════════════════════════════════"

mkdir -p "$DATA_DIR"
export GIT_TERMINAL_PROMPT=0
TMPDIR_BASE="/tmp/econsur_clone"
rm -rf "$TMPDIR_BASE"
mkdir -p "$TMPDIR_BASE"

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  DEST="$DATA_DIR/$SUBDIR"
  TMPCLONE="$TMPDIR_BASE/$SUBDIR"

  # URL pública (repos públicos no necesitan token)
  if [ -n "$GITHUB_TOKEN" ]; then
    URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"
  else
    URL="https://github.com/${GITHUB_USER}/${REPO}.git"
  fi

  echo ""
  echo "→ $REPO"

  # Clonar en /tmp para no ensuciar el directorio de trabajo
  echo "  Clonando en /tmp..."
  rm -rf "$TMPCLONE"
  git clone --depth=1 "$URL" "$TMPCLONE" 2>&1

  # Crear directorio destino limpio
  mkdir -p "$DEST"

  # Copiar archivos de datos: buscar .db y .json en el repo clonado
  # Los archivos pueden estar en la raíz o en una subcarpeta data/
  DB_COUNT=0
  JSON_COUNT=0

  # Buscar .db en raíz del repo
  for f in "$TMPCLONE"/*.db; do
    [ -f "$f" ] && cp "$f" "$DEST/" && DB_COUNT=$((DB_COUNT+1))
  done

  # Buscar .db en subcarpeta data/ (como en econsur_saldo_comercial)
  for f in "$TMPCLONE"/data/*.db; do
    [ -f "$f" ] && cp "$f" "$DEST/" && DB_COUNT=$((DB_COUNT+1))
  done

  # Buscar .json en raíz (metadata de macro)
  for f in "$TMPCLONE"/*.json; do
    [ -f "$f" ] && cp "$f" "$DEST/" && JSON_COUNT=$((JSON_COUNT+1))
  done

  # Buscar .json en subcarpeta data/
  for f in "$TMPCLONE"/data/*.json; do
    [ -f "$f" ] && cp "$f" "$DEST/" && JSON_COUNT=$((JSON_COUNT+1))
  done

  echo "  ✓ Copiados: $DB_COUNT .db  |  $JSON_COUNT .json"
  echo "  Archivos en $DEST:"
  ls "$DEST/" 2>/dev/null | sed 's/^/    /' || echo "    (vacío)"
done

# Limpiar clones temporales
rm -rf "$TMPDIR_BASE"

echo ""
echo "══════════════════════════════════════════"
echo " ✓ Sincronización completa"
echo "══════════════════════════════════════════"
