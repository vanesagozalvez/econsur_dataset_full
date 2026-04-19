#!/usr/bin/env bash
# sync_data.sh — Versión Final con Autenticación por Token
set -e

GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

declare -A REPOS=(
  ["macro_indec"]="econsur_macro_indec"
  ["saldo_comercial"]="econsur_saldo_comercial"
  ["empleo_ingresos"]="econsur_empleo_ingresos"
  ["precios_ipc"]="econsur_precios_ipc"
)

echo "─────────────────────────────────────────"
echo " EconSur — Sincronización de datos (Token Auth)"
echo " GitHub user: $GITHUB_USER"
echo "─────────────────────────────────────────"

mkdir -p "$DATA_DIR"

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"
  
  # Usamos el Token de la variable de entorno de Render
  # Esto hace que la conexión sea privada y súper estable
  URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"

  echo ""
  echo "→ Procesando $REPO..."

  if [ -d "$TARGET" ] && [ ! -d "$TARGET/.git" ]; then
    echo "  Limpiando archivos previos..."
    rm -rf "$TARGET"
  fi

  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando datos..."
    git -C "$TARGET" pull --ff-only || { rm -rf "$TARGET"; git clone "$URL" "$TARGET"; }
  else
    echo "  Clonando con Token..."
    git clone "$URL" "$TARGET"
  fi
done

echo ""
echo "✓ Sincronización completa con éxito."
