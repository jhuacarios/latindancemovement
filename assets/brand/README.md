# Assets de marca — Nectason

Fuente de verdad de los archivos de marca. Ver `BRANDING.md` en la raíz.

Coloca aquí los archivos y cópialos a cada app:

| Archivo                   | Descripción                                   | Consumido por |
|---------------------------|-----------------------------------------------|---------------|
| `nectason-logo.png`       | Logo completo, Son `#1A7A4E`, fondo transparente | web, mobile |
| `nectason-logo-dark.png`  | Versión Clave `#4EC990` para fondos oscuros   | web, mobile   |
| `nectason-logo.svg`       | Vectorial (si está disponible)                | web, mobile   |
| `nectason-icon.png`       | Ícono de app (torso superior, fondo Selva)    | web, mobile   |
| `nectason-wordmark.svg`   | Solo logotipo "nectason" (opcional)           | web           |

## Dónde van en cada app

- **Web (Next.js):** `apps/web/public/brand/` → se referencian como `/brand/...`.
- **Mobile (Expo):** `apps/mobile/assets/brand/` → registrar el ícono en `app.json`.

El código del web ya referencia `/brand/nectason-logo.png`. Mientras el archivo
no exista, el componente `BrandLogo` cae a la inicial "N" automáticamente.
