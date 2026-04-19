#!/usr/bin/env bash
# sync_data.sh — Versión Final Robusta para EconSur
# Este script sincroniza las bases de datos de los 4 repositorios públicos.

set -e

# Configuración de usuario y rutas
GITHUB_USER="vanesagozalvez"
DATA_DIR="backend/data"

# Definición de repositorios
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

# 1. Asegurar que el directorio base existe
mkdir -p "$DATA_DIR"

# 2. Configuración global para evitar bloqueos en entornos automáticos
# Esto le dice a Git que no intente pedir usuario/contraseña interactivamente
export GIT_TERMINAL_PROMPT=0

for SUBDIR in "${!REPOS[@]}"; do
  REPO="${REPOS[$SUBDIR]}"
  TARGET="$DATA_DIR/$SUBDIR"
  
  # CAMBIO CLAVE: Usamos el protocolo git:// que es solo lectura y no pide usuario
  URL="git://github.com/${GITHUB_USER}/${REPO}.git"

  echo ""
  echo "→ Procesando $REPO..."
  
  # LÓGICA DE LIMPIEZA:
  # Si la carpeta existe pero NO es un repositorio Git (como las cargas manuales), se elimina.
  if [ -d "$TARGET" ] && [ ! -d "$TARGET/.git" ]; then
    echo "  Detectada carpeta manual o corrupta en $TARGET. Limpiando..."
    rm -rf "$TARGET"
  fi

  # 3. Sincronización
  if [ -d "$TARGET/.git" ]; then
    echo "  Actualizando datos existentes..."
    # Intentamos actualizar. Si falla, es mejor borrar y clonar de nuevo para evitar errores de historial.
    git -C "$TARGET" pull --ff-only || { echo "  Fallo en pull. Re-clonando..."; rm -rf "$TARGET"; git clone "$URL" "$TARGET"; }
  else
    echo "  Clonando desde $URL..."
    # Clonamos de forma silenciosa y sin prompts de terminal
    git clone "$URL" "$TARGET"
  fi
done

echo ""
echo "─────────────────────────────────────────"
echo "✓ Sincronización completa."
echo "─────────────────────────────────────────"
