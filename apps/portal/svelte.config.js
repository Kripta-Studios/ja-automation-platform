import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build', precompress: true }),
    paths: { base: process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation', relative: false },
  },
};
