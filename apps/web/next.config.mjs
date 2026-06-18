/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpila el paquete de tipos compartido del monorepo.
  transpilePackages: ['@baile-latino/types'],
  // No bloquear el build por lint (lo corremos aparte cuando configuremos ESLint).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
