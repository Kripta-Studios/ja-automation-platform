import { defineConfig } from 'vite';

/** Host maintenance runs without the container's node_modules. */
export default defineConfig({
  build: {
    ssr: 'deployment/scripts/reconcile-owner-finance-policy.mjs',
    outDir: 'deployment/jobs-build',
    emptyOutDir: false,
    rolldownOptions: {
      external: [/^node:/],
      output: {
        codeSplitting: false,
        entryFileNames: 'reconcile-owner-finance-policy.mjs',
        format: 'es',
      },
    },
  },
  ssr: { noExternal: true },
});
