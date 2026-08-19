import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build', precompress: true }),
    paths: {
      base: process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation',
      assets: process.env.JA_PORTAL_ASSETS_URL ?? '',
      relative: false,
    },
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'img-src': ['self', 'data:', 'blob:'],
        // SvelteKit's accessibility announcer is emitted with one static,
        // visually-hidden style attribute. Keep the policy strict while
        // allowing only that exact generated declaration (no unsafe-inline).
        'style-src': [
          'self',
          'unsafe-hashes',
          'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=',
        ],
        'script-src': ['self'],
        'worker-src': ['self'],
        'connect-src': ['self'],
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
      },
    },
  },
};
