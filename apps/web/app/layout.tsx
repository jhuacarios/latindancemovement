import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { VersionBadge } from '@/components/version-badge';

export const metadata: Metadata = {
  title: 'Baile Latino · Panel',
  description: 'Panel de música y DJs de la Baile Latino Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
        <VersionBadge />
      </body>
    </html>
  );
}
