import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CEOZEN',
    template: '%s | CEOZEN',
  },
  description: 'Vendez. Gérez. Grandissez. La solution de gestion pour votre boutique de téléphones — by SenseLab.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CEOZEN',
  },
  applicationName: 'CEOZEN',
  keywords: ['gestion boutique', 'ventes', 'stock', 'téléphones', 'Afrique'],
};

export const viewport: Viewport = {
  themeColor: '#00d4ff',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        {children}
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
