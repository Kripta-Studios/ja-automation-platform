/** Generate the three shared references in English or Brazilian Portuguese. */
import { generateRoleManuals } from './manual-pdf.ts';

const locale = process.argv.includes('--locale=pt-BR') ? 'pt' : 'en';
generateRoleManuals(locale).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
