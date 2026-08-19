import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'deployment/scripts/jobs-run.mjs',
    outDir: 'deployment/jobs-build',
    emptyOutDir: true,
    rolldownOptions: {
      external: [/^node:/],
      output: {
        codeSplitting: false,
        entryFileNames: 'jobs-run.mjs',
        format: 'es',
      },
    },
  },
  ssr: {
    noExternal: [/^@ja\//],
  },
});
