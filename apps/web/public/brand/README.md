# public/brand — assets de marca del web

Coloca aquí los PNG/SVG de Nectason. El código los referencia como `/brand/...`.

Requeridos:

- `nectason-logo.png` — logo completo (Son `#1A7A4E`), fondo transparente.
  Usado por `components/brand.tsx` (`<BrandLogo />`) en el sidebar y el login.
- `nectason-logo-dark.png` — versión Clave `#4EC990` para fondos muy oscuros (opcional).
- `nectason-icon.png` — base para el favicon / ícono de app.

Mientras falten, `BrandLogo` muestra la inicial "N" como fallback.

> Para el favicon: una vez tengas `nectason-icon.png`, guárdalo como
> `apps/web/app/icon.png` y Next.js lo toma automáticamente.
