/** Generate the existing Worker quick guide in EN, ES and PT-BR from fresh role captures. */
import { generateQuickGuides } from './manual-pdf.ts';

generateQuickGuides().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
