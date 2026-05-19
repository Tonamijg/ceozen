import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CEOZEN',
    template: '%s | CEOZEN',
  },
  description: 'Gestion de boutique tech — ventes, stock, dépenses, rapports',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  themeColor: '#050816',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
