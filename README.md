# BCRA Dashboard

Dashboard web de indicadores económicos del **Banco Central de la República Argentina**, construido con Next.js 14, TypeScript y Tailwind CSS.

Consume la **API oficial del BCRA — Principales Variables v4.0** desde el servidor, con ISR (Incremental Static Regeneration) y revalidación automática vía GitHub Actions.

---

## Características

- **Dashboard** con KPI cards (USD mayorista, reservas, BADLAR, inflación) y sparklines de 30 días
- **Histórico** con tabla filtrable por fecha, paginación y exportación a CSV
- **Comparador de series** con hasta 6 variables simultáneas, modo base 100 (normalizado)
- **Ratio builder** para calcular el cociente entre dos variables a lo largo del tiempo
- **Caché ISR** server-side con revalidación por tag (1h TTL + on-demand)
- **Actualización automática** vía GitHub Actions: 20:30 y 01:00 ART
- Diseño responsive · manejo de errores · loading states · empty states

---

## Stack

| Tecnología | Uso |
|---|---|
| Next.js 14 (App Router) | Framework full-stack |
| TypeScript | Tipado |
| Tailwind CSS | Estilos |
| Recharts | Gráficos |
| GitHub Actions | Cron de revalidación |
| Vercel | Deploy |

---

## Instalación y desarrollo

### 1. Pre-requisitos

```bash
# Instalar Node.js (recomendado: LTS)
brew install node   # macOS con Homebrew
# o desde https://nodejs.org
node --version      # debe ser >= 18
```

### 2. Clonar e instalar dependencias

```bash
git clone https://github.com/tu-usuario/bcra-dashboard.git
cd bcra-dashboard
npm install
```

### 3. Variables de entorno

```bash
cp .env.local.example .env.local
```

Editá `.env.local` y completá:

```env
# Secret para proteger el endpoint de revalidación
# Generalo con: openssl rand -hex 32
CRON_SECRET=pon-tu-secret-aleatorio-aqui
```

> La API del BCRA es pública y no requiere token. Las otras variables son opcionales.

### 4. Correr en desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000) en el navegador.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── dashboard/page.tsx          # Dashboard principal (server component)
│   ├── historico/page.tsx          # Tabla histórica + CSV
│   ├── series/page.tsx             # Comparador de series + ratios
│   └── api/
│       ├── bcra/
│       │   ├── variables/route.ts          # GET: todas las variables
│       │   ├── variables/[id]/route.ts     # GET: histórico de una variable
│       │   └── historico/[id]/route.ts     # GET: histórico (alias, más datos)
│       └── cron/
│           └── revalidate/route.ts         # POST/GET: invalida caché
├── lib/
│   └── bcra/
│       ├── client.ts       # Cliente API BCRA (con caché unstable_cache)
│       ├── types.ts        # TypeScript types
│       ├── constants.ts    # Variable IDs, colores, metadata
│       └── format.ts       # Formateo de valores, fechas, CSV
└── components/
    ├── dashboard/          # KPICard, SparklineChart
    ├── charts/             # HistoricalChart, SeriesComparator, RatioChart
    ├── table/              # DataTable con paginación y filtros
    ├── layout/             # Navbar
    └── ui/                 # ErrorState, LoadingState, EmptyState, Badge
```

---

## API del BCRA

Base URL: `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias`

| Endpoint | Descripción |
|---|---|
| `GET /` | Lista todas las variables con último valor (1177 series) |
| `GET /{id}` | Histórico paginado de una variable |
| `GET /{id}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limit=N` | Histórico por rango de fechas |

### Variables principales

| ID | Variable | Unidad |
|---|---|---|
| 1 | Reservas internacionales | Millones USD |
| 4 | Tipo de cambio minorista | ARS/USD |
| 5 | Tipo de cambio mayorista | ARS/USD |
| 7 | BADLAR bancos privados | % n.a. |
| 8 | TM20 bancos privados | % n.a. |
| 15 | Base monetaria | Millones ARS |
| 27 | Inflación mensual (IPC) | % |
| 28 | Inflación interanual (IPC) | % |
| 31 | UVA | ARS |
| 30 | CER | Índice |

---

## Endpoints propios (API proxy)

| Ruta | Descripción |
|---|---|
| `GET /api/bcra/variables` | Todas las variables (cacheado) |
| `GET /api/bcra/variables/[id]?desde=&hasta=&limit=` | Histórico de una variable |
| `GET /api/bcra/historico/[id]?desde=&hasta=` | Histórico extendido |
| `GET /api/cron/revalidate?secret=TU_SECRET` | Invalida caché BCRA |

---

## Estrategia de caché y actualización

El BCRA actualiza los datos entre las **20:00 y 21:00 ART** en días hábiles.

### Con Vercel Free (implementado)

Se usa **ISR (Incremental Static Regeneration)** con `revalidate: 3600` (1 hora):
- Los datos se refrescan automáticamente cuando hay un request y la caché tiene más de 1 hora
- Sin costo adicional, sin Cron Jobs de Vercel

**GitHub Actions revalida la caché en horarios específicos:**

| Hora ART | Hora UTC | Motivo |
|---|---|---|
| 20:30 | 23:30 | Cierre de operaciones del BCRA |
| 01:00 | 04:00 | Verificación nocturna |

### Con Vercel Pro (opcional)

Podés agregar cron jobs nativos en `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/revalidate", "schedule": "30 23 * * *" },
    { "path": "/api/cron/revalidate", "schedule": "0 4 * * *" }
  ]
}
```

Y protegerlos con `CRON_SECRET` en las variables de entorno de Vercel.

---

## Deploy en Vercel

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: initial BCRA Dashboard"
git remote add origin https://github.com/tu-usuario/bcra-dashboard.git
git push -u origin main
```

### 2. Importar en Vercel

1. Ir a [vercel.com/new](https://vercel.com/new)
2. Conectar con GitHub y seleccionar el repositorio
3. Vercel detecta Next.js automáticamente
4. Agregar variables de entorno:
   - `CRON_SECRET` → el mismo valor que en `.env.local`

### 3. Configurar GitHub Secrets (para el cron)

En el repositorio de GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Valor |
|---|---|
| `VERCEL_APP_URL` | `https://tu-app.vercel.app` |
| `CRON_SECRET` | El mismo valor de `.env.local` |

Una vez configurados, GitHub Actions correrá automáticamente a las 20:30 y 01:00 ART.

---

## Build para producción

```bash
npm run build
npm start
```

---

## Desarrollo adicional

### Agregar una nueva variable al dashboard

1. Encontrar el `idVariable` en la API: `GET /api/bcra/variables`
2. Agregar en `src/lib/bcra/constants.ts`:
   ```ts
   99: {
     label: "Mi Variable",
     color: "#ff6b6b",
     suffix: "%",
     decimals: 2,
     featured: true,
     dashboardOrder: 7,
   }
   ```
3. Agregar el ID a `DASHBOARD_VARIABLE_IDS` si querés que aparezca en el dashboard

### Revalidar la caché manualmente

```bash
curl "https://tu-app.vercel.app/api/cron/revalidate?secret=TU_CRON_SECRET"
```

---

## Licencia

MIT — Datos provistos por la API oficial del BCRA.
