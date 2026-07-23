import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { VersionBadge } from '@/components/version-badge';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nectason · Panel',
  description:
    'Nectason — plataforma del baile social latino. Panel de música y DJs.',
};

// `viewportFit: 'cover'` hace que `env(safe-area-inset-*)` devuelva valores
// reales en iPhone (para no tapar el home indicator con la barra del player).
export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body>
        <Providers>{children}</Providers>
        <VersionBadge />
      </body>
    </html>
  );
}
