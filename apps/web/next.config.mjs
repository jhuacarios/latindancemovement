import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpila el paquete de tipos compartido del monorepo.
  transpilePackages: ['@baile-latino/types'],
  // No bloquear el build por lint (lo corremos aparte cuando configuremos ESLint).
  eslint: { ignoreDuringBuilds: true },
  // Versión de la app (del package.json) + commit del build (cambia solo en cada
  // deploy de Vercel, vía VERCEL_GIT_COMMIT_SHA). Disponibles en el cliente.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  },
};

export default nextConfig;
