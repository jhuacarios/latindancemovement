# Planes — Módulo Música y DJs

**Estado:** definición. Todo está **gratis por ahora** — los límites y bloqueos de
abajo **NO están activos** aún. Este documento define el corte para cuando se active.

**Modelo (al activar):** *mix* — límites de cantidad en el plan Free + funciones
avanzadas disponibles solo en Pro.

---

## Free (gancho)

La idea: que un DJ pueda armar su biblioteca, un par de playlists y reproducir,
sin pagar. Suficiente para engancharse, no para operar a full.

**Funciones incluidas:**
- Ver catálogo + buscar/filtrar por estilo y sub-estilo.
- **Mis Canciones** (biblioteca personal) — hasta **50 canciones**.
- Reproducir audio/video (con control de volumen).
- **Playlists internas** — hasta **2 playlists**, creación manual + reordenar.
- Agregar canciones a las playlists (doble click / arrastrar).

## Pro 💎 (desbloquea)

- **Mis Canciones ilimitadas.**
- **Playlists internas ilimitadas.**
- **Generador automático** (por bloques bachata/salsa, límite por cantidad o duración).
- **Integración YouTube:** ver las playlists de tu cuenta, crear playlist en
  YouTube, plantilla interna → YouTube, "playlist YouTube rápida".
- **Export / Import Excel** (gestión masiva del repertorio).
- **Importar playlist de YouTube** al catálogo.
- **Reportes y data por región** (qué funciona dónde — el "data premium DJs").
- **Comité musical** (varios DJs coordinando una playlist).

---

## Pendiente de decidir

- Números exactos del Free (¿50 canciones? ¿2 playlists?).
- ¿El reproductor de **video** es Free o Pro? (audio Free, video Pro podría ser un corte).
- ¿Algún límite de reproducciones/día en Free?

## Notas de implementación (futuro, no ahora)

- Campo `plan` en el usuario (`free` | `pro`), asignable por super admin.
- Gating por **límite** (contar canciones/playlists antes de permitir agregar) y por
  **feature** (ocultar/deshabilitar las acciones Pro con un aviso de upgrade).
- Reusar el sistema de permisos existente para el lado de roles; el plan es un eje
  aparte (suscripción), no un rol.
