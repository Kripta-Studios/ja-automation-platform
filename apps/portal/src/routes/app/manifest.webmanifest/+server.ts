import { base } from '$app/paths';
import { json } from '@sveltejs/kit';
export const GET = () =>
  json({
    name: 'J&A Employee Portal',
    short_name: 'J&A Portal',
    start_url: `${base}/app/`,
    scope: `${base}/app/`,
    display: 'standalone',
    background_color: '#f4f1eb',
    theme_color: '#17191b',
    icons: [
      { src: `${base}/app/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/app/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  });
