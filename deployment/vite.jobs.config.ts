import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    {
      name: 'backup-verifier-runtime',
      generateBundle() {
        for (const name of [
          'backup-verify.mjs',
          'continuity-backup.mjs',
          'backup.mjs',
          'storage-safety.mjs',
          'alerts.mjs',
        ])
          this.emitFile({
            type: 'asset',
            fileName: name,
            source: readFileSync(new URL(`./scripts/${name}`, import.meta.url), 'utf8'),
          });
      },
    },
  ],
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
