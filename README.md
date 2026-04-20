# EconSur · Dataset Studio

Estación de trabajo macroeconómica unificada para Argentina.
Consolida 4 fuentes de datos del INDEC en una sola interfaz.

---

## Estructura del repositorio

```
econsur_dataset_full/
├── backend/
│   ├── main.py                ← API Python (FastAPI)
│   ├── requirements.txt
│   └── data/                  ← Render copia aquí las DBs automáticamente
│       ├── macro_indec/
│       ├── saldo_comercial/
│       ├── empleo_ingresos/
│       └── precios_ipc/
├── frontend/
│   ├── src/                   ← Código fuente React
│   ├── package.json
│   └── vite.config.js         ← Build genera backend/static/
├── render.yaml                ← Configuración automática de Render
├── sync_data.sh               ← Script que clona los 4 repos de datos
└── check_data.py              ← Verifica estado de las bases
```

---

## Cómo subir a GitHub (paso a paso, sin programación)

### Paso 1 — Crear el repositorio en GitHub

1. Ir a [github.com](https://github.com) → **New repository**
2. Nombre: `econsur_dataset_full`
3. Visibilidad: **Public** (para que Render lo lea gratis)
4. Click **Create repository**

### Paso 2 — Subir los archivos

Tenés dos formas:

**Opción A — Desde la web de GitHub (más simple):**
1. En tu nuevo repo vacío, click **uploading an existing file**
2. Arrastrá todos los archivos/carpetas del zip descargado
3. Mantener la estructura de carpetas exactamente como está
4. Click **Commit changes**

**Opción B — Con GitHub Desktop (si lo tenés instalado):**
1. File → Clone repository → elegir `econsur_dataset_full`
2. Copiar todos los archivos del zip en esa carpeta
3. Commit → Push

---

## Configuración en Render (paso a paso)

### Paso 1 — Crear el servicio

1. Ir a [render.com](https://render.com) → **New → Web Service**
2. Conectar tu repositorio `econsur_dataset_full`
3. Render detectará el `render.yaml` automáticamente

Si te pide los valores manualmente, usá estos:

| Campo | Valor |
|-------|-------|
| **Runtime** | Python |
| **Build Command** | `pip install -r backend/requirements.txt && curl -fsSL https://deb.nodesource.com/setup_20.x \| bash - && apt-get install -y nodejs && cd frontend && npm install && npm run build` |
| **Start Command** | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| **Python Version** | `3.11.0` |

### Paso 2 — Agregar el Disco persistente

Esto es **fundamental** — guarda las bases de datos entre deploys.

1. En tu servicio → **Disks** → **Add Disk**
2. Configurar:
   - Name: `econsur-data-disk`
   - Mount Path: `/opt/render/project/src/backend/data`
   - Size: `5 GB`

### Paso 3 — Variable de entorno GITHUB_TOKEN

Los repos de datos son **públicos**, pero si Render da error de rate limit al clonarlos:

1. En tu servicio → **Environment** → **Add Environment Variable**
2. Key: `GITHUB_TOKEN`
3. Value: tu Personal Access Token de GitHub (Settings → Developer settings → Personal access tokens → Tokens classic → Generate new → solo marcar `public_repo`)

### Paso 4 — Deploy

1. Click **Deploy** (o push al repo → Render despliega automáticamente)

**¿Qué hace Render en el build?**
1. Instala Python + dependencias
2. Instala Node.js 20
3. Compila el frontend React → genera `backend/static/`
4. Clona los 4 repos de datos en `backend/data/`
5. Inicia el servidor

---

## ¿Qué pasa si el frontend sigue en blanco?

Verificar en `https://tu-servicio.onrender.com/api/health`:
- `static_ok: true` → frontend compilado correctamente
- `static_ok: false` → el build de React no se ejecutó

Ver logs en Render → si ves `npm run build` exitoso, el problema está resuelto.

---

## Endpoints de la API

| URL | Descripción |
|-----|-------------|
| `/api/health` | Estado de DBs y frontend |
| `/api/debug` | Diagnóstico completo |
| `/api/repos` | Lista las 4 fuentes |
| `/api/fuentes?repo=macro` | Cuadros disponibles |
| `/api/series?repo=...&fuente=...&frecuencia=...` | Series |
| `/api/dataset/build` (POST) | Construir dataset |
| `/docs` | Documentación interactiva |
