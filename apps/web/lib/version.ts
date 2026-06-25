/**
 * Versión de la app. La fuente de verdad es `apps/web/package.json` (campo
 * "version"), expuesta al cliente desde next.config.mjs. Para subir versión,
 * cambia ese campo (semver: major.minor.patch).
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
