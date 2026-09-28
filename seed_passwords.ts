import { seedE2ECredentialAccounts } from './tests/e2e/auth.ts';

async function seed() {
  console.log('Seeding demo.db');
  await seedE2ECredentialAccounts('packages/database/data/demo.db');
  console.log('Seeding app.db');
  await seedE2ECredentialAccounts('packages/database/data/app.db');
}
seed().catch(console.error);
