import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const base = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, strict: true }),
    paths: { base, relative: false },
    prerender: {
      handleHttpError: ({ path, message }) => {
        if (path.startsWith(`${base}/app/`)) return;
        throw new Error(message);
      },
    },
  },
};
