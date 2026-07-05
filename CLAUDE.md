# CLAUDE.md — Baile Latino Platform

## Qué es este proyecto
Plataforma ecosistema para la comunidad de baile social latino (bachata y salsa) en Chile y eventualmente Latinoamérica. No es solo una app de eventos: es el ecosistema completo donde bailarines, organizadores, profesores, DJs, artistas, coreógrafos, filmmakers y venues conviven, se encuentran y hacen negocios.

**Principio central:** todo está conectado. El organizador arma su evento, contrata al DJ, vende entradas, gestiona acceso y paga al filmmaker desde un solo lugar. El bailarín tiene un perfil único que lo sigue en todo: ELO, historial, créditos y badges.

---

## Decisiones de arquitectura tomadas

### Una sola API, arquitectura modular
- **No microservicios** en esta etapa. Un solo NestJS con módulos bien separados.
- Cada módulo encapsula su lógica (controller + service + dto). Si el día de mañana un módulo necesita escalar por separado (ej: competencias con DareDance), se extrae. El código ya estará separado.
- Patrón: **modular monolith primero, microservicios solo si es necesario después**.
- **`auth` nunca se separa** — todos los módulos lo necesitan y tenerlo como llamada de red en cada request agrega latencia innecesaria.

### Reglas de comunicación entre módulos (crítico para futura extracción)
Estas reglas hacen que separar un módulo en el futuro sea una tarde de trabajo, no una reescritura:

1. **Nunca importar repositorios/entidades de otro módulo directamente.**
   - MAL: `import { UserRepository } from '../auth/user.repository'`
   - BIEN: inyectar `AuthService` y llamar a sus métodos públicos

2. **Comunicación solo a través de servicios públicos exportados.**
   - Cada módulo exporta solo lo que otros necesitan en su `*.module.ts`
   - Si EventsModule necesita datos del usuario, llama a `AuthService.findById()`, nunca accede a la tabla `users` directamente

3. **Nunca compartir modelos de Prisma entre módulos.**
   - Cada módulo trabaja con sus propias tablas
   - Los tipos compartidos viven en `packages/types/`, no en el código de la API

4. **Para operaciones asíncronas entre módulos usar BullMQ.**
   - Ejemplo: cuando se vende una entrada, PaymentsModule emite un job, AccessModule lo consume para generar el QR
   - Nunca llamadas síncronas encadenadas entre más de 2 módulos

5. **Las interfaces de respuesta siempre desde `@baile-latino/types`.**
   - Lo que un módulo retorna al cliente siempre está tipado con interfaces del paquete compartido
   - Nunca retornar entidades de Prisma directamente — siempre mapear a DTOs

### Monorepo con Turborepo + pnpm workspaces
- Un solo repositorio git para todo.
- `apps/` son ejecutables (se despliegan por separado).
- `packages/` son librerías internas (solo se importan, nunca se despliegan solas).

### Un agente para empezar
- Arrancamos con una sola sesión de Claude Code.
- Los agentes especializados (api-agent, web-agent, mobile-agent) se configuran en Fase 2 cuando el monorepo crezca.
- Cuando se activen: `.claude/agents/` en la raíz del monorepo.

### Framework API: NestJS
- Elegido sobre Fastify/Hono porque el desarrollador tiene experiencia en Angular.
- NestJS es Angular para el backend: mismos decoradores, DI, módulos, guards, interceptors.
- Adapter de Fastify para rendimiento (`@nestjs/platform-fastify`).

### Clientes
- `apps/web/` → Next.js 14 (panel del organizador + super admin). Escritorio.
- `apps/mobile/` → React Native + Expo (app de la comunidad). Todos los demás roles.
- El super admin vive bajo `apps/web/app/admin/` con middleware de rol `SUPER_ADMIN`. No necesita app separada.

---

## Estructura del monorepo

```
baile-latino/
├── CLAUDE.md                  ← estás aquí
├── README.md
├── package.json               ← workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
│
├── apps/
│   ├── api/                   ← NestJS (backend de toda la plataforma)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── auth/
│   │   │   ├── events/
│   │   │   ├── payments/
│   │   │   ├── access/
│   │   │   ├── ai-chat/
│   │   │   ├── music/
│   │   │   ├── community/
│   │   │   ├── credits/
│   │   │   ├── classes/
│   │   │   ├── competitions/
│   │   │   ├── choreography/
│   │   │   ├── talent/
│   │   │   ├── studios/
│   │   │   └── products/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── web/                   ← Next.js 14 (panel organizador + admin)
│   │   ├── app/
│   │   │   ├── (organizer)/   ← rutas del organizador
│   │   │   │   ├── events/
│   │   │   │   ├── sales/
│   │   │   │   └── access/
│   │   │   └── admin/         ← super admin (solo tú)
│   │   │       ├── users/
│   │   │       └── platform/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── mobile/                ← React Native + Expo (comunidad)
│       ├── app/               ← Expo Router
│       ├── components/
│       ├── hooks/
│       ├── .env.example
│       └── package.json
│
└── packages/
    ├── types/                 ← tipos TypeScript compartidos
    │   └── src/index.ts       ← User, Event, Track, Playlist, Payment...
    ├── ui/                    ← componentes compartidos (Fase 2)
    └── config/
        └── tsconfig.base.json
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| API | NestJS 10 + Fastify adapter + TypeScript strict |
| ORM | Prisma 5 |
| DB | PostgreSQL (dev: SQLite con `file:./dev.db`) |
| Auth | JWT + Passport + Supabase Auth |
| Realtime | Socket.io (`@nestjs/platform-socket.io`) |
| Queues | BullMQ + Redis |
| Web | Next.js 14 App Router + Tailwind + React Query |
| Mobile | React Native + Expo 51 + NativeWind + Expo Router |
| Monorepo | Turborepo + pnpm workspaces |
| Pagos | Flow + Transbank Webpay Plus |
| IA | Anthropic Claude API (`claude-sonnet-4-6`) |
| Música | Spotify Web API + Web Playback SDK + YouTube Data API v3 + iFrame API |
| Storage | Supabase Storage |
| Email | Resend |
| SMS | Twilio |
| Push | Expo Push + Firebase FCM |
| Social | Meta Graph API (Instagram login + importar contenido) |
| Boletas | API SII (boletas electrónicas) |
| Hosting | Railway o Render |
| CDN | Cloudflare |
| Monitoreo | Sentry + PostHog |
| CI/CD | GitHub Actions |

---

## Variables de entorno

### apps/api/.env
```
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
PORT=3000
WEB_URL=http://localhost:3001
NODE_ENV=development
REDIS_URL=redis://localhost:6379
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
ANTHROPIC_API_KEY=
FLOW_API_KEY=
FLOW_SECRET_KEY=
FLOW_ENVIRONMENT=sandbox
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

### apps/web/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_APP_NAME=Baile Latino
```

### apps/mobile/.env
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_APP_NAME=Baile Latino
```

---

## Módulos del producto — descripción completa

### Fase 1 — MVP (construir primero)

#### 1. Auth + Perfiles
- Registro con email/password o login con Instagram (OAuth)
- Roles: BAILARIN, ORGANIZADOR, PROFESOR, DJ, ARTISTA, COREOGRAFO, FILMMAKER, VENUE, SUPER_ADMIN
- Estilos de baile: BACHATA_SENSUAL, BACHATA_TRADICIONAL, BACHATA_URBANA, SALSA_ON1, SALSA_ON2, SALSA_CUBANA
- JWT con refresh token
- Perfil: nombre, foto, ciudad, bio, handle de Instagram, estilos, rol
- ELO por estilo y rol (leader/follower), inicializa en 1000
- Créditos internos (no canjeables por efectivo)

#### 2. Gestión de eventos
- Tipos: sociales, eventos privados, shows con artistas, talleres, masterclasses, intensivos
- Crear evento: foto cover, fecha, lugar (venue), mix % bachata/salsa
- Hasta 3 capas de precio dinámico (preventa 1, 2, precio normal)
- Pre-pago simbólico con mínimo de asistentes para confirmar
- Fondos en custodia, liberados al ocurrir el evento
- Packs grupales con split automático de pago
- Notificaciones segmentadas por estilo de baile
- Simulador de rentabilidad y punto de equilibrio
- Curva de ventas vs eventos similares con alertas
- Gestión proactiva de cumpleaños (recordatorio, créditos de regalo)
- Inventario de equipos con responsable asignado
- Beneficios de venue canjeables por QR
- Eventos privados: cumpleaños, despedidas de soltero/a, corporativos

#### 3. Venta de entradas y pagos
- Pasarela: Flow + Transbank Webpay Plus
- QR único e intransferible por entrada
- Boletas electrónicas SII (IVA 19% en comisiones)
- Panel de ventas en tiempo real
- Reporte post-evento
- Packs combinados (ej: entrada + clase previa)
- Split automático entre organizador y plataforma
- Modelo de ingresos: fee base $2.000–$3.000 CLP por evento + comisión 3–4% por entrada

#### 4. Control de acceso presencial
- Escaneo de QR desde celular (expo-camera)
- Sistema de alertas y override para errores
- Registro de entrada en tiempo real
- Pulsera de tela reutilizable con chip NFC/RFID dual (Fase 3: hardware)
- Tarjeta/reloj/celular NFC
- Pilares RFID UHF para detección automática a distancia (eventos masivos como DareDance ~1.500 competidores)
- Reconocimiento facial premium opcional (consentimiento explícito, dato biométrico — Ley 19.628)
- Control de aforo por zona
- Canje de beneficios de venue por QR
- Arriendo de hardware RFID para eventos masivos (Fase 3)

#### 5. Chat IA del evento
- El organizador llena la información del evento
- Claude (`claude-sonnet-4-6`) responde dudas de asistentes 24/7
- Reduce DMs repetitivos del organizador
- Acepta fotos para contexto adicional
- Un chat por evento, aislado
- Usa la Anthropic API directamente

#### 6. Música y DJs
- Playlists híbridas: Spotify + YouTube en la misma lista
- Búsqueda en ambas plataformas simultáneamente
- Spotify Web Playback SDK (requiere Premium) + preview 30s como fallback
- YouTube iFrame API para reproducción
- Distribución % bachata/salsa en la playlist
- Solicitud y votación de canciones por los asistentes
- Comité musical colaborativo (hasta 3 DJs coordinando)
- Playlist anticipada con preview Spotify/YouTube
- Data premium de canciones por región (qué funciona en Santiago vs Viña)
- Tendencias en tiempo real durante el evento
- Canal de lanzamiento para artistas emergentes
- Votación comunitaria de canciones nuevas
- Warmup del evento (playlist pre-show)

### Fase 2 — Comunidad y economía

#### 7. Comunidad y red social
- Perfiles completos: ELO, historial de eventos, badges, nivel
- Conexiones con propósito: compañero de práctica, alumno/profesor, pareja de competencia
- Feed relevante por estilo/nivel/ciudad (NO cronológico, algoritmo de relevancia)
- Foro por academia (reemplaza grupos de WhatsApp)
- Foro temático (por estilo, por ciudad)
- Mapa de eventos con filtros (estilo, fecha, ciudad, nivel)
- Modo viajero: notificaciones de eventos en ciudad de destino
- Alertas para viajeros de baile que llegan a tu ciudad
- Conexión entre academias
- Estadísticas para sponsors (alcance, demografía)
- Módulo de auspicios para marcas
- Login con Instagram (Meta Graph API)
- Importar contenido de Instagram vinculado a eventos reales
- Compartir logros hacia Instagram (badges, ELO, resultados de competencia)
- Widget embebible para Instagram bio/web de la academia

#### 8. Créditos, pagos y gamificación
- Créditos SOLO por servicios, NO dinero electrónico
- No canjeables por efectivo (evita regulación CMF)
- Usos: entradas, salas, clases, bootcamps, productos, consumiciones, transferencias
- Transferencia entre usuarios (rifas, regalos, splits de grupo)
- Comisión solo en transferencias comerciales grandes
- Split automático de packs
- Rifas con pozo de créditos
- Misiones (ej: "asiste a 5 sociales este mes → gana 500 créditos")
- Badges y niveles de membresía (Bronce, Plata, Oro, Platino)
- Ranking de asistencia por ciudad y academia
- Créditos de cumpleaños automáticos
- Boletas electrónicas SII para todo

#### 9. Clases, coaching y bootcamps
- Calendario unificado del profesor (clases, ensayos, shows, bootcamps)
- Sync con Google Calendar y Apple Calendar
- Vista financiera proyectada (ingresos esperados del mes)
- Reserva de clases privadas con pago anticipado
- Política de cancelación configurable por profesor
- Seguimiento de evolución por habilidad: musicalidad, técnica, conexión, performance, improvisación
- CRM privado del profesor con notas y alumnos favoritos
- Notificaciones prioritarias a alumnos seleccionados
- Historial de lesiones del alumno
- Análisis de video con anotaciones por segundo
- Bootcamps con crowdfunding (mínimo de inscritos para confirmar el viaje)
- Coordinación entre profesores de distintas regiones
- Packs de clases y suscripción mensual
- Niveles de membresía por academia
- Salas de ensayo reservables desde el mismo módulo

### Fase 3 — Ecosistema avanzado

#### 10. Competencias y jueceo
- Inscripción por categoría con QR de competidor
- Sistema ELO por estilo y rol (leader/follower):
  - Bachata Sensual, Bachata Tradicional, Bachata Urbana
  - Salsa On1, Salsa On2, Salsa Cubana
- Brackets automáticos generados por ELO (emparejamiento justo)
- App de jueces con criterios y pesos configurables
- Puntaje ciego (jueces no se ven entre sí hasta enviar)
- Visibilidad configurable: tiempo real / suspenso / N-1 / solo al final
- Revelación dramática en pantalla del evento
- Jack and Jill con sorteo transparente y puntaje acumulado por rondas
- Gestión de acompañantes con QR diferenciado
- Historial de competencias en perfil del bailarín
- Cada categoría define su **duración exacta** (ej: 1:00 / 2:00) → al inscribirse, ofrecer encargar el **edit a esa medida** (y voice-drop del artista) vía el Marketplace de talento
- Cliente objetivo Fase 3: DareDance (~1.500 competidores)

#### 11. Coreografía y ensayos
- Estructura por secciones: intro, verso, coro, break, shine
- Looper de fragmentos con X repeticiones configurables
- Control de velocidad: 50% / 75% / 100%
- Metrónomo con conteos sincopados y saltos de compás (lógica específica del baile latino)
- Capas de audio: subir/bajar instrumentos individuales (clave, bongó, bajo, voz)
- Marcación visual de tiempos tipo karaoke
- Soporte para pasos alargados que "comen" tiempos (especificidad del baile latino)
- Integración con app de formaciones (Choreographic)
- Control de asistencia a ensayos
- Progreso semanal y countdown al estreno
- Coordinación de grabación (cuándo y quién filma)
- El looper / velocidad / capas de audio de esta sección son para **ensayar**; el **máster final** (edit producido a medida, a la duración exacta de competencia, con voice-drop opcional del artista) se encarga vía el **Marketplace de talento → Editores/Productores**

#### 12. Marketplace de talento
- Perfiles de DJs, filmmakers, artistas, coreógrafos, parejas pro
- Portafolio importado de Instagram/YouTube vinculado a eventos reales de la plataforma
- Disponibilidad visible en calendario
- Propuestas formales dentro de la app
- Historial verificado con reseñas de organizadores
- Contratación y pago dentro de la app
- Comisión por contratación: 5–10%
- Visibilidad para empresas externas (casinos, venues, empresas de eventos)
- Matching de parejas de práctica

##### Servicios de audio a medida (categoría "Editores / Productores")
Cubren un vacío real que YouTube no llena y que **no es pirateable** (son servicios bespoke, no archivos → alta disposición a pagar, sin competir con lo gratis):
- **Ediciones para competencia/coreografía:** corte a duración EXACTA de competencia (1:00 / 2:00), reestructuración (intro que arma → hits → corte limpio), mashups de 2+ temas, cambios de velocidad, silencios/marcas.
  - Flujo: brief (canción(es), duración exacta, referencias, deadline) → editor acepta/cotiza → **pago en custodia (escrow)** → entrega → revisiones → liberación de fondos + comisión.
  - Se conecta con **Competencias** (cada categoría conoce su duración exacta → ofrecer el edit "a esa medida" en la inscripción) y con **Coreografía** (esa sección es para *ensayar*; el máster final se produce/compra acá).
- **Voice-drops del artista (el "Cameo" del baile):** el artista graba, **en su propia voz**, el shoutout personalizado ("Academia X presenta…") o su tag para la coreo.
  - Legalmente limpio (voz propia + consentimiento del artista), viral (se comparte en redes = marketing), productizable con precio fijo por el artista.
  - Add-on en el perfil del artista.
  - **Priorizar primero** (limpio, alto margen, viral); las ediciones a medida después (escrow + comisión).
- **Nota legal:** los edits parten de canciones con copyright, pero al ser un **servicio para uso propio en performance** (no venta/streaming público) el riesgo es mucho menor que una tienda de descargas. Términos: el cliente declara tener derecho a la fuente y usa el edit para su propia performance. Los **voice-drops originales** del artista son la parte más limpia y la que más se empuja.

##### Principio de monetización de la música (importante)
- **NO construir el negocio sobre "vender canciones/descargas mp3":** se pierde contra el ripeo gratis de YouTube. Además, bajar de YouTube/Spotify viola sus términos (revocan API keys) e infringe copyright → responsabilidad de la SpA. **No hacerlo.**
- Lo que **sí** se paga: la **curaduría + data** (qué funciona por región/estilo — el verdadero moat), la **comodidad/flujo** (todo ordenado y con metadata) y lo **bespoke** (edits, voice-drops). El download del catálogo, a lo más, es un *perk* dentro de la suscripción, no el producto.
- **Distribución de audio propio de artistas** (originales, con derechos): modelo suscripción DJ + **reparto pro-rata mensual** al pozo de artistas (como pools/Spotify) — solo se distribuye lo recaudado. Ojo: **originales del artista = limpio**; **covers / "Bachata Version" de temas ajenos = obra derivada** que requiere licencia mecánica → arrancar solo con originales.
- Para el **artista**, el gancho de estar en Nectason es exposición + distribución + **que lo contraten** (este marketplace); la micro-regalía es el bonus, no el gancho.

#### 13. Salas de ensayo
- Catálogo de salas con disponibilidad en tiempo real
- Reserva online (sin pago = sin bloqueo del horario)
- Liberación automática si no se paga en X minutos
- Suscripción mensual con descuento para profesores
- Pago automático desde créditos internos
- Split de costo entre grupos de ensayo
- Dashboard de ingresos para el dueño de sala
- Protección de horarios prime (viernes/sábado noche)

#### 14. Marketplace de productos
- Zapatos de baile, ropa técnica, trajes, accesorios
- Modistas con seguimiento de pedido por etapas (diseño, corte, confección, entrega)
- Artesanas de accesorios (aros, tocados, adornos)
- Pegado de cristales en trajes
- Reseñas verificadas (solo compras reales)
- Portafolio de trajes vinculado a eventos donde se usaron
- Pago con créditos internos o Flow/Webpay

---

## Modelo de negocio

| Fuente | Detalle |
|--------|---------|
| Comisión por entrada | 3–4% por entrada vendida |
| Fee base por evento | $2.000–$3.000 CLP por evento creado |
| Suscripción organizadores | mensual/anual |
| Suscripción profesores | mensual/anual |
| Data premium DJs | qué canciones funcionan por región |
| Comisión marketplace talento | 5–10% por contratación |
| Arriendo hardware RFID | eventos masivos (DareDance) |
| Visibilidad premium | destacar en búsquedas y feed |
| Sponsors/auspicios | marcas que llegan a la comunidad |
| Marketplace productos | comisión por venta |

**Créditos:** prepago de servicios, NO dinero electrónico. No canjeables por efectivo, solo por servicios. El dinero circula dentro del ecosistema. No requiere licencia CMF.

---

## Aspectos legales (Chile)

- Constitución SpA online (~$150.000–$300.000 CLP, 1 día)
- Inicio de actividades SII: giro plataforma tecnológica y marketplace de servicios
- Términos y condiciones revisados por abogado Fintech (~$300.000–$800.000 CLP)
- El punto más crítico: naturaleza jurídica de los créditos internos
- Política de privacidad: Ley 19.628
- Consentimiento explícito para reconocimiento facial (dato biométrico)
- Boletas electrónicas SII; IVA 19% en comisiones
- NO requiere licencia CMF ni de operador de pagos
- Costo total para arrancar legal: menos de $1.500.000 CLP

---

## Ventaja competitiva

- **vs. Passline/Puntoticket:** resuelven solo venta de entradas (5% del problema). No entienden sociales, Jack and Jill, shine ni estrenos. Sin comunidad ni conexión de actores.
- **vs. herramientas genéricas:** no conocen la lógica rítmica del baile latino. Nadie más tiene el metrónomo con conteos sincopados, el looper con saltos de compás, el ELO por rol y estilo.
- **Activo a largo plazo:** base de datos única del ecosistema — qué canciones funcionan por región, ELO real de bailarines, historial verificado, datos de demanda para bootcamps y shows.

---

## Roadmap por fases

### Fase 1 — Piloto (construir ahora)
MVP completo. Social de playa en Viña del Mar (20–70 personas). Validar flujo de punta a punta.
Módulos: Auth, Eventos, Pagos, Acceso presencial, Chat IA, Música+DJs

### Fase 2 — Comunidad
Red social básica, música avanzada, votación, integración Instagram, salas de ensayo, clases privadas, créditos, gamificación.
Mercado: Santiago + Viña del Mar.

### Fase 3 — Ecosistema
Marketplace de talento, competencias + ELO completo, jueceo, coreografías, bootcamps, marketplace de productos, pulseras NFC.
Cliente objetivo: DareDance. Mercado: Chile completo.

### Fase 4 — Escala
RFID UHF masivo, reconocimiento facial, data premium DJs, sponsors, suscripciones avanzadas, API para terceros.
Expansión: Argentina, Colombia, México, España.

---

## Convenciones de código

### API (NestJS)
- Un módulo = una carpeta en `apps/api/src/`
- Cada módulo tiene: `*.module.ts` + `*.controller.ts` + `*.service.ts` + `*.dto.ts`
- DTOs siempre validados con `class-validator` + `class-transformer`
- Guards de auth en rutas protegidas: `@UseGuards(JwtAuthGuard)`
- Respuestas siempre tipadas con interfaces de `@baile-latino/types`
- Errores con `HttpException` o filtros globales, nunca `throw new Error` sin capturar
- Tests en `*.spec.ts` junto al archivo que testean
- Prefijo global de API: `/api/v1`
- Nombres de endpoints en español o inglés, consistente dentro del módulo

### Web (Next.js)
- App Router, todo en `app/`
- Rutas del organizador bajo `app/(organizer)/`
- Super admin bajo `app/admin/` con middleware de rol `SUPER_ADMIN`
- Server Components por defecto, `'use client'` solo cuando se necesita interactividad
- Fetch en Server Components directo, React Query solo en Client Components
- Componentes UI reutilizables en `components/`
- Hooks personalizados en `hooks/`

### Mobile (React Native)
- Expo Router para navegación (misma convención de carpetas que Next.js)
- NativeWind para estilos (misma sintaxis que Tailwind)
- Componentes en `components/`, screens en `app/`
- NO compartir componentes con web — plataformas distintas, UX distinta
- SÍ compartir tipos desde `@baile-latino/types`
- Siempre probar en iOS y Android

### General
- TypeScript strict en todos los proyectos
- Nombres de archivos en kebab-case
- Clases y tipos en PascalCase
- Variables y funciones en camelCase
- Variables de entorno en `.env.local`, nunca hardcodeadas en código
- Commits en español: `tipo(módulo): descripción` (ej: `feat(auth): agrega login con instagram`)
- No mezclar lógica de negocio en controllers — va en services
- Imports de `@baile-latino/types` siempre desde el paquete, nunca copiar tipos

---

## Comandos

```bash
# Raíz del monorepo
pnpm install              # instala todo
pnpm dev                  # levanta api + web en paralelo
pnpm dev:api              # solo la API (puerto 3000)
pnpm dev:web              # solo el web (puerto 3001)
pnpm dev:mobile           # solo mobile (puerto 8081)
pnpm build                # build de producción de todo
pnpm lint                 # lint de todo el monorepo

# Base de datos (desde raíz o desde apps/api/)
pnpm db:generate          # genera el cliente Prisma
pnpm db:migrate           # corre migraciones pendientes
pnpm db:studio            # abre Prisma Studio en el browser

# Git
git add .
git commit -m "feat(módulo): descripción"
git push origin main
```

---

## Orden de implementación — empieza aquí

Trabajar en sesiones acotadas: un módulo o funcionalidad por vez. Que cada pieza funcione antes de pasar a la siguiente.

```
Sprint 1:  packages/types/         → tipos base (User, Event, Track, Playlist, Payment)
Sprint 2:  apps/api — AuthModule   → registro, login JWT, guards, roles
Sprint 3:  apps/api — EventsModule → CRUD eventos, ticket tiers, preventas
Sprint 4:  apps/api — PaymentsModule → Flow, QR, boletas SII
Sprint 5:  apps/api — AccessModule → escaneo QR, NFC, aforo
Sprint 6:  apps/api — AiChatModule → Claude API, chat por evento
Sprint 7:  apps/api — MusicModule  → Spotify, YouTube, playlists
Sprint 8:  apps/web — panel organizador (consume la API ya construida)
Sprint 9:  apps/mobile — app comunidad (consume la misma API)
Sprint 10: Fase 2 módulos...
```

---

## Lo que NO tocar sin discutir primero

- `prisma/schema.prisma` — cualquier cambio requiere migración y puede afectar datos en producción
- `packages/types/src/index.ts` — cambiar un tipo afecta los tres proyectos simultáneamente
- `apps/api/src/auth/` — cambios en auth pueden romper la seguridad de toda la plataforma
- Archivos `.env` — nunca commitear, solo los `.env.example`
- Lógica de pagos — siempre revisar con Flow/Transbank en sandbox antes de producción
- Consentimiento de reconocimiento facial — requiere aviso legal explícito (dato biométrico)
