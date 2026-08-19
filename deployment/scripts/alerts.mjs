import { createHmac } from 'node:crypto';

/**
 * Send an operational alert to the configured lightweight webhook.
 * Missing configuration is intentionally a no-op so local/test jobs remain
 * deterministic; production deployments should configure both values.
 */
export async function sendOperationalAlert(event, details = {}) {
  const url = process.env.JA_ALERT_WEBHOOK_URL;
  const secret = process.env.JA_ALERT_WEBHOOK_SECRET;
  if (!url || !secret) return { sent: false, configured: false };
  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://'))
    throw new Error('Production alert webhook must use HTTPS');
  const body = JSON.stringify({
    event,
    severity: 'error',
    timestamp: new Date().toISOString(),
    service: 'jaautomation',
    details,
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'jaautomation-alerts/1',
      'x-ja-alert-signature': 'sha256=' + signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Alert webhook returned HTTP ' + response.status);
  return { sent: true, configured: true };
}
