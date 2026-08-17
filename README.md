# Pereira Unida

MVP móvil-first para coordinar ayuda ciudadana tras una emergencia en Pereira y Dosquebradas: reportar necesidades (alimentos, herramientas, medicinas, rescate, energía/wifi, mascotas, ingeniería, transporte, voluntariado), hacerles seguimiento en tiempo real, comentarlas, buscar/registrar a familiares ("Estoy Bien") y consultar centros de acopio oficiales.

**Stack:** Next.js (App Router, TypeScript, RSC + Server Actions) · Tailwind CSS · lucide-react · MapLibre GL + OpenFreeMap (mapa vectorial sin API key) · Supabase (PostgreSQL + Realtime + Storage) · PWA (service worker propio, sin dependencias).

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor**, pega el contenido de [`schema.sql`](./schema.sql) y ejecútalo completo. Esto crea las tablas `reports`, `comments`, `collection_points` y `people_status`, el bucket de fotos `community-photos` (Storage), sus índices, las políticas de RLS y habilita Realtime. El archivo incluye bloques de migración marcados al final — son idempotentes, puedes volver a ejecutar el archivo completo sin duplicar nada. Si prefieres el flujo de `supabase db push`, las mismas migraciones están en [`supabase/migrations/`](./supabase/migrations). Nota: desde la migración `20260817010000_lock_down_rls.sql`, la lectura/escritura pública directa quedó cerrada para las tablas con datos sensibles o de escritura — ver "Notas de seguridad" más abajo antes de asumir que `select *`/`insert` funcionan con la anon key.
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

## API pública (único camino para consumir o enviar datos)

`/api/public/v1/ayudas` y `/api/public/v1/ayudantes` exponen en JSON las solicitudes de ayuda y las ofertas de ayuda activas (`GET`), y permiten registrar nuevas desde una app aliada (`POST`). Documentación interactiva (Swagger UI) en **`/docs/api`**, con spec OpenAPI en `/api/public/v1/openapi.json`.

Desde la migración `20260817010000_lock_down_rls.sql` (ver "Notas de seguridad"), la base de datos de Pereira Unida **no tiene ningún otro acceso público de lectura/escritura en bloque**: esta API, con key, es el único camino soportado para que un tercero consuma o envíe datos.

1. Define `PUBLIC_API_KEY` en las variables de entorno (una key larga y aleatoria, ej. `openssl rand -hex 24`). Sin esta variable, todos los endpoints responden `503` — la API queda deshabilitada por defecto.
2. Compartí esa key con quien vaya a consumir la API. La mandan como header `Authorization: Bearer <key>` (o `X-Api-Key: <key>`).
3. Entrá a `/docs/api`, tocá **Authorize**, pegá la key y probá los endpoints desde ahí mismo.

**Lectura (`GET`)** — parámetros de query: `municipio`, `categoria` (en `/ayudas`) o `habilidad` (en `/ayudantes`), `estado`, `limit` (máx. 200, 60 req/min por key). Ver el spec en `/docs/api` para el detalle completo.

**Envío (`POST`, 20 req/min por key)** — body JSON con los mismos campos que usa el propio formulario web (`title`/`category`/`municipality`/`lat`/`lng`/`contact_phone` en `/ayudas`; `full_name`/`skill`/`phone`/`municipality` en `/ayudantes`). Queda visible en la app de inmediato, con la misma validación y el mismo nivel de confianza que un envío anónimo desde la web (sin cuentas, sin cola de moderación — ver spec para el detalle de cada campo).

**Errores y rate limit**: todo error responde `{ "error": { "code": "...", "message": "..." } }` con un `code` estable (ej. `invalid_category`, `rate_limited`) para poder manejarlo sin parsear texto. Cada respuesta incluye los headers `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`.

**Nunca se expone `contact_phone` ni `phone`** — ni al leerlos (`GET`) ni haciéndolos de vuelta en la respuesta de un `POST` — aunque la propia app sí los muestre completos al usuario (ver "Notas de seguridad" más abajo): una cosa es que una persona vea un teléfono de a uno en la web, y otra muy distinta es que cualquier app con la key pueda exportar en bloque los teléfonos de personas en emergencia. Si necesitás que una app aliada también pueda iniciar contacto, lo mejor es agregar ese campo como opt-in explícito para esa integración puntual, no abrirlo por defecto a todo el que tenga la key.

## Fuentes externas que consumimos

Al revés de la sección anterior: acá Pereira Unida es quien lee datos de otras plataformas ciudadanas y oficiales del ecosistema de ayuda, y los muestra mezclados con lo propio pero **siempre con un sello de procedencia visible** (`components/FuenteBadge.tsx`, ver `EXTERNAL_FUENTE_LABELS` en `lib/types.ts`) — nunca se presentan como si fueran datos nuestros, y cada fuente se ve solo en la vista de la app que corresponde a su tipo de dato (centros de acopio, solicitudes/ofrecimientos de ayuda entre personas, vías cerradas y daños estructurales).

**El cómo (endpoints exactos, mecanismo de sincronización, qué fuente alimenta qué) es intencionalmente información interna, no documentada acá** — ver `lib/externalSync.ts` si tenés acceso al repo. La sincronización corre sola en cada visita, sin depender de Cron ni de infraestructura extra, y es tolerante a que cualquiera de las fuentes caiga o cambie de esquema sin afectar a las demás ni a los datos propios de Pereira Unida.

## Estructura relevante

```
schema.sql                    Esquema SQL de Supabase (tablas, RLS, Realtime) + migraciones al final
supabase/migrations/          Mismas migraciones en formato `supabase db push`
lib/externalSync.ts           Sincroniza fuentes externas hacia external_* (ver "Fuentes externas" arriba)
app/api/cron/sync-external/   Disparo manual de esa sincronización, protegido por CRON_SECRET
components/FuenteBadge.tsx    Sello de procedencia para datos de fuentes externas
lib/types.ts                  Tipos compartidos (Report, CollectionPoint, PeopleStatus, maskDocumentId...)
lib/utils.ts                  shareToWhatsApp, formatTimeAgo, googleMapsUrl
lib/supabase/config.ts        getSupabaseConfigError(): detecta placeholders antes de cualquier fetch
lib/supabase/client.ts        Cliente de Supabase para el navegador (Realtime)
lib/supabase/server.ts        Cliente de Supabase (anon) para Server Actions
lib/supabase/privileged.ts    Cliente de Supabase con service role (escrituras + people_status)
app/actions.ts                Server Actions: reports, comments, collection_points, people_status, rate limiting, getHomeData
app/page.tsx                  Server Component: getHomeData() (datos + error de configuración en español)
app/layout.tsx                Metadata PWA (manifest, iconos) + registro del service worker
components/HomeClient.tsx     Orquestador cliente: filtros, Realtime, estado
components/FamilyStatusModal.tsx  Red familiar: buscar por nombre/documento y "Estoy Bien"
components/CollectionPoints.tsx   Puntos de acopio: filtro por municipio + alta con PIN
lib/publicApi.ts               API key + rate limit + errores + campos públicos (sin teléfonos) para /api/public/v1
app/api/public/v1/             Endpoints públicos: ayudas y ayudantes (GET+POST), openapi.json
app/docs/api/page.tsx          Swagger UI (lee /api/public/v1/openapi.json)
lib/photos.ts                 Límites y validación de fotos (bucket community-photos)
components/PhotoPicker.tsx    Adjuntar hasta 3 fotos (cámara o galería)
components/PhotoStrip.tsx     Miniaturas de fotos en cards y búsqueda familiar
public/sw.js, manifest.webmanifest, offline.html   PWA sin dependencias externas
```

## Notas de seguridad

**Acceso directo a la base de datos: cerrado desde el 2026-08-17.** Hasta la migración `20260817010000_lock_down_rls.sql`, el modelo era RLS con lectura y escritura pública (`using (true)` / `with check (true)`) — o sea que cualquiera con la anon key (siempre visible en el bundle del navegador, normal en cualquier app Supabase) podía leer y escribir **directo** contra `https://<proyecto>.supabase.co/rest/v1/<tabla>` o vía Realtime, sin pasar por esta app. Eso incluía `document_id` (cédula) y `contact_number` de `people_status` sin ningún enmascarado, aunque la UI sí los enmascara (`maskDocumentId`) — la protección era solo cosmética. Si clonaste este repo antes de esa fecha, aplicá esa migración.

Modelo actual:

- **`people_status`** (red familiar: nombre, cédula, teléfono, ubicación) no tiene **ninguna** policy pública de RLS — ni siquiera `select`. Es 100% accesible solo desde el server, con `SUPABASE_SERVICE_ROLE_KEY` (`getPrivilegedSupabaseClient` en `lib/supabase/privileged.ts`). Sin esa variable configurada, el módulo "Estoy Bien" deja de funcionar por completo — es intencional: se prefiere fallar cerrado a exponer cédulas/teléfonos en bloque.
- **`reports`, `comments`, `collection_points`, `closed_roads`, `help_offers`, `rentals`, `rental_comments`** mantienen su policy de `select` pública (la necesita Realtime para seguir mostrando altas/cambios en vivo, y `contact_phone` en `reports` ya es intencionalmente público — ver más abajo). Lo que se cerró es la escritura: ya no hay policy pública de `insert`/`update`, así que un `POST` directo a PostgREST sin pasar por esta app queda bloqueado por RLS. Todo Server Action que escribe usa el mismo cliente privilegiado.
- **La única forma de consumir o enviar datos desde afuera es `/api/public/v1/*`** (ver arriba), con API key, rate limit y validación — nunca acceso directo a Postgres/PostgREST.

Estas son las demás mitigaciones puntuales que ya estaban implementadas y sus límites:

- **Rate limiting por IP, en memoria.** `app/actions.ts` limita `createReport`, `addComment`, `registerPersonStatus`, `updatePersonStatus` y `createCollectionPoint` (ver `checkRateLimit`). Es *best-effort*: vive en memoria del proceso, así que se resetea en cada redeploy y no se comparte entre instancias/regiones. Sirve para frenar abuso trivial, no reemplaza un rate limiter real (ej. Upstash) si el tráfico crece. Si no hay IP disponible en los headers, falla abierto (no limita) en vez de compartir un único bucket "unknown" entre clientes distintos.
- **Búsquedas de texto libre saneadas.** `getReports` y `searchPersonStatus` arman filtros `.or(...ilike...)` con lo que escribe el usuario. `sanitizeIlikeInput` quita `% _ , ( )` (caracteres con significado especial en `ilike`/`or` de PostgREST) y acota a 80 caracteres antes de interpolar, tanto en el cliente como aquí en el server.
- **Red familiar sin cuentas.** El "dueño" de un registro en `people_status` es quien tiene su `id` guardado en `localStorage` (`pereiraunida:my-status-ids`) en su propio dispositivo — no hay autenticación real, así que alguien con el id (ej. compartido por accidente) también podría cambiar ese estado a través de la app. `updatePersonStatus` solo permite tocar la columna `status`, nunca nombre/teléfono/cédula. La búsqueda ya no tiene refresco por Realtime (esa tabla no tiene policy pública, ver arriba); `FamilyStatusModal` hace polling cada ~20s mientras el modal está abierto.
- **Documento de identidad enmascarado en la UI, y ahora también a nivel de acceso.** Los resultados de búsqueda nunca muestran la cédula completa (`maskDocumentId`: solo los últimos 4 dígitos) — y desde el candado de RLS, tampoco es posible saltarse ese enmascarado pidiendo la fila cruda por REST. El teléfono de contacto sí se muestra completo a propósito dentro de la app — es una emergencia y se necesita poder llamar.
- **Fotos públicas a propósito.** El bucket `community-photos` es de lectura pública (CDN de Supabase) para que familia y voluntarios vean la imagen sin login. El server valida tipo (JPEG/PNG/WebP/HEIC), tamaño (5 MB) y cabecera del archivo; máximo 3 fotos por envío. No hay borrado desde el cliente.
- **Alta de acopio protegida por PIN, no por cuenta.** `createCollectionPoint` compara `ACOPIO_PIN` en tiempo constante (`timingSafeStringEqual`) contra un PIN compartido por el equipo organizador; inserta con `getPrivilegedSupabaseClient()`.
- **API pública protegida por key, deshabilitada por defecto.** `/api/public/v1/*` (ver arriba) exige `PUBLIC_API_KEY` — si no está definida, responde `503` en vez de quedar abierta por accidente. Igual que `ACOPIO_PIN`, la comparación es en tiempo constante. Tiene su propio rate limit en memoria por key (60/min lectura, 20/min escritura), con las mismas limitaciones que el de `app/actions.ts`.
- **Headers de seguridad a nivel de sitio.** `next.config.ts` agrega `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy` a toda respuesta — defensa en profundidad, no reemplaza lo anterior.

Antes de un uso prolongado en producción, considera agregar autenticación ligera, moderación de contenido y un rate limiter distribuido (ej. Upstash) para mitigar spam/abuso a mayor escala.

## PWA

La app funciona instalada (`manifest.webmanifest`, iconos en `public/icon*`) y tiene un service worker propio (`public/sw.js`, sin `next-pwa`) que:

- Cachea el shell estático (`_next/static/*`, inmutable por nombre de archivo con hash).
- En navegación sin red, muestra `public/offline.html` con las líneas de emergencia (Cruz Roja, Bomberos Pereira/Dosquebradas, Defensa Civil) que funcionan por llamada normal aunque no haya internet.
- **Nunca cachea datos en vivo**: reportes, red familiar y puntos de acopio siempre van a la red — cachearlos mostraría información de emergencia desactualizada.
- Solo se registra en producción (`components/PwaRegister.tsx`); en desarrollo interferiría con la recarga en caliente de Turbopack.

### Notificaciones push

Opt-in (campana en el header, `components/NotificationsOptIn.tsx`): avisa cuando alguien pide/ofrece ayuda o publica un arriendo en el municipio elegido. Web Push estándar con VAPID, sin servicio de terceros — el propio `public/sw.js` recibe el push y muestra la notificación.

1. Generá el par de claves: `npx web-push generate-vapid-keys`.
2. Definí `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (`mailto:tu-correo`) en las variables de entorno. Sin estas tres, la campana no aparece — feature apagada por defecto, no rota nada.
3. En iPhone/iPad solo funciona si la persona ya instaló la app (Apple no entrega Web Push a una pestaña suelta de Safari); si falla por eso, el botón lo explica en el momento.

`lib/push.ts` tiene un enfriamiento de 10 minutos por dispositivo entre notificaciones (cualquier tema) para no saturar durante una emergencia con mucho volumen de reportes, y borra solas las suscripciones vencidas (410/404 del navegador).
