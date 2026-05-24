import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CEOZEN — Gestion boutique',
    short_name: 'CEOZEN',
    description: 'Sell. Manage. Grow. La solution de gestion pour votre boutique — by SenseLab.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#050816',
    theme_color: '#00d4ff',
    icons: [
      {
        src: '/api/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
