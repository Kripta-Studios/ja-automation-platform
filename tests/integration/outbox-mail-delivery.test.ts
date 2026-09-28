import {
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  closeB5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import {
  sealInvitationToken,
  openInvitationToken,
} from '../../apps/portal/src/lib/server/invitation-mail-token.ts';
import { createHash, createHmac } from 'node:crypto';
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
  failOutboxDelivery,
  SmtpDeliveryUncertainError,
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
    closeWithoutDataAck?: boolean;
    rejectAfterData?: 451 | 550;
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
              if (!options.rejectAfterData) acceptedMessages += 1;
              lastMessage = currentMessage;
              currentMessage = [];
              if (options.rejectAfterData)
                socket.write(`${options.rejectAfterData} message rejected\r\n`);
              else if (options.closeWithoutDataAck) socket.destroy();
              else if (options.closeAfterData) socket.end('250 2.0.0 queued\r\n');
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
  it.each([451, 550] as const)(
    'keeps definitive SMTP %i DATA rejection retryable without false acceptance',
    async (code) => {
      const smtp = await startTestSmtp({ rejectAfterData: code });
      const { sqlite } = database();
      try {
        const now = new Date().toISOString();
        sqlite
          .prepare(
            "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,attempts) VALUES('event-1','notification.email.requested','notification-1','notification-email:notification-1','{}',?,?,1)",
          )
          .run(now, now);
        const request = parseSignedOutboxRequest(JSON.stringify(signedRequest()));
        claimOutboxDelivery(sqlite, request, 'rejected-claim');
        let rejection: unknown;
        try {
          await sendStalwartMail(
            {
              recipient: 'external@example.test',
              subject: 'test',
              body: 'test',
              messageId: '<ja-rejected@j-aautomation.com>',
            },
            {
              smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
              username: smtpUsername,
              password: smtpPassword,
              rejectUnauthorized: false,
            },
          );
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
        expect(rejection).not.toBeInstanceOf(SmtpDeliveryUncertainError);
        expect((rejection as Error).message).toContain(String(code));
        failOutboxDelivery(sqlite, request, 'rejected-claim', rejection, false);
        expect(
          sqlite
            .prepare(
              "SELECT delivered_at,failed_at,last_error FROM outbox_event WHERE id='event-1'",
            )
            .get(),
        ).toMatchObject({ delivered_at: null, failed_at: null, last_error: null });
        expect(smtp.acceptedMessages()).toBe(0);
      } finally {
        sqlite.close();
        await smtp.close();
      }
    },
  );

  it('stops automatic retries after ambiguous SMTP DATA, acknowledgement failure or stale claims', async () => {
    const fixture = createB5LifecycleSecurityFixture();
    const smtp = await startTestSmtp({ closeWithoutDataAck: true });
    try {
      const now = new Date().toISOString();
      const eventId = 'uncertain-event';
      fixture.sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,attempts) VALUES(?,'invitation.created','notification-1','uncertain-key','{\"emailConfirmed\":true}',?,?,1)",
        )
        .run(eventId, now, now);
      const request = parseSignedOutboxRequest(
        JSON.stringify(
          signedRequest({ topic: 'invitation.created', eventId, idempotencyKey: 'uncertain-key' }),
        ),
      );
      claimOutboxDelivery(fixture.sqlite, request, 'uncertain-claim');
      let failure: unknown;
      try {
        await sendStalwartMail(
          {
            recipient: 'test@example.test',
            subject: 'test',
            body: 'test',
            messageId: '<ja-uncertain@j-aautomation.com>',
          },
          {
            smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
            username: smtpUsername,
            password: smtpPassword,
            rejectUnauthorized: false,
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(SmtpDeliveryUncertainError);
      failOutboxDelivery(fixture.sqlite, request, 'uncertain-claim', failure, false);
      expect(
        fixture.sqlite
          .prepare('SELECT delivered_at,failed_at,last_error FROM outbox_event WHERE id=?')
          .get(eventId),
      ).toMatchObject({
        delivered_at: null,
        failed_at: expect.any(String),
        last_error: 'SMTP_DELIVERY_UNCERTAIN',
      });
      let calls = 0;
      await fixture.v3.runDueOutbox(20, async () => {
        calls++;
      });
      expect(calls).toBe(0);
      expect(smtp.acceptedMessages()).toBe(1);
      // A worker HTTP error cannot erase an endpoint claim or terminal failure.
      fixture.sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES('http-event','invitation.created','notification-1','http-key','{\"emailConfirmed\":true}',?,?)",
        )
        .run(now, now);
      const outcome = await fixture.v3.runDueOutbox(1, async (event) => {
        claimOutboxDelivery(
          fixture.sqlite,
          {
            ...request,
            eventId: event.id,
            idempotencyKey: event.idempotencyKey,
            attempts: event.attempts,
          },
          'http-claim',
        );
        throw new Error('HTTP response lost');
      });
      expect(outcome).toMatchObject({ failed: 1, permanentlyFailed: 1 });
      expect(
        fixture.sqlite.prepare("SELECT last_error FROM outbox_event WHERE id='http-event'").get(),
      ).toMatchObject({ last_error: 'SMTP_DELIVERY_UNCERTAIN' });
      // Definitive pre-DATA failures remain retryable after the endpoint releases its claim.
      fixture.sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES('retry-event','invitation.created','notification-1','retry-key','{\"emailConfirmed\":true}',?,?)",
        )
        .run(now, now);
      await fixture.v3.runDueOutbox(1, async (event) => {
        const retry = {
          ...request,
          eventId: event.id,
          idempotencyKey: event.idempotencyKey,
          attempts: event.attempts,
        };
        claimOutboxDelivery(fixture.sqlite, retry, 'retry-claim');
        failOutboxDelivery(
          fixture.sqlite,
          retry,
          'retry-claim',
          new Error('SMTP authentication rejected'),
          false,
        );
        throw new Error('SMTP authentication rejected');
      });
      expect(
        fixture.sqlite
          .prepare("SELECT failed_at,last_error FROM outbox_event WHERE id='retry-event'")
          .get(),
      ).toMatchObject({ failed_at: null, last_error: 'SMTP authentication rejected' });
      // A known SMTP acceptance followed by SQL acknowledgement failure is equally terminal.
      fixture.sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,attempts) VALUES('ack-event','invitation.created','notification-1','ack-key','{\"emailConfirmed\":true}',?,?,1)",
        )
        .run(now, now);
      const ack = { ...request, eventId: 'ack-event', idempotencyKey: 'ack-key' };
      claimOutboxDelivery(fixture.sqlite, ack, 'ack-claim');
      fixture.sqlite.exec(
        "CREATE TEMP TRIGGER reject_delivery BEFORE UPDATE OF delivered_at ON outbox_event WHEN NEW.id='ack-event' BEGIN SELECT RAISE(ABORT,'ack DB failure'); END",
      );
      expect(() => markOutboxDelivered(fixture.sqlite, ack, 'ack-claim')).toThrow('ack DB failure');
      failOutboxDelivery(fixture.sqlite, ack, 'ack-claim', new Error('ack DB failure'), true);
      fixture.sqlite.exec('DROP TRIGGER reject_delivery');
      // An active claim survives another worker; only an expired claim becomes uncertain.
      fixture.sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at,attempts) VALUES('stale-event','invitation.created','notification-1','stale-key','{\"emailConfirmed\":true}',?,?,1)",
        )
        .run(now, now);
      const stale = { ...request, eventId: 'stale-event', idempotencyKey: 'stale-key' };
      claimOutboxDelivery(fixture.sqlite, stale, 'stale-claim');
      await fixture.v3.runDueOutbox(20, async () => {
        calls++;
      });
      expect(
        fixture.sqlite.prepare("SELECT failed_at FROM outbox_event WHERE id='stale-event'").get(),
      ).toMatchObject({ failed_at: null });
      fixture.sqlite
        .prepare(
          "UPDATE outbox_event SET lease_until='2000-01-01T00:00:00.000Z' WHERE id='stale-event'",
        )
        .run();
      await fixture.v3.runDueOutbox(20, async () => {
        calls++;
      });
      expect(calls).toBe(0);
      expect(
        fixture.sqlite.prepare("SELECT last_error FROM outbox_event WHERE id='stale-event'").get(),
      ).toMatchObject({ last_error: 'SMTP_DELIVERY_UNCERTAIN' });
    } finally {
      closeB5LifecycleSecurityFixture(fixture);
      await smtp.close();
    }
  });

  it('creates invitation and encrypted outbox atomically; manual invitations do not queue undeliverable mail', () => {
    const fixture = createB5LifecycleSecurityFixture();
    const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'invitation-test');
    try {
      const before = fixture.sqlite.prepare('SELECT count(*) n FROM invitation').get() as {
        n: number;
      };
      expect(() =>
        fixture.v3.createInvitation(
          owner,
          { email: 'new@example.test', role: 'worker', emailConfirmed: true },
          () => {
            throw new Error('seal failed');
          },
        ),
      ).toThrow('seal failed');
      expect(fixture.sqlite.prepare('SELECT count(*) n FROM invitation').get()).toEqual(before);
      const manual = fixture.v3.createInvitation(owner, {
        email: 'manual@example.test',
        role: 'worker',
      });
      expect(
        fixture.sqlite.prepare('SELECT id FROM outbox_event WHERE aggregate_id=?').get(manual.id),
      ).toBeUndefined();
      const emailed = fixture.v3.createInvitation(
        owner,
        { email: 'mail@example.test', role: 'worker', emailConfirmed: true },
        (token, id) => sealInvitationToken(token, id, 'secret'.repeat(10)),
      );
      const row = fixture.sqlite
        .prepare('SELECT payload_json FROM outbox_event WHERE aggregate_id=?')
        .get(emailed.id) as { payload_json: string };
      expect(row.payload_json).not.toContain(emailed.token);
      expect(JSON.parse(row.payload_json).encryptedToken).toMatch(/^v1\./);
    } finally {
      closeB5LifecycleSecurityFixture(fixture);
    }
  });

  it('decrypts only the matching pending invitation and rejects token, identity and expiry substitution', () => {
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const token = 'a'.repeat(43);
      const secret = 'test-auth-secret'.repeat(4);
      const encryptedToken = sealInvitationToken(token, 'invite-1', secret);
      expect(encryptedToken).not.toContain(token);
      expect(() => openInvitationToken(encryptedToken, 'invite-2', secret)).toThrow();
      expect(() =>
        openInvitationToken(encryptedToken, 'invite-1', 'different-secret'.repeat(4)),
      ).toThrow();
      sqlite
        .prepare(
          "INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at) VALUES('owner-1','Owner','owner@example.test',1,'finance_admin','active',?,?)",
        )
        .run(now, now);
      sqlite
        .prepare(
          "INSERT INTO invitation(id,email,token_hash,role,invited_by,expires_at,created_at) VALUES('invite-1','external@example.test',?,'worker','owner-1',?,?)",
        )
        .run(createHash('sha256').update(token).digest('hex'), expiresAt, now);
      const payload = {
        emailConfirmed: true,
        invitationId: 'invite-1',
        email: 'external@example.test',
        role: 'worker',
        expiresAt,
        encryptedToken,
      };
      sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES('invite-event','invitation.created','invite-1','invitation:invite-1',?,?,?)",
        )
        .run(JSON.stringify(payload), now, now);
      const request = parseSignedOutboxRequest(
        JSON.stringify(
          signedRequest({
            eventId: 'invite-event',
            topic: 'invitation.created',
            aggregateId: 'invite-1',
            idempotencyKey: 'invitation:invite-1',
            payload: { email: 'attacker@example.test' },
          }),
        ),
      );
      const delivery = resolveMailDelivery(sqlite, request, undefined, { authSecret: secret });
      expect(delivery).toMatchObject({
        recipient: 'external@example.test',
        body: expect.stringContaining(`/app/invite/${token}`),
      });
      sqlite.prepare("UPDATE invitation SET token_hash=? WHERE id='invite-1'").run('b'.repeat(64));
      expect(() => resolveMailDelivery(sqlite, request, undefined, { authSecret: secret })).toThrow(
        'token mismatch',
      );
      sqlite
        .prepare("UPDATE invitation SET expires_at='2000-01-01T00:00:00.000Z' WHERE id='invite-1'")
        .run();
      expect(() => resolveMailDelivery(sqlite, request, undefined, { authSecret: secret })).toThrow(
        'unavailable',
      );
    } finally {
      sqlite.close();
    }
  });

  it('transmits PDF attachments as MIME multipart only after authenticated SMTP acceptance', async () => {
    const smtp = await startTestSmtp();
    try {
      const content = Buffer.from('%PDF-1.7\nfixture');
      await sendStalwartMail(
        {
          recipient: 'billing@example.test',
          subject: 'Invoice 123',
          body: 'Invoice attached',
          messageId: '<ja-fixture@j-aautomation.com>',
          attachment: { filename: 'Invoice-123.pdf', content },
        },
        {
          smtpUrl: `smtp://127.0.0.1:${smtp.port}`,
          username: smtpUsername,
          password: smtpPassword,
          rejectUnauthorized: false,
        },
      );
      expect(smtp.acceptedMessages()).toBe(1);
      expect(smtp.lastMessage()).toContain('multipart/mixed');
      expect(smtp.lastMessage()).toContain('filename="Invoice-123.pdf"');
      expect(smtp.lastMessage()).toContain(content.toString('base64'));
    } finally {
      await smtp.close();
    }
  });

  it('blocks legacy notification mail even for verified users and forged confirmation', async () => {
    const { sqlite } = database();
    const smtp = await startTestSmtp();
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          "INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at) VALUES('worker-1','External','technician@example.test',1,'worker','active',?,?)",
        )
        .run(now, now);
      sqlite
        .prepare(
          "INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES('notification-1','worker-1','missing_time','time-1',?)",
        )
        .run(now);
      sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES('event-1','notification.email.requested','notification-1','notification-email:notification-1',?,?,?)",
        )
        .run(JSON.stringify(signedRequest().payload), now, now);
      const request = parseSignedOutboxRequest(JSON.stringify(signedRequest()));
      expect(() => resolveMailDelivery(sqlite, request, undefined)).toThrow('EMAIL_NOT_CONFIRMED');
      sqlite
        .prepare(
          "UPDATE outbox_event SET payload_json=json_set(payload_json,'$.emailConfirmed',json('true')) WHERE id='event-1'",
        )
        .run();
      expect(() => resolveMailDelivery(sqlite, request, undefined)).toThrow('EMAIL_NOT_CONFIRMED');
      expect(smtp.acceptedMessages()).toBe(0);
    } finally {
      sqlite.close();
      await smtp.close();
    }
  });

  it('rejects a signed request that substitutes the stored notification recipient', () => {
    const { sqlite } = database();
    try {
      const now = new Date().toISOString();
      for (const id of ['worker-1', 'worker-2']) {
        sqlite
          .prepare(
            "INSERT INTO user(id,name,email,email_verified,role,status,created_at,updated_at) VALUES(?,?,?,1,'worker','active',?,?)",
          )
          .run(id, id, `${id}@j-aautomation.com`, now, now);
      }
      sqlite
        .prepare(
          "INSERT INTO notification(id,user_id,kind,subject_id,created_at) VALUES('notification-1','worker-2','missing_time','time-1',?)",
        )
        .run(now);
      sqlite
        .prepare(
          "INSERT INTO outbox_event(id,topic,aggregate_id,idempotency_key,payload_json,available_at,created_at) VALUES('event-1','notification.email.requested','notification-1','notification-email:notification-1',?,?,?)",
        )
        .run(JSON.stringify(signedRequest().payload), now, now);
      const forged = parseSignedOutboxRequest(
        JSON.stringify(
          signedRequest({ payload: { ...signedRequest().payload, userId: 'worker-2' } }),
        ),
      );
      expect(() => resolveMailDelivery(sqlite, forged, undefined)).toThrow('EMAIL_NOT_CONFIRMED');
    } finally {
      sqlite.close();
    }
  });

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
      expect(() => resolveMailDelivery(sqlite, request, undefined)).toThrow('EMAIL_NOT_CONFIRMED');
      // Exercise the durable claim primitive independently of the delivery policy.
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
          JSON.stringify({ inquiryId: 'inquiry-1', kind: 'contact', emailConfirmed: true }),
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
