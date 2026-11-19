# Nectason — app móvil

React Native + **Expo SDK 58** + Expo Router (pestañas nativas). Estilos con `StyleSheet`
y la paleta de la web (`src/lib/theme.ts`). Tipos compartidos desde `@baile-latino/types`.

## Probar en el celular (Expo Go)

1. Instala **Expo Go** (App Store / Google Play).
2. Desde la raíz del monorepo: `pnpm dev:mobile`
3. Escanea el QR (Android: con Expo Go; iPhone: con la cámara). El celular y el PC
   deben estar en la misma red Wi‑Fi.

> En Windows, si Metro falla con rutas tipo `c:\C:\…`, ábrelo desde PowerShell en
> `C:\Repositorios\apps\mobile` (la letra de unidad en mayúscula) y corre `npx expo start`.

## API

`EXPO_PUBLIC_API_URL` en `apps/mobile/.env` (ver `.env.example`). Por defecto usa
producción (`https://api.nectason.app/api/v1`): el login con Google solo puede volver a
dominios registrados en Google, y `localhost` no sirve desde el celular.

El login abre el navegador del sistema y la API vuelve a la app (`nectason://auth`, o
`exp://…/--/auth` en Expo Go) con un código de un solo uso. La API solo acepta los
prefijos de `MOBILE_AUTH_RETURN_PREFIXES` (agrega `exp://` mientras se prueba con Expo Go).

## Comandos

```bash
npx expo start            # servidor de desarrollo
npx tsc --noEmit          # typecheck
npx expo-doctor           # revisa dependencias y configuración
npx expo install <pkg>    # instala con la versión compatible con la SDK
```

Ver también `AGENTS.md` (Expo cambia en cada SDK: leer la documentación versionada).
