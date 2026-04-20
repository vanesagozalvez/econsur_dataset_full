#!/usr/bin/env bash
# sync_data.sh — EconSur Dataset Studio
# Clona o actualiza los 4 repositorios de datos.
# En Render este script se ejecuta automáticamente en el buildCommand.
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

mkdir -p "$DATA_DIR"
export GIT_TERMINAL_PROMPT=0

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"

  # Construir URL: si hay GITHUB_TOKEN en env, lo usa; si no, usa HTTPS público
  if [ -n "$GITHUB_TOKEN" ]; then
    URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"
  else
    URL="https://github.com/${GITHUB_USER}/${REPO}.git"
  fi

  echo ""
  echo "→ $REPO  [$SUBDIR]"

  # Si hay archivos sueltos (no es repo git), limpiar
  if [ -d "$TARGET" ] && [ ! -d "$TARGET/.git" ]; then
    echo "  Limpiando directorio anterior..."
    rm -rf "$TARGET"
  fi

  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando..."
    git -C "$TARGET" pull --ff-only 2>&1 || {
      echo "  Pull falló, re-clonando..."
      rm -rf "$TARGET"
      git clone "$URL" "$TARGET"
    }
  else
    echo "  Clonando..."
    git clone "$URL" "$TARGET"
  fi

  echo "  ✓ Archivos: $(ls "$TARGET"/*.db 2>/dev/null | wc -l) .db encontrados"
done

echo ""
echo "══════════════════════════════════════════"
echo " ✓ Sincronización completa"
echo "══════════════════════════════════════════"
