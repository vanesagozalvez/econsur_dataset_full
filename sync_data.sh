#!/usr/bin/env bash
# sync_data.sh — Clona o actualiza los 4 repos de datos
# Uso: bash sync_data.sh [TU_USUARIO_GITHUB]

set -e
GITHUB_USER="${1:-TU_USUARIO}"
DATA_DIR="backend/data"

declare -A REPOS=(
  ["macro_indec"]="econsur_macro_indec"
  ["saldo_comercial"]="econsur_saldo_comercial"
  ["empleo_ingresos"]="econsur_empleo_ingresos"
  ["precios_ipc"]="econsur_precios_ipc"
)

echo "─────────────────────────────────────────"
echo " EconSur — Sincronización de datos"
echo " GitHub user: $GITHUB_USER"
echo "─────────────────────────────────────────"

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"
  URL="https://github.com/$GITHUB_USER/$REPO.git"

  echo ""
  echo "→ $REPO → $TARGET"

  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando..."
    git -C "$TARGET" pull --ff-only
  else
    echo "  Clonando $URL..."
    git clone "$URL" "$TARGET"
  fi
done

echo ""
echo "✓ Sincronización completa."
echo ""
echo "Archivos presentes:"
for SUBDIR in "${!REPOS[@]}"; do
  echo "  $DATA_DIR/$SUBDIR/"
  ls "$DATA_DIR/$SUBDIR/"*.db 2>/dev/null | xargs -I{} echo "    {}" || echo "    (sin .db)"
done
