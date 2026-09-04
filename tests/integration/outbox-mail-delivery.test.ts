import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import {
  claimOutboxDelivery,
  markOutboxDelivered,
  parseSignedOutboxRequest,
  releaseOutboxDeliveryClaim,
  resolveMailDelivery,
  sendStalwartMail,
  verifyOutboxSignature,
} from '../../apps/portal/src/lib/server/outbox-mail-delivery.ts';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const roots: string[] = [];
const smtpUsername = 'no-reply@j-aautomation.com';
const smtpPassword = 'test-only-password-with-adequate-length';
let restoreDeploymentIdentity: (() => void) | undefined;
beforeAll(() => {
  restoreDeploymentIdentity = installB5TestDeploymentIdentity();
});
afterAll(() => restoreDeploymentIdentity?.());
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

const database = () => {
  const root = mkdtempSync(join(tmpdir(), 'ja-outbox-mail-'));
  roots.push(root);
  return createDatabase(join(root, 'app.db'));
};

const startTestSmtp = async (
  options: Readonly<{
    stallStartTls?: boolean;
    closeAfterData?: boolean;
    closeAfterSecureHello?: boolean;
  }> = {},
) => {
  const root = mkdtempSync(join(tmpdir(), 'ja-outbox-smtp-'));
  roots.push(root);
  const keyPath = join(root, 'key.pem');
  const certificatePath = join(root, 'certificate.pem');
  const generated = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
      '-subj',
      '/CN=localhost',
      '-days',
      '1',
    ],
    { encoding: 'utf8' },
  );
  if (generated.status !== 0) throw new Error('Unable to create test TLS certificate');
  const secureContext = tls.createSecureContext({
    key: readFileSync(keyPath),
    cert: readFileSync(certificatePath),
  });
  let acceptedMessages = 0;
  let maximumDataLineBytes = 0;
  let currentMessage: string[] = [];
  let lastMessage: string[] = [];
  const server = net.createServer((plain) => {
    let secure = false;
    let dataMode = false;
    let buffered = '';
    const attach = (socket: net.Socket) => {
      socket.setEncoding('utf8');
      const onData = (chunk: string | Buffer) => {
        buffered += chunk.toString();
        for (;;) {
          const newline = buffered.indexOf('\n');
          if (newline < 0) return;
          const line = buffered.slice(0, newline).replace(/\r$/u, '');
          buffered = buffered.slice(newline + 1);
          if (dataMode) {
            if (line === '.') {
              dataMode = false;
              acceptedMessages += 1;
              lastMessage = currentMessage;
              currentMessage = [];
              if (options.closeAfterData) socket.end('250 2.0.0 queued\r\n');
              else socket.write('250 2.0.0 queued\r\n');
            } else {
              maximumDataLineBytes = Math.max(maximumDataLineBytes, Buffer.byteLength(line));
              currentMessage.push(line);
            }
            continue;
          }
          const command = line.toUpperCase();
          if (command.startsWith('EHLO '))
            socket.write(
              secure
                ? '250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'
                : '250-localhost\r\n250 STARTTLS\r\n',
              () => {
                if (secure && options.closeAfterSecureHello) socket.destroy();
              },
            );
          else if (command === 'STARTTLS') {
            socket.write('220 2.0.0 ready\r\n', () => {
              socket.off('data', onData);
              if (options.stallStartTls) return;
              buffered = '';
              secure = true;
              attach(new tls.TLSSocket(socket, { isServer: true, secureContext }));
            });
          } else if (command.startsWith('AUTH PLAIN ')) {
            const supplied = Buffer.from(line.slice('AUTH PLAIN '.length), 'base64').toString(
              'utf8',
            );
            socket.write(
              supplied === `\0${smtpUsername}\0${smtpPassword}`
                ? '235 2.7.0 authenticated\r\n'
                : '535 5.7.8 invalid credentials\r\n',
            );
          } else if (command.startsWith('MAIL FROM:') || command.startsWith('RCPT TO:'))
            socket.write('250 2.1.0 accepted\r\n');
          else if (command === 'DATA') {
            dataMode = true;
            socket.write('354 send message\r\n');
          } else if (command === 'QUIT') {
            socket.end('221 2.0.0 bye\r\n');
          } else socket.write('500 5.5.1 unsupported\r\n');
        }
      };
      socket.on('data', onData);
    };
    plain.write('220 localhost test SMTP\r\n');
    attach(plain);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test SMTP address unavailable');
  return {
    port: address.port,
    acceptedMessages: () => acceptedMessages,
    maximumDataLineBytes: () => maximumDataLineBytes,
    lastMessage: () => lastMessage.join('\r\n'),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const signedRequest = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'event-1',
  topic: 'notification.email.requested',
  aggregateId: 'notification-1',
  idempotencyKey: 'notification-email:notification-1',
  attempts: 1,
  payload: {
    notificationId: 'notification-1',
    userId: 'worker-1',
    kind: 'missing_time',
    subjectId: 'missing-time:project-1:worker-1:2026-09-04',
  },
  ...overrides,
});

describe('signed outbox mail delivery', () => {
  it('validates an exact HMAC and rejects weak, malformed or changed signatures', () => {
    const secret = 'a'.repeat(64);
    const body = JSON.stringify(signedRequest());
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyOutboxSignature(body, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyOutboxSignature(`${body} `, `sha256=${signature}`, secret)).toBe(false);
    expect(verifyOutboxSignature(body, 'sha256=invalid', secret)).toBe(false);
    expect(verifyOutboxSignature(body, `sha256=${signature}`, 'short')).toBe(false);
  });

  it('claims one signed attempt, rejects a concurrent retry and deduplicates durably', () => {
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO user(
             id,name,email,email_verified,role,status,mfa_enrolled,mfa_required,created_at,updated_at,version
           ) VALUES(?,?,?,1,'worker','active',0,0,?,?,1)`,
        )
        .run('worker-1', 'Worker', 'worker@j-aautomation.com', now, now);
      sqlite
        .prepare(
          'INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES(?,?,?,?,?)',
        )
        .run(
          'notification-1',
          'worker-1',
          'missing_time',
          'missing-time:project-1:worker-1:2026-09-04',
          now,
        );
      sqlite
        .prepare(
          `INSERT INTO outbox_event(
             id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          'event-1',
          'notification.email.requested',
          'notification-1',
          'notification-email:notification-1',
          JSON.stringify(signedRequest().payload),
          now,
          now,
        );
      const request = parseSignedOutboxRequest(JSON.stringify(signedRequest()));
      const delivery = resolveMailDelivery(sqlite, request, undefined);
      expect(delivery).toMatchObject({
        recipient: 'worker@j-aautomation.com',
        subject: 'Missing time entry reminder',
      });
      sqlite.prepare('UPDATE outbox_event SET attempts=1 WHERE id=?').run('event-1');
      expect(claimOutboxDelivery(sqlite, request, 'claim-1')).toBe('claimed');
      expect(() => claimOutboxDelivery(sqlite, request, 'claim-2')).toThrow('cannot be claimed');
      markOutboxDelivered(sqlite, request, 'claim-1', '2026-09-04T12:00:00.000Z');
      expect(resolveMailDelivery(sqlite, request, undefined)).toBe('already-delivered');
      expect(
        sqlite
          .prepare('SELECT delivered_at,last_error,lease_until FROM outbox_event WHERE id=?')
          .get('event-1'),
      ).toEqual({
        delivered_at: '2026-09-04T12:00:00.000Z',
        last_error: null,
        lease_until: null,
      });
      sqlite
        .prepare(
          `INSERT INTO outbox_event(
             id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,failed_at
           ) VALUES(?,?,?,?,?,?,?,?)`,
        )
        .run(
          'event-failed',
          'notification.email.requested',
          'notification-1',
          'notification-email:failed',
          JSON.stringify(signedRequest().payload),
          now,
          now,
          now,
        );
      const failedRequest = parseSignedOutboxRequest(
        JSON.stringify(
          signedRequest({ eventId: 'event-failed', idempotencyKey: 'notification-email:failed' }),
        ),
      );
      expect(() => resolveMailDelivery(sqlite, failedRequest, undefined)).toThrow(
        'not deliverable',
      );
      expect(() => markOutboxDelivered(sqlite, failedRequest, 'claim-failed')).toThrow(
        'acknowledgement failed',
      );
    } finally {
      sqlite.close();
    }
  });

  it('releases only the matching delivery fence after a failed SMTP attempt', () => {
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO outbox_event(
             id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,attempts
           ) VALUES(?,?,?,?,?,?,?,1)`,
        )
        .run(
          'event-1',
          'notification.email.requested',
          'notification-1',
          'notification-email:notification-1',
          '{}',
          now,
          now,
        );
      const request = parseSignedOutboxRequest(JSON.stringify(signedRequest()));
      expect(claimOutboxDelivery(sqlite, request, 'claim-1')).toBe('claimed');
      releaseOutboxDeliveryClaim(sqlite, request, 'wrong-claim');
      expect(
        sqlite.prepare('SELECT last_error FROM outbox_event WHERE id=?').get('event-1'),
      ).toEqual({ last_error: 'DELIVERY_IN_PROGRESS:claim-1' });
      releaseOutboxDeliveryClaim(sqlite, request, 'claim-1');
      expect(
        sqlite.prepare('SELECT last_error FROM outbox_event WHERE id=?').get('event-1'),
      ).toEqual({ last_error: null });
    } finally {
      sqlite.close();
    }
  });

  it('renders a public inquiry only for the configured corporate form recipient', () => {
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO public_inquiry(id,kind,payload_json,source_hash,created_at) VALUES(?,?,?,?,?)',
        )
        .run(
          'inquiry-1',
          'contact',
          JSON.stringify({ name: 'Client', email: 'client@example.test', message: 'Call me' }),
          'source-hash',
          now,
        );
      sqlite
        .prepare(
          `INSERT INTO outbox_event(
             id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          'event-2',
          'public-inquiry.received',
          'inquiry-1',
          'public-inquiry:inquiry-1',
          JSON.stringify({ inquiryId: 'inquiry-1', kind: 'contact' }),
          now,
          now,
        );
      const request = parseSignedOutboxRequest(
        JSON.stringify(
          signedRequest({
            eventId: 'event-2',
            topic: 'public-inquiry.received',
            aggregateId: 'inquiry-1',
            idempotencyKey: 'public-inquiry:inquiry-1',
            payload: {
              inquiryId: 'inquiry-1',
              kind: 'contact',
              inquiry: {
                id: 'inquiry-1',
                kind: 'contact',
                payload: { name: 'Client', email: 'client@example.test', message: 'Call me' },
              },
            },
          }),
        ),
      );
      expect(resolveMailDelivery(sqlite, request, 'antonny.luty@j-aautomation.com')).toMatchObject({
        recipient: 'antonny.luty@j-aautomation.com',
        subject: 'New website contact request',
      });
      expect(() => resolveMailDelivery(sqlite, request, 'outside@example.test')).toThrow(
        'corporate J&A mailbox',
      );
    } finally {
      sqlite.close();
    }
  });

  it('rejects uncredentialed SMTP targets outside local Stalwart before connecting', async () => {
    await expect(
      sendStalwartMail(
        {
          recipient: 'worker@j-aautomation.com',
          subject: 'Test',
          body: 'Test',
          messageId: '<test@j-aautomation.com>',
        },
        { smtpUrl: 'smtp://mail.example.test:25' },
      ),
    ).rejects.toThrow('local Stalwart');
  });

  it('delivers a maximum-length UTF-8 form body through STARTTLS with SMTP-safe lines', async () => {
    const smtp = await startTestSmtp();
    try {
      await sendStalwartMail(
        {
          recipient: 'worker@j-aautomation.com',
          subject: 'Maximum form submission',
          body: 'á'.repeat(8_000),
          messageId: '<maximum-form@j-aautomation.com>',
        },
        {
          smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
          username: smtpUsername,
          password: smtpPassword,
          rejectUnauthorized: false,
          timeoutMs: 2_000,
        },
      );
      expect(smtp.acceptedMessages()).toBe(1);
      expect(smtp.maximumDataLineBytes()).toBeLessThanOrEqual(998);
      expect(smtp.lastMessage()).toContain('Subject: Maximum form submission');
      expect(smtp.lastMessage()).toContain('Content-Transfer-Encoding: quoted-printable');
      expect(smtp.lastMessage()).not.toContain('Subject: =?UTF-8?B?');
    } finally {
      await smtp.close();
    }
  });

  it('fails closed when authenticated SMTP submission credentials are invalid', async () => {
    const smtp = await startTestSmtp();
    try {
      await expect(
        sendStalwartMail(
          {
            recipient: 'worker@j-aautomation.com',
            subject: 'Rejected authentication',
            body: 'Must not be accepted',
            messageId: '<rejected-auth@j-aautomation.com>',
          },
          {
            smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
            username: smtpUsername,
            password: 'wrong-test-password',
            rejectUnauthorized: false,
            timeoutMs: 2_000,
          },
        ),
      ).rejects.toThrow(/SMTP/u);
      expect(smtp.acceptedMessages()).toBe(0);
    } finally {
      await smtp.close();
    }
  });

  it('rejects a stalled STARTTLS handshake within the configured timeout', async () => {
    const smtp = await startTestSmtp({ stallStartTls: true });
    try {
      await expect(
        sendStalwartMail(
          {
            recipient: 'worker@j-aautomation.com',
            subject: 'Timeout test',
            body: 'Test',
            messageId: '<timeout@j-aautomation.com>',
          },
          {
            smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
            username: smtpUsername,
            password: smtpPassword,
            rejectUnauthorized: false,
            timeoutMs: 100,
          },
        ),
      ).rejects.toThrow(/timed out|closed unexpectedly/u);
      expect(smtp.acceptedMessages()).toBe(0);
    } finally {
      await smtp.close();
    }
  });

  it('treats DATA 250 as accepted when the peer closes before QUIT', async () => {
    const smtp = await startTestSmtp({ closeAfterData: true });
    try {
      await expect(
        sendStalwartMail(
          {
            recipient: 'worker@j-aautomation.com',
            subject: 'Accepted before close',
            body: 'One accepted message',
            messageId: '<accepted-close@j-aautomation.com>',
          },
          {
            smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
            username: smtpUsername,
            password: smtpPassword,
            rejectUnauthorized: false,
            timeoutMs: 2_000,
          },
        ),
      ).resolves.toBeUndefined();
      expect(smtp.acceptedMessages()).toBe(1);
    } finally {
      await smtp.close();
    }
  });

  it('rejects a connection closed between a post-TLS response and the next write', async () => {
    const smtp = await startTestSmtp({ closeAfterSecureHello: true });
    try {
      await expect(
        sendStalwartMail(
          {
            recipient: 'worker@j-aautomation.com',
            subject: 'Closed write',
            body: 'Must not be accepted',
            messageId: '<closed-write@j-aautomation.com>',
          },
          {
            smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
            username: smtpUsername,
            password: smtpPassword,
            rejectUnauthorized: false,
            timeoutMs: 2_000,
          },
        ),
      ).rejects.toThrow(/SMTP/u);
      expect(smtp.acceptedMessages()).toBe(0);
    } finally {
      await smtp.close();
    }
  });

  it('rejects unsupported topics and mismatched signed identities', () => {
    expect(() =>
      parseSignedOutboxRequest(JSON.stringify(signedRequest({ topic: 'invoice.sent' }))),
    ).toThrow('Unsupported outbox topic');
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO outbox_event(
             id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run('event-1', 'notification.email.requested', 'other', 'other', '{}', now, now);
      const request = parseSignedOutboxRequest(JSON.stringify(signedRequest()));
      expect(() => resolveMailDelivery(sqlite, request, undefined)).toThrow(
        'does not match the signed request',
      );
    } finally {
      sqlite.close();
    }
  });
});
