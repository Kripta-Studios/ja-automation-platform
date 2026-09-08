import { expect, test } from '@playwright/test';

const localeCopy = {
  en: {
    queued: 'Request queued',
    delivered: 'no datasheet has been delivered automatically',
    retry: 'Send another request',
  },
  es: {
    queued: 'Solicitud en cola',
    delivered: 'no se ha entregado ninguna ficha automáticamente',
    retry: 'Enviar otra solicitud',
  },
  pt: {
    queued: 'Solicitação na fila',
    delivered: 'nenhuma ficha foi entregue automaticamente',
    retry: 'Enviar outra solicitação',
  },
} as const;

test('Aquarex request preserves values after a failure and reports queued follow-up', async ({
  page,
}) => {
  let requestCount = 0;
  const requestKeys: string[] = [];
  const requestBodies: Record<string, unknown>[] = [];
  let failureGate: Promise<void> | undefined;
  let releaseFailure: (() => void) | undefined;

  await page.route('**/j-aautomation/api/public/aquarex', async (route) => {
    requestCount += 1;
    requestKeys.push(route.request().headers()['idempotency-key'] ?? '');
    requestBodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    if (requestCount % 2 === 1) {
      await failureGate;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'synthetic isolated endpoint failure' }),
      });
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, inquiryId: `synthetic-${requestCount}` }),
    });
  });

  for (const locale of ['en', 'es', 'pt'] as const) {
    failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.goto(`/j-aautomation/${locale}/solutions/aquarex#datasheet`);
    const firstName = page.locator('#aquarex-first-name');
    const lastName = page.locator('#aquarex-last-name');
    const email = page.locator('#aquarex-email');
    const company = page.locator('#aquarex-company');
    const site = page.locator('#aquarex-site');
    const submit = page.locator('button[type="submit"]');

    await firstName.fill('Ada');
    await lastName.fill('Requester');
    await email.fill(`aquarex-${locale}@example.com`);
    await company.fill('Synthetic Plant');
    await site.fill('Synthetic site');
    await submit.click();

    await expect(submit).toBeDisabled();
    releaseFailure?.();
    await expect(page.locator('form').getByRole('alert')).toBeVisible();
    await expect(firstName).toHaveValue('Ada');
    await expect(lastName).toHaveValue('Requester');
    await expect(email).toHaveValue(`aquarex-${locale}@example.com`);
    await expect(company).toHaveValue('Synthetic Plant');
    await expect(site).toHaveValue('Synthetic site');

    await submit.click();
    await expect(page.getByRole('heading', { name: localeCopy[locale].queued })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(localeCopy[locale].delivered);
    await expect(page.getByRole('button', { name: localeCopy[locale].retry })).toBeVisible();
  }

  expect(requestCount).toBe(6);
  expect(requestKeys).toHaveLength(6);
  expect(requestKeys[0]).toBeTruthy();
  expect(requestKeys[0]).toBe(requestKeys[1]);
  expect(requestKeys[2]).toBe(requestKeys[3]);
  expect(requestKeys[4]).toBe(requestKeys[5]);
  expect(requestBodies[0]).toMatchObject({
    name: 'Ada Requester',
    company: 'Synthetic Plant',
    site: 'Synthetic site',
    platform: 'Aquarex',
  });
  expect(requestBodies[0].message).toContain('Source page: /j-aautomation/en/solutions/aquarex.');
  expect(requestBodies[2].message).toContain('Language: es.');
  expect(requestBodies[4].message).toContain('Language: pt.');
});
