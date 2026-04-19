#!/usr/bin/env bash
# sync_data.sh — Clona o actualiza los 4 repos de datos
# Uso: bash sync_data.sh [TU_USUARIO_GITHUB]
#!/usr/bin/env bash

#!/usr/bin/env bash
# sync_data.sh — Versión robusta para EconSur
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
echo " EconSur — Sincronización de datos"
echo " GitHub user: $GITHUB_USER"
echo "─────────────────────────────────────────"

# Crear el directorio de datos si no existe
mkdir -p "$DATA_DIR"

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"
  URL="https://github.com/${GITHUB_USER}/${REPO}"

  echo ""
  echo "→ Procesando $REPO..."

  # LÓGICA DE LIMPIEZA:
  # Si la carpeta existe pero NO es un repositorio Git (falta la carpeta .git), la borramos.
  if [ -d "$TARGET" ] && [ ! -d "$TARGET/.git" ]; then
    echo "  Detectada carpeta manual en $TARGET. Limpiando para sincronización oficial..."
    rm -rf "$TARGET"
  fi

  # Ahora procedemos con la sincronización normal
  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando datos existentes..."
    git -C "$TARGET" pull --ff-only
  else
    echo "  Clonando desde $URL..."
    git clone "$URL" "$TARGET"
  fi
done

echo ""
echo "✓ Sincronización completa."
