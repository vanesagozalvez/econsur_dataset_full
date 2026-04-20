#!/usr/bin/env bash
# sync_data.sh — EconSur Dataset Studio
# Clona los 4 repos con soporte completo de Git LFS.
# REQUIERE: variable de entorno GITHUB_TOKEN en Render
set -e

GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

declare -A REPOS=(
  ["macro_indec"]="econsur-macro-consulta-v1"
  ["saldo_comercial"]="econsur_saldo_comercial"
  ["empleo_ingresos"]="empleo_e_ingresos"
  ["precios_ipc"]="econsur_precios_ipc"
)

echo "══════════════════════════════════════════"
echo " EconSur — Sincronización de datos"
echo "══════════════════════════════════════════"

# Verificar que GITHUB_TOKEN esté definido (necesario para LFS)
if [ -z "$GITHUB_TOKEN" ]; then
  echo ""
  echo "⚠ ADVERTENCIA: GITHUB_TOKEN no está definido."
  echo "  Los repos públicos sin LFS se clonarán igual."
  echo "  Para repos con Git LFS (macro_indec), definir GITHUB_TOKEN en Render."
  echo ""
fi

mkdir -p "$DATA_DIR"
export GIT_TERMINAL_PROMPT=0

# Configurar credenciales Git para LFS
if [ -n "$GITHUB_TOKEN" ]; then
  git config --global credential.helper store
  echo "https://${GITHUB_TOKEN}:x-oauth-basic@github.com" > ~/.git-credentials
  echo "  → Credenciales LFS configuradas"
fi

# Verificar git-lfs
if command -v git-lfs &>/dev/null; then
  echo "  → git-lfs: $(git-lfs version 2>/dev/null | head -1)"
  git lfs install 2>/dev/null || true
else
  echo "  → git-lfs NO disponible en este entorno"
fi

TMPDIR_BASE="/tmp/econsur_clone"
rm -rf "$TMPDIR_BASE"
mkdir -p "$TMPDIR_BASE"

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  DEST="$DATA_DIR/$SUBDIR"
  TMPCLONE="$TMPDIR_BASE/$SUBDIR"

  if [ -n "$GITHUB_TOKEN" ]; then
    URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"
  else
    URL="https://github.com/${GITHUB_USER}/${REPO}.git"
  fi

  echo ""
  echo "→ $REPO"
  rm -rf "$TMPCLONE"

  # Clonar con LFS habilitado (GIT_LFS_SKIP_SMUDGE=0 fuerza descarga de binarios)
  echo "  Clonando (con LFS)..."
  GIT_LFS_SKIP_SMUDGE=0 git clone --depth=1 "$URL" "$TMPCLONE" 2>&1

  # Si hay archivos LFS pendientes, hacer fetch explícito
  if [ -f "$TMPCLONE/.gitattributes" ] && grep -q "lfs" "$TMPCLONE/.gitattributes" 2>/dev/null; then
    echo "  → Repo usa LFS, descargando binarios..."
    cd "$TMPCLONE"
    git lfs fetch --all 2>&1 || echo "  ⚠ LFS fetch falló (continuando...)"
    git lfs checkout 2>&1 || echo "  ⚠ LFS checkout falló (continuando...)"
    cd - > /dev/null
  fi

  mkdir -p "$DEST"
  DB_COUNT=0
  JSON_COUNT=0

  # Copiar .db desde raíz y subcarpeta data/
  for f in "$TMPCLONE"/*.db "$TMPCLONE"/data/*.db; do
    if [ -f "$f" ]; then
      SIZE=$(wc -c < "$f")
      BASENAME=$(basename "$f")
      if [ "$SIZE" -lt 1024 ]; then
        echo "  ⚠ $BASENAME es muy pequeño (${SIZE} bytes) — posible puntero LFS no resuelto"
        echo "    Asegurate de definir GITHUB_TOKEN en Render → Environment"
      else
        cp "$f" "$DEST/"
        echo "  ✓ $BASENAME — $(du -h "$DEST/$BASENAME" | cut -f1)"
        DB_COUNT=$((DB_COUNT+1))
      fi
    fi
  done

  # Copiar .json desde raíz y subcarpeta data/
  for f in "$TMPCLONE"/*.json "$TMPCLONE"/data/*.json; do
    if [ -f "$f" ]; then
      cp "$f" "$DEST/"
      JSON_COUNT=$((JSON_COUNT+1))
    fi
  done

  echo "  → Total: $DB_COUNT .db  |  $JSON_COUNT .json copiados a $DEST"
done

# Limpiar credenciales temporales
rm -f ~/.git-credentials
git config --global --unset credential.helper 2>/dev/null || true

rm -rf "$TMPDIR_BASE"

echo ""
echo "══════════════════════════════════════════"
echo " ✓ Sincronización completa"
echo "══════════════════════════════════════════"
