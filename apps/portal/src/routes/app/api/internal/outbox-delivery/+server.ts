import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase } from '@ja/database';
import { json, type RequestHandler } from '@sveltejs/kit';
import {
  claimOutboxDelivery,
  markOutboxDelivered,
  parseSignedOutboxRequest,
  releaseOutboxDeliveryClaim,
  resolveMailDelivery,
  sendStalwartMail,
  verifyOutboxSignature,
} from '$lib/server/outbox-mail-delivery';

const MAX_WEBHOOK_BYTES = 256 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES)
    return json({ error: 'Payload too large' }, { status: 413 });
  const body = await request.text().catch(() => '');
  if (
    !verifyOutboxSignature(
      body,
      request.headers.get('x-ja-signature'),
      process.env.JA_OUTBOX_WEBHOOK_SECRET,
    )
  )
    return json({ error: 'Unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = parseSignedOutboxRequest(body);
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }

  const path = process.env.JA_DATABASE_PATH;
  if (!path) return json({ error: 'Delivery service unavailable' }, { status: 503 });
  const { sqlite } = createDatabase(path);
  const claimId = randomUUID();
  let claimed = false;
  try {
    const delivery = resolveMailDelivery(sqlite, parsed, process.env.JA_FORM_RECIPIENT);
    if (delivery === 'already-delivered') return new Response(null, { status: 204 });
    const claim = claimOutboxDelivery(sqlite, parsed, claimId);
    if (claim === 'already-delivered') return new Response(null, { status: 204 });
    claimed = true;
    const passwordFile = process.env.JA_SMTP_PASSWORD_FILE;
    if (!passwordFile) throw new Error('SMTP password file is unavailable');
    const smtpPassword = (await readFile(passwordFile, 'utf8')).trim();
    await sendStalwartMail(delivery, {
      smtpUrl: process.env.JA_SMTP_URL,
      username: process.env.JA_SMTP_USERNAME,
      password: smtpPassword,
      from: process.env.JA_SMTP_FROM,
    });
    markOutboxDelivered(sqlite, parsed, claimId);
    claimed = false;
    return new Response(null, { status: 204 });
  } catch {
    if (claimed) {
      try {
        releaseOutboxDeliveryClaim(sqlite, parsed, claimId);
      } catch {
        // The worker owns retry recovery. Keep the public response generic if
        // a concurrent database failure prevents best-effort claim release.
      }
    }
    return json({ error: 'Delivery failed' }, { status: 502 });
  } finally {
    sqlite.close();
  }
};
