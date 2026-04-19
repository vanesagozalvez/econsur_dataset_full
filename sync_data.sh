#!/usr/bin/env bash
# sync_data.sh — Versión Final EconSur con Nombres de Repos Corregidos
set -e

GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

# Nombres exactos de tus repositorios en GitHub
declare -A REPOS=(
  ["macro_indec"]="econsur-macro-consulta-v1"
  ["saldo_comercial"]="econsur_saldo_comercial"
  ["empleo_ingresos"]="empleo_e_ingresos"
  ["precios_ipc"]="econsur_precios_ipc"
)

echo "─────────────────────────────────────────"
echo " EconSur — Sincronización de datos"
echo "─────────────────────────────────────────"

mkdir -p "$DATA_DIR"
export GIT_TERMINAL_PROMPT=0

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"
  
  # Usamos el Token que ya configuraste en Render
  URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"

  echo ""
  echo "→ Sincronizando: $REPO"

  # Limpieza de carpetas manuales previas
  if [ -d "$TARGET" ] && [ ! -d "$TARGET/.git" ]; then
    echo "  Limpiando archivos antiguos..."
    rm -rf "$TARGET"
  fi

  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando..."
    git -C "$TARGET" pull --ff-only || { rm -rf "$TARGET"; git clone "$URL" "$TARGET"; }
  else
    echo "  Clonando..."
    git clone "$URL" "$TARGET"
  fi
done

echo ""
echo "✓ Sincronización completa. ¡EconSur está listo!"
