/**
 * Versión de la app. El semver (major.minor.patch) sale de
 * `apps/web/package.json` y se sube a mano en cada release "con nombre".
 * El BUILD_SHA es el commit del deploy (lo pone Vercel) y cambia solo en cada
 * push/deploy → así siempre sabes qué build está vivo sin tocar nada.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';
