# Pereira Unida

MVP móvil-first para coordinar ayuda ciudadana tras una emergencia en Pereira y Dosquebradas: reportar necesidades (alimentos, herramientas, medicinas, rescate, energía/wifi, mascotas, ingeniería, transporte, voluntariado), hacerles seguimiento en tiempo real, comentarlas, buscar/registrar a familiares ("Estoy Bien") y consultar centros de acopio oficiales.

**Stack:** Next.js (App Router, TypeScript, RSC + Server Actions) · Tailwind CSS · lucide-react · MapLibre GL + OpenFreeMap (mapa vectorial sin API key) · Supabase (PostgreSQL + Realtime + Storage) · PWA (service worker propio, sin dependencias).

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor**, pega el contenido de [`schema.sql`](./schema.sql) y ejecútalo completo. Esto crea las tablas `reports`, `comments`, `collection_points` y `people_status`, el bucket de fotos `community-photos` (Storage), sus índices, las políticas de RLS (lectura pública / escritura libre, sin autenticación) y habilita Realtime. El archivo incluye bloques de migración marcados al final — son idempotentes, puedes volver a ejecutar el archivo completo sin duplicar nada. Si prefieres el flujo de `supabase db push`, las mismas migraciones están en [`supabase/migrations/`](./supabase/migrations).
3. Copia la **Project URL** y la **anon public key** desde *Project Settings → API*.

## 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Completa `.env.local` con tus credenciales (ver [`.env.local.example`](./.env.local.example)):

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
NEXT_PUBLIC_SITE_URL=https://tu-dominio.vercel.app
ACOPIO_PIN=cambia-este-pin
```

El mapa usa [MapLibre](https://maplibre.org) + teselas de [OpenFreeMap](https://openfreemap.org) (OpenStreetMap). No necesita API key. “Cómo llegar” abre Google Maps en el teléfono, que tampoco pide clave.

`ACOPIO_PIN` habilita el formulario para agregar centros de acopio nuevos (protegido por PIN compartido, sin cuentas). Si no lo defines, ese formulario simplemente no aparece.

### Si ves "fetch failed" (o la home se ve vacía sin explicación)

`.env.local` viene con placeholders (`https://placeholder.supabase.co` / `placeholder-anon-key`) para que `npm install && npm run dev` arranque sin crashear. Con esos placeholders puestos, la app **no intenta conectarse a Supabase**: `getHomeData()` detecta el placeholder antes de hacer cualquier fetch y muestra un aviso en español en la propia página en vez de loguear `TypeError: fetch failed` en la consola.

Para que la app funcione de verdad:

1. Crea un proyecto real en [supabase.com](https://supabase.com) (ver paso 1 arriba).
2. Pega la **Project URL** y la **anon public key** reales en `.env.local` (Project Settings → API).
3. Ejecuta [`schema.sql`](./schema.sql) completo en el SQL Editor (si te falta este paso, verás "Falta aplicar schema.sql en el SQL Editor de Supabase" en vez del placeholder).
4. Reinicia `npm run dev` (las env vars solo se leen al arrancar).

Si después de esto sigues viendo un error de conexión, es una `URL`/`anon key` real pero inalcanzable (proyecto pausado, typo, red sin salida a `supabase.co`) — no un placeholder.

### Fotos (Pedir ayuda + Familia)

Las fotos van a **Supabase Storage**, no a MinIO ni a un disco del servidor:

| Opción | ¿Sirve en Vercel producción? | Por qué |
|--------|------------------------------|---------|
| **Supabase Storage** (elegido) | Sí | Ya usamos Supabase. Plan gratuito (~1 GB + CDN). Misma URL/anon key. Sin VM. |
| Vercel Blob | Sí | También vale, pero duplicaría proveedores. |
| MinIO | No, tal cual | Necesita un servidor 24/7 (S3 self-hosted). En Vercel no hay disco persistente. |

Después de aplicar `schema.sql` (o la migración `20260813120000_photos.sql`) queda el bucket público `community-photos`. Hasta 3 fotos por reporte o por registro familiar, 5 MB, JPEG/PNG/WebP/HEIC. Si el bucket no existe, el envío de fotos muestra un error pidiendo ejecutar esa migración.

## 3. Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## 4. Desplegar en Vercel

```bash
npx vercel
```

Agrega las mismas variables de entorno del proyecto de Vercel (Settings → Environment Variables) y despliega a producción con `npx vercel --prod`.

## API pública (para que otras apps consuman datos)

`/api/public/v1/ayudas` y `/api/public/v1/ayudantes` exponen en JSON, de solo lectura, las solicitudes de ayuda y las ofertas de ayuda activas. Documentación interactiva (Swagger UI) en **`/docs/api`**, con spec OpenAPI en `/api/public/v1/openapi.json`.

1. Define `PUBLIC_API_KEY` en las variables de entorno (una key larga y aleatoria, ej. `openssl rand -hex 24`). Sin esta variable, ambos endpoints responden `503` — la API queda deshabilitada por defecto.
2. Compartí esa key con quien vaya a consumir la API. La mandan como header `Authorization: Bearer <key>` (o `X-Api-Key: <key>`).
3. Entrá a `/docs/api`, tocá **Authorize**, pegá la key y probá los endpoints desde ahí mismo.

Parámetros de query: `municipio`, `categoria` (en `/ayudas`) o `habilidad` (en `/ayudantes`), `estado`, `limit` (máx. 200). Ver el spec en `/docs/api` para el detalle completo.

**Nunca se expone `contact_phone` ni `phone`** aunque la propia app sí los muestre completos al usuario (ver "Notas de seguridad" más abajo): una cosa es que una persona vea un teléfono de a uno en la web, y otra muy distinta es que cualquier app con la key pueda exportar en bloque los teléfonos de personas en emergencia. Si necesitás que una app aliada también pueda iniciar contacto, lo mejor es agregar ese campo como opt-in explícito para esa integración puntual, no abrirlo por defecto a todo el que tenga la key.

## Estructura relevante

```
schema.sql                    Esquema SQL de Supabase (tablas, RLS, Realtime) + migraciones al final
supabase/migrations/          Mismas migraciones en formato `supabase db push`
lib/types.ts                  Tipos compartidos (Report, CollectionPoint, PeopleStatus, maskDocumentId...)
lib/utils.ts                  shareToWhatsApp, formatTimeAgo, googleMapsUrl
lib/supabase/config.ts        getSupabaseConfigError(): detecta placeholders antes de cualquier fetch
lib/supabase/client.ts        Cliente de Supabase para el navegador (Realtime)
lib/supabase/server.ts        Cliente de Supabase (anon) para Server Actions
app/actions.ts                Server Actions: reports, comments, collection_points, people_status, rate limiting, getHomeData
app/page.tsx                  Server Component: getHomeData() (datos + error de configuración en español)
app/layout.tsx                Metadata PWA (manifest, iconos) + registro del service worker
components/HomeClient.tsx     Orquestador cliente: filtros, Realtime, estado
components/FamilyStatusModal.tsx  Red familiar: buscar por nombre/documento y "Estoy Bien"
components/CollectionPoints.tsx   Puntos de acopio: filtro por municipio + alta con PIN
lib/publicApi.ts               API key + rate limit + campos públicos (sin teléfonos) para /api/public/v1
app/api/public/v1/             Endpoints públicos: ayudas, ayudantes, openapi.json
app/docs/api/page.tsx          Swagger UI (lee /api/public/v1/openapi.json)
lib/photos.ts                 Límites y validación de fotos (bucket community-photos)
components/PhotoPicker.tsx    Adjuntar hasta 3 fotos (cámara o galería)
components/PhotoStrip.tsx     Miniaturas de fotos en cards y búsqueda familiar
public/sw.js, manifest.webmanifest, offline.html   PWA sin dependencias externas
```

## Notas de seguridad

Este MVP usa RLS con lectura y escritura pública (sin login) para permitir reportes inmediatos durante una emergencia. Es un modelo deliberadamente abierto; estas son las mitigaciones puntuales que sí están implementadas y sus límites:

- **Rate limiting por IP, en memoria.** `app/actions.ts` limita `createReport`, `addComment`, `registerPersonStatus`, `updatePersonStatus` y `createCollectionPoint` (ver `checkRateLimit`). Es *best-effort*: vive en memoria del proceso, así que se resetea en cada redeploy y no se comparte entre instancias/regiones. Sirve para frenar abuso trivial, no reemplaza un rate limiter real (ej. Upstash) si el tráfico crece. Si no hay IP disponible en los headers, falla abierto (no limita) en vez de compartir un único bucket "unknown" entre clientes distintos.
- **Búsquedas de texto libre saneadas.** `getReports` y `searchPersonStatus` arman filtros `.or(...ilike...)` con lo que escribe el usuario. `sanitizeIlikeInput` quita `% _ , ( )` (caracteres con significado especial en `ilike`/`or` de PostgREST) y acota a 80 caracteres antes de interpolar, tanto en el cliente como aquí en el server.
- **Red familiar sin cuentas.** Cualquiera puede insertar/actualizar `people_status` (RLS `select`/`insert`/`update` públicas). El "dueño" de un registro es quien tiene su `id` guardado en `localStorage` (`pereiraunida:my-status-ids`) en su propio dispositivo — no hay autenticación real, así que alguien con el id (ej. compartido por accidente) también podría cambiar ese estado. `updatePersonStatus` solo permite tocar la columna `status`, nunca nombre/teléfono/cédula.
- **Documento de identidad enmascarado.** Los resultados de búsqueda nunca muestran la cédula completa (`maskDocumentId`: solo los últimos 4 dígitos). El teléfono de contacto sí se muestra completo a propósito — es una emergencia y se necesita poder llamar.
- **Fotos públicas a propósito.** El bucket `community-photos` es de lectura pública (CDN de Supabase) para que familia y voluntarios vean la imagen sin login. El server valida tipo (JPEG/PNG/WebP/HEIC), tamaño (5 MB) y cabecera del archivo; máximo 3 fotos por envío. No hay borrado desde el cliente.
- **Alta de acopio protegida por PIN, no por cuenta.** `createCollectionPoint` compara `ACOPIO_PIN` en tiempo constante (`timingSafeStringEqual`) contra un PIN compartido por el equipo organizador. Si defines `SUPABASE_SERVICE_ROLE_KEY`, el insert se hace con esa clave (bypass controlado de RLS) y puedes cerrar la policy pública de insert (ver el paso opcional al final de la migración en `schema.sql`). Si no la defines, el insert sigue abierto a la anon key — el PIN es la única barrera real en ese caso.

- **API pública protegida por key, deshabilitada por defecto.** `/api/public/v1/*` (ver arriba) exige `PUBLIC_API_KEY` — si no está definida, responde `503` en vez de quedar abierta por accidente. Igual que `ACOPIO_PIN`, la comparación es en tiempo constante. Tiene su propio rate limit en memoria (por key, no por IP) con las mismas limitaciones que el de `app/actions.ts`.

Antes de un uso prolongado en producción, considera agregar autenticación ligera, moderación de contenido y un rate limiter distribuido para mitigar spam/abuso a mayor escala.

## PWA

La app funciona instalada (`manifest.webmanifest`, iconos en `public/icon*`) y tiene un service worker propio (`public/sw.js`, sin `next-pwa`) que:

- Cachea el shell estático (`_next/static/*`, inmutable por nombre de archivo con hash).
- En navegación sin red, muestra `public/offline.html` con las líneas de emergencia (Cruz Roja, Bomberos Pereira/Dosquebradas, Defensa Civil) que funcionan por llamada normal aunque no haya internet.
- **Nunca cachea datos en vivo**: reportes, red familiar y puntos de acopio siempre van a la red — cachearlos mostraría información de emergencia desactualizada.
- Solo se registra en producción (`components/PwaRegister.tsx`); en desarrollo interferiría con la recarga en caliente de Turbopack.
