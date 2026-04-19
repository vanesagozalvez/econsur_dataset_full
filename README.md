# EconSur · Dataset Studio

**Estación de trabajo macroeconómica unificada** para Argentina. Consolida 4 repositorios de datos del INDEC en una sola interfaz para construir, visualizar y exportar datasets personalizados.

---

## Repositorios de datos (todos públicos en GitHub)

| Repo | Contenido | DBs requeridas |
|------|-----------|----------------|
| `econsur_macro_indec` | Cuentas nacionales, EMAE, IPI (~1980 series) | `macro_indec1.db`, `macro_indec2_final.db`, `series_metadata1.json`, `series_metadata2_final.json` |
| `econsur_saldo_comercial` | Comercio exterior ICA | `saldo_comercial1.db`, `saldo_comercial2.db` |
| `econsur_empleo_ingresos` | EPH, EIL, OEDE, salarios | `empleo_e_ingresos.db`, `empleo_e_ingresos2.db`, `empleo_e_ingresos3.db` |
| `econsur_precios_ipc` | IPC, IPIM, IPIB, ICC | `data_ipc_indec.db`, `data_apendice4.db` |

---

## Estructura del proyecto

```
econsur_dataset_full/
├── backend/
│   ├── main.py              # FastAPI — motor unificado
│   ├── requirements.txt
│   └── data/
│       ├── macro_indec/     ← archivos del repo econsur_macro_indec
│       ├── saldo_comercial/ ← archivos del repo econsur_saldo_comercial
│       ├── empleo_ingresos/ ← archivos del repo econsur_empleo_ingresos
│       └── precios_ipc/     ← archivos del repo econsur_precios_ipc
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── BuilderPanel.jsx
│   │   │   ├── SerieSelector.jsx
│   │   │   ├── DatasetTab.jsx
│   │   │   └── ChartPanel.jsx
│   │   ├── hooks/
│   │   │   └── useLocalStorage.js
│   │   └── utils/
│   │       └── api.js
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── render.yaml              # Blueprint Render.com
└── README.md
```

---

## Desarrollo local

### 1. Clonar y configurar datos

```bash
git clone https://github.com/TU_USUARIO/econsur_dataset_full.git
cd econsur_dataset_full

# Clonar los 4 repos de datos dentro de backend/data/
cd backend/data
git clone https://github.com/TU_USUARIO/econsur_macro_indec.git   macro_indec
git clone https://github.com/TU_USUARIO/econsur_saldo_comercial.git saldo_comercial
git clone https://github.com/TU_USUARIO/econsur_empleo_ingresos.git empleo_ingresos
git clone https://github.com/TU_USUARIO/econsur_precios_ipc.git    precios_ipc
cd ../..
```

> **Nota:** Los repos son públicos. El backend detecta automáticamente qué DBs están disponibles
> y expone solo las fuentes con archivos presentes.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000/api/debug
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Deploy en Render (paso a paso)

### Opción A — Arquitectura desacoplada (recomendada)

Render despliega **dos servicios** desde el mismo repo usando `render.yaml`:

1. **`econsur-api`** — Web Service Python (FastAPI)
2. **`econsur-frontend`** — Static Site (React/Vite)

#### Pasos:

**1. Crear el repositorio**
```bash
git init
git add .
git commit -m "Initial commit EconSur Dataset Studio"
git remote add origin https://github.com/TU_USUARIO/econsur_dataset_full.git
git push -u origin main
```

**2. Conectar los datos**

Opción recomendada — **subcarpetas del repo principal** (si las DBs pesan < 100 MB c/u):
```bash
# Copiar los archivos .db directamente en las carpetas data/
cp /ruta/a/macro_indec1.db         backend/data/macro_indec/
cp /ruta/a/macro_indec2_final.db   backend/data/macro_indec/
cp /ruta/a/series_metadata1.json   backend/data/macro_indec/
cp /ruta/a/series_metadata2_final.json backend/data/macro_indec/
cp /ruta/a/saldo_comercial1.db     backend/data/saldo_comercial/
cp /ruta/a/saldo_comercial2.db     backend/data/saldo_comercial/
cp /ruta/a/empleo_e_ingresos.db    backend/data/empleo_ingresos/
cp /ruta/a/empleo_e_ingresos2.db   backend/data/empleo_ingresos/
cp /ruta/a/empleo_e_ingresos3.db   backend/data/empleo_ingresos/
cp /ruta/a/data_ipc_indec.db       backend/data/precios_ipc/
cp /ruta/a/data_apendice4.db       backend/data/precios_ipc/
git add backend/data/
git commit -m "Agregar bases de datos"
git push
```

Opción para archivos grandes — **Render Persistent Disk**:
```yaml
# En render.yaml, el disco ya está configurado en mount path /opt/render/project/src/data
# Subir archivos via Render Shell:
# render ssh <service-id>
# cp /fuente/*.db /opt/render/project/src/data/macro_indec/
```

**3. Deploy en Render**

1. Ir a [render.com](https://render.com) → **New → Blueprint**
2. Conectar el repositorio `econsur_dataset_full`
3. Render detecta `render.yaml` automáticamente y crea ambos servicios
4. Configurar variable de entorno en el Static Site:
   - Key: `VITE_API_URL`
   - Value: `https://econsur-api.onrender.com` (URL del Web Service)
5. Click **Apply**

#### URLs resultantes:
- API: `https://econsur-api.onrender.com`
- Frontend: `https://econsur-frontend.onrender.com`
- Swagger: `https://econsur-api.onrender.com/docs`
- Health: `https://econsur-api.onrender.com/api/health`

---

### Opción B — Monorepo (backend sirve el frontend)

Alternativa más simple: el backend FastAPI sirve el build de React como archivos estáticos.

```bash
# En frontend/
npm run build
# Copiar dist/ a backend/static/
cp -r frontend/dist/* backend/static/
```

```yaml
# render.yaml simplificado para un solo servicio:
services:
  - type: web
    name: econsur
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:$PORT
```

---

## API — Endpoints principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/repos` | Lista los 4 repositorios con disponibilidad |
| GET | `/api/fuentes?repo=macro` | Cuadros/fuentes del repo |
| GET | `/api/frecuencias?repo=&fuente=` | Frecuencias disponibles |
| GET | `/api/series?repo=&fuente=&frecuencia=` | Series de una fuente |
| GET | `/api/periodos?repo=&fuente=&frecuencia=&serie=` | Rango de fechas |
| GET | `/api/datos?...&desde=&hasta=` | Datos de una serie |
| POST | `/api/dataset/build` | Construir dataset multi-serie alineado |
| POST | `/api/dataset/export/csv` | Exportar dataset como CSV |
| GET | `/api/health` | Estado de todas las DBs |
| GET | `/api/debug` | Diagnóstico completo |

---

## Funcionalidades

- **Hasta 20 series** por dataset de las 4 fuentes
- **5 datasets guardados** con persistencia en localStorage
- **Gráfico interactivo** (Plotly): línea, barras, área
- **2 series simultáneas** con eje Y independiente
- **Medias móviles** simples: MM3, MM4, MM12
- **Exportación PNG** del gráfico activo (2x resolución)
- **Exportación CSV** del dataset procesado
- **Vista tabla** con paginación
- **Vista metadata** con detalle de fuentes

---

## Stack

- **Backend:** Python 3.11 · FastAPI · Pandas · SQLite · Uvicorn/Gunicorn
- **Frontend:** React 18 · Vite · Tailwind CSS · Plotly.js
- **Deploy:** Render.com (Web Service + Static Site)
- **Datos:** INDEC · Ministerio de Trabajo · BCRA
