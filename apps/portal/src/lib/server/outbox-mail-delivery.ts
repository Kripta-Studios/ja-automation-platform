import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  readFileSync,
  realpathSync,
  lstatSync,
  openSync,
  closeSync,
  fstatSync,
  constants,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openInvitationToken } from './invitation-mail-token.ts';
import net, { type Socket } from 'node:net';
import tls, { type TLSSocket } from 'node:tls';
import type { DatabaseSync } from 'node:sqlite';
import { notificationCopy, normalizeNotificationLocale } from './notification-copy.ts';

const CORPORATE_DOMAIN = 'j-aautomation.com';
const MAX_WEBHOOK_BYTES = 256 * 1024;
const SMTP_TIMEOUT_MS = 15_000;

type SmtpSocket = Socket | TLSSocket;

export type SignedOutboxRequest = Readonly<{
  eventId: string;
  topic:
    | 'notification.email.requested'
    | 'public-inquiry.received'
    | 'invitation.created'
    | 'invoice.issued'
    | 'invoice.email.requested';
  aggregateId: string;
  idempotencyKey: string;
  attempts: number;
  payload: Record<string, unknown>;
}>;

export type MailDelivery = Readonly<{
  recipient: string;
  subject: string;
  body: string;
  messageId: string;
  attachment?: Readonly<{ filename: string; content: Buffer }>;
}>;

const requiredText = (value: unknown, field: string, maximum = 512): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error(`Invalid ${field}`);
  if (/\r|\n/u.test(value)) throw new Error(`Invalid ${field}`);
  return value.trim();
};

const recipientAddress = (value: unknown, field: string): string => {
  const address = requiredText(value, field, 254).toLowerCase();
  const parts = address.split('@');
  const local = parts[0] ?? '';
  const domain = parts[1] ?? '';
  if (
    parts.length !== 2 ||
    local.length > 64 ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u.test(local) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(domain)
  )
    throw new Error(`Invalid ${field}`);
  return address;
};

const corporateAddress = (value: unknown, field: string): string => {
  const address = requiredText(value, field, 320).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@j-aautomation\.com$/u.test(address))
    throw new Error(`${field} must be a corporate J&A mailbox`);
  return address;
};

export const verifyOutboxSignature = (
  body: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean => {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return false;
  const match = /^sha256=([a-f0-9]{64})$/u.exec(signatureHeader ?? '');
  const suppliedHex = match?.[1];
  if (!suppliedHex) return false;
  const supplied = Buffer.from(suppliedHex, 'hex');
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

export const parseSignedOutboxRequest = (body: string): SignedOutboxRequest => {
  if (Buffer.byteLength(body, 'utf8') > MAX_WEBHOOK_BYTES)
    throw new Error('Webhook body is too large');
  const value = JSON.parse(body) as Record<string, unknown>;
  const topic = requiredText(value.topic, 'topic', 128);
  if (
    ![
      'notification.email.requested',
      'public-inquiry.received',
      'invitation.created',
      'invoice.issued',
      'invoice.email.requested',
    ].includes(topic)
  )
    throw new Error('Unsupported outbox topic');
  if (
    !Number.isSafeInteger(value.attempts) ||
    Number(value.attempts) < 1 ||
    Number(value.attempts) > 1_000
  )
    throw new Error('Invalid attempts');
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload))
    throw new Error('Invalid payload');
  return {
    eventId: requiredText(value.eventId, 'eventId'),
    topic: topic as SignedOutboxRequest['topic'],
    aggregateId: requiredText(value.aggregateId, 'aggregateId'),
    idempotencyKey: requiredText(value.idempotencyKey, 'idempotencyKey'),
    attempts: Number(value.attempts),
    payload: value.payload as Record<string, unknown>,
  };
};

const publicInquiryCopy = (
  kind: string,
  payload: Record<string, unknown>,
): { subject: string; body: string } => {
  const labels: Record<string, string> = {
    contact: 'New website contact request',
    support: 'New website support request',
    'project-inquiry': 'New project inquiry',
    'technical-support': 'New technical support request',
    'career-interest': 'New career inquiry',
    aquarex: 'New Aquarex inquiry',
  };
  const safePayload = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key.slice(0, 80),
      typeof value === 'string' ? value.slice(0, 8_000) : value,
    ]),
  );
  return {
    subject: labels[kind] ?? 'New J&A Automation website inquiry',
    body: `A new ${kind} request was submitted through j-aautomation.com.\n\n${JSON.stringify(safePayload, null, 2)}`,
  };
};

export const resolveMailDelivery = (
  sqlite: DatabaseSync,
  request: SignedOutboxRequest,
  formRecipient: string | undefined,
  options: Readonly<{
    authSecret?: string | undefined;
    documentRoot?: string | undefined;
    publicOrigin?: string | undefined;
    publicBasePath?: string | undefined;
  }> = {},
): MailDelivery | 'already-delivered' => {
  const event = sqlite
    .prepare(
      `SELECT topic,aggregate_id,idempotency_key,delivered_at,failed_at,payload_json
         FROM outbox_event
        WHERE id=?`,
    )
    .get(request.eventId) as
    | {
        payload_json: string;
        topic: string;
        aggregate_id: string;
        idempotency_key: string;
        delivered_at: string | null;
        failed_at: string | null;
      }
    | undefined;
  if (
    !event ||
    event.topic !== request.topic ||
    event.aggregate_id !== request.aggregateId ||
    event.idempotency_key !== request.idempotencyKey
  )
    throw new Error('Outbox event does not match the signed request');
  if (event.delivered_at) return 'already-delivered';
  if (event.failed_at) throw new Error('Outbox event is not deliverable');

  const payload = JSON.parse(event.payload_json) as Record<string, unknown>;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid stored event payload');
  // The worker may enrich an inquiry request; mail content and identity always
  // come from the database, never from a signed caller's substituted values.
  let attachment: MailDelivery['attachment'];
  let recipient: string;
  let copy: { subject: string; body: string };
  if (request.topic === 'notification.email.requested') {
    const userId = requiredText(payload.userId, 'payload.userId');
    const notificationId = requiredText(payload.notificationId, 'payload.notificationId');
    if (notificationId !== request.aggregateId)
      throw new Error('Notification identity does not match the outbox event');
    const row = sqlite
      .prepare(
        `SELECT u.email,n.kind
           FROM notification n
           JOIN user u ON u.id=n.user_id
          WHERE n.id=? AND n.user_id=? AND u.status='active' AND u.email_verified=1`,
      )
      .get(notificationId, userId) as { email: string; kind: string } | undefined;
    if (!row) throw new Error('Notification recipient is unavailable');
    recipient = recipientAddress(row.email, 'notification recipient');
    copy = notificationCopy(row.kind, normalizeNotificationLocale(payload.locale));
  } else if (request.topic === 'invitation.created') {
    const invitation = sqlite
      .prepare('SELECT email,token_hash,role,expires_at,used_at FROM invitation WHERE id=?')
      .get(request.aggregateId) as
      | {
          email: string;
          token_hash: string;
          role: string;
          expires_at: string;
          used_at: string | null;
        }
      | undefined;
    if (
      !invitation ||
      invitation.used_at ||
      !Number.isFinite(Date.parse(invitation.expires_at)) ||
      Date.parse(invitation.expires_at) <= Date.now() ||
      payload.invitationId !== request.aggregateId ||
      payload.email !== invitation.email ||
      payload.role !== invitation.role ||
      payload.expiresAt !== invitation.expires_at
    )
      throw new Error('Invitation is unavailable');
    const token = openInvitationToken(
      requiredText(payload.encryptedToken, 'encryptedToken', 1024),
      request.aggregateId,
      options.authSecret,
    );
    if (
      !/^[A-Za-z0-9_-]{43}$/u.test(token) ||
      createHash('sha256').update(token).digest('hex') !== invitation.token_hash
    )
      throw new Error('Invitation token mismatch');
    const origin = new URL(options.publicOrigin ?? 'https://j-aautomation.com');
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('Invalid public origin');
    const base = options.publicBasePath ?? '/j-aautomation';
    if (!/^(?:\/[a-zA-Z0-9_-]+)*$/u.test(base)) throw new Error('Invalid public base path');
    recipient = recipientAddress(invitation.email, 'invitation recipient');
    copy = {
      subject: 'J&A Automation invitation',
      body: `You have been invited to J&A Automation. Accept before ${invitation.expires_at}:\n${origin.origin}${base}/app/invite/${token}`,
    };
  } else if (request.topic === 'invoice.issued') {
    if (payload.invoiceId !== request.aggregateId) throw new Error('Invoice identity mismatch');
    const issuer = sqlite
      .prepare(
        "SELECT u.email,i.invoice_number FROM invoice i JOIN audit_event a ON a.entity_id=i.id AND a.action='invoice.issue' JOIN user u ON u.id=a.actor_id WHERE i.id=? AND i.issued_at IS NOT NULL AND u.status='active' AND u.email_verified=1 AND u.role IN ('owner_admin','finance_admin') ORDER BY a.occurred_at LIMIT 1",
      )
      .get(request.aggregateId) as { email: string; invoice_number: string } | undefined;
    if (!issuer) throw new Error('Invoice issuer unavailable');
    recipient = recipientAddress(issuer.email, 'invoice issuer');
    copy = {
      subject: `Invoice ${issuer.invoice_number} issued`,
      body: 'The invoice was issued in the portal. This internal notice does not send the invoice to the client. Use the explicit invoice email action to request client delivery.',
    };
  } else if (request.topic === 'invoice.email.requested') {
    if (payload.invoiceId !== request.aggregateId) throw new Error('Invoice identity mismatch');
    const invoice = sqlite
      .prepare(
        "SELECT i.invoice_number,i.pdf_storage_key,i.pdf_sha256,i.pdf_byte_length FROM invoice i JOIN user u ON u.id=? WHERE i.id=? AND i.state IN ('issued','sent','partially_paid','paid','overdue') AND i.pdf_status='ready' AND u.status='active' AND u.role IN ('owner_admin','finance_admin')",
      )
      .get(requiredText(payload.requestedBy, 'requestedBy'), request.aggregateId) as
      | {
          invoice_number: string;
          pdf_storage_key: string;
          pdf_sha256: string;
          pdf_byte_length: number;
        }
      | undefined;
    if (
      !invoice ||
      invoice.pdf_sha256 !== payload.pdfSha256 ||
      !options.documentRoot ||
      !/^[a-f0-9]{64}$/u.test(invoice.pdf_sha256)
    )
      throw new Error('Invoice PDF unavailable');
    const key = invoice.pdf_storage_key;
    if (
      !key ||
      key.includes('\\') ||
      key.startsWith('/') ||
      key.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error('Invalid invoice storage key');
    const root = realpathSync(options.documentRoot);
    let path = root;
    for (const part of key.split('/')) {
      path = resolve(path, part);
      if (lstatSync(path).isSymbolicLink()) throw new Error('Invoice storage symlink rejected');
    }
    if (!realpathSync(path).startsWith(root + sep)) throw new Error('Invoice storage escape');
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.size !== invoice.pdf_byte_length ||
      stat.size <= 0 ||
      stat.size > 20 * 1024 * 1024
    )
      throw new Error('Invalid invoice PDF size');
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let content: Buffer;
    try {
      const opened = fstatSync(descriptor);
      if (
        !opened.isFile() ||
        opened.size !== stat.size ||
        opened.dev !== stat.dev ||
        opened.ino !== stat.ino
      )
        throw new Error('Invoice PDF changed during read');
      content = readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (
      content.subarray(0, 5).toString() !== '%PDF-' ||
      createHash('sha256').update(content).digest('hex') !== invoice.pdf_sha256
    )
      throw new Error('Invoice PDF integrity mismatch');
    recipient = recipientAddress(payload.recipient, 'invoice recipient');
    attachment = {
      filename: `Invoice-${invoice.invoice_number.replace(/[^a-zA-Z0-9_-]/gu, '_')}.pdf`,
      content,
    };
    copy = {
      subject: `J&A Automation invoice ${invoice.invoice_number}`,
      body: 'Please find your J&A Automation invoice attached.',
    };
  } else {
    recipient = corporateAddress(formRecipient, 'JA_FORM_RECIPIENT');
    if (payload.inquiryId !== request.aggregateId)
      throw new Error('Inquiry identity does not match the stored event');
    const row = sqlite
      .prepare('SELECT kind,payload_json FROM public_inquiry WHERE id=?')
      .get(request.aggregateId) as { kind: string; payload_json: string } | undefined;
    if (!row) throw new Error('Inquiry is unavailable');
    copy = publicInquiryCopy(row.kind, JSON.parse(row.payload_json) as Record<string, unknown>);
  }

  const digest = createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 40);
  return {
    recipient,
    ...(attachment ? { attachment } : {}),
    subject: copy.subject,
    body: copy.body,
    messageId: `<ja-${digest}@${CORPORATE_DOMAIN}>`,
  };
};

type ResponseReader = Readonly<{
  read: () => Promise<{ code: number; lines: string[] }>;
  detach: () => void;
  attach: (socket: SmtpSocket) => void;
}>;

const responseReader = (initialSocket: SmtpSocket): ResponseReader => {
  type Response = { code: number; lines: string[] };
  type Pending = { resolve: (response: Response) => void; reject: (error: Error) => void };
  let socket: SmtpSocket | undefined;
  let buffered = '';
  let currentLines: string[] = [];
  let terminalError: Error | undefined;
  const queued: Response[] = [];
  const pending: Pending[] = [];
  const dispatch = (response: Response) => {
    const waiter = pending.shift();
    if (waiter) waiter.resolve(response);
    else queued.push(response);
  };
  const consume = () => {
    for (;;) {
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      const line = buffered.slice(0, newline).replace(/\r$/u, '');
      buffered = buffered.slice(newline + 1);
      if (!/^\d{3}[ -]/u.test(line)) continue;
      currentLines.push(line);
      if (line[3] === ' ') {
        dispatch({ code: Number(line.slice(0, 3)), lines: currentLines });
        currentLines = [];
      }
    }
  };
  const fail = (message: string) => {
    terminalError ??= new Error(message);
    for (const waiter of pending.splice(0)) waiter.reject(terminalError);
  };
  const onData = (chunk: Buffer | string) => {
    buffered += chunk.toString();
    consume();
  };
  const onError = () => fail('SMTP connection failed');
  const onTimeout = () => fail('SMTP connection timed out');
  const onClose = () => fail('SMTP connection closed unexpectedly');
  const detach = () => {
    if (socket) {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    }
    socket = undefined;
    buffered = '';
    currentLines = [];
    queued.splice(0);
    terminalError = undefined;
  };
  const attach = (nextSocket: SmtpSocket) => {
    detach();
    socket = nextSocket;
    nextSocket.on('data', onData);
    nextSocket.on('error', onError);
    nextSocket.on('timeout', onTimeout);
    nextSocket.on('close', onClose);
  };
  const read = (): Promise<Response> => {
    const response = queued.shift();
    if (response) return Promise.resolve(response);
    if (terminalError) return Promise.reject(terminalError);
    if (!socket) return Promise.reject(new Error('SMTP response reader is detached'));
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  attach(initialSocket);
  return { read, detach, attach };
};

const expectCode = async (reader: ResponseReader, allowed: readonly number[]) => {
  const response = await reader.read();
  if (!allowed.includes(response.code)) throw new Error(`SMTP rejected command (${response.code})`);
  return response;
};

const writeLine = (socket: SmtpSocket, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const onError = () => fail('SMTP write failed');
    const onTimeout = () => fail('SMTP write timed out');
    const onClose = () => fail('SMTP connection closed during write');
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.once('close', onClose);
    socket.write(`${line}\r\n`, (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(new Error('SMTP write failed'));
      else resolve();
    });
  });

const quotedPrintableBody = (value: string): string =>
  value
    .replace(/\r\n|\r/gu, '\n')
    .split('\n')
    .flatMap((line) => {
      const tokens = [...Buffer.from(line, 'utf8')].map((byte) =>
        (byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126)
          ? String.fromCharCode(byte)
          : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`,
      );
      if (tokens.length === 0) return [''];
      const encoded: string[] = [];
      let current = '';
      for (const token of tokens) {
        if (current.length + token.length > 75) {
          encoded.push(`${current}=`);
          current = '';
        }
        current += token;
      }
      encoded.push(current);
      return encoded;
    })
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');

const encodedSubject = (value: string): string =>
  /^[\x20-\x7E]+$/u.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const smtpCredential = (value: string | undefined, field: string, maximum: number): string => {
  if (
    !value ||
    Buffer.byteLength(value, 'utf8') < 16 ||
    value.length > maximum ||
    /[\0\r\n]/u.test(value)
  )
    throw new Error(`${field} is required`);
  return value;
};

export class SmtpDeliveryUncertainError extends Error {
  constructor() {
    super('SMTP_DELIVERY_UNCERTAIN');
  }
}

export const sendStalwartMail = async (
  delivery: MailDelivery,
  options: Readonly<{
    smtpUrl: string | undefined;
    username?: string | undefined;
    password?: string | undefined;
    from?: string | undefined;
    rejectUnauthorized?: boolean | undefined;
    timeoutMs?: number | undefined;
  }>,
): Promise<void> => {
  if (!options.smtpUrl) throw new Error('JA_SMTP_URL is required');
  const url = new URL(options.smtpUrl);
  if (
    url.protocol !== 'smtp:' ||
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== '/') ||
    url.search ||
    url.hash
  )
    throw new Error('JA_SMTP_URL must be an uncredentialed smtp:// host URL');
  if (!['mx1.j-aautomation.com', '127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('JA_SMTP_URL must target the local Stalwart service');
  const port = url.port ? Number(url.port) : 587;
  if (port !== 587 && options.rejectUnauthorized !== false)
    throw new Error('Local Stalwart submission must use SMTP port 587');
  const timeoutMs = options.timeoutMs ?? SMTP_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
    throw new Error('Invalid SMTP timeout');
  const recipient = recipientAddress(delivery.recipient, 'recipient');
  requiredText(delivery.subject, 'subject', 512);
  if (
    !/^<ja-[a-z0-9-]+@j-aautomation\.com>$/u.test(delivery.messageId) &&
    !/^<[a-z0-9-]+@j-aautomation\.com>$/u.test(delivery.messageId)
  )
    throw new Error('Invalid message ID');
  const from = corporateAddress(options.from ?? 'no-reply@j-aautomation.com', 'sender');
  const username = corporateAddress(options.username, 'SMTP username');
  const password = smtpCredential(options.password, 'SMTP password', 4_096);
  if (from !== username) throw new Error('SMTP sender must match the authenticated account');
  const socketRef: { current: SmtpSocket } = {
    current: net.connect({ host: url.hostname, port }),
  };
  socketRef.current.setTimeout(timeoutMs);
  const reader = responseReader(socketRef.current);
  const deadline = setTimeout(() => socketRef.current.destroy(), timeoutMs);
  let dataMayHaveBeenAccepted = false;
  try {
    await expectCode(reader, [220]);
    await writeLine(socketRef.current, 'EHLO portal.j-aautomation.com');
    const hello = await expectCode(reader, [250]);
    if (!hello.lines.some((line) => /^250[ -]STARTTLS$/iu.test(line)))
      throw new Error('Local Stalwart SMTP does not advertise STARTTLS');
    await writeLine(socketRef.current, 'STARTTLS');
    await expectCode(reader, [220]);
    reader.detach();
    socketRef.current = await new Promise<TLSSocket>((resolve, reject) => {
      const secure = tls.connect({
        socket: socketRef.current,
        servername:
          url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? undefined : url.hostname,
        rejectUnauthorized: options.rejectUnauthorized ?? true,
      });
      secure.setTimeout(timeoutMs);
      let settled = false;
      const cleanup = () => {
        secure.off('secureConnect', onSecure);
        secure.off('error', onError);
        secure.off('timeout', onTimeout);
        secure.off('close', onClose);
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        secure.destroy();
        reject(new Error(message));
      };
      const onSecure = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(secure);
      };
      const onError = () => fail('SMTP STARTTLS validation failed');
      const onTimeout = () => fail('SMTP STARTTLS validation timed out');
      const onClose = () => fail('SMTP STARTTLS connection closed unexpectedly');
      secure.once('secureConnect', onSecure);
      secure.once('error', onError);
      secure.once('timeout', onTimeout);
      secure.once('close', onClose);
    });
    reader.attach(socketRef.current);
    await writeLine(socketRef.current, 'EHLO portal.j-aautomation.com');
    const secureHello = await expectCode(reader, [250]);
    if (!secureHello.lines.some((line) => /^250[ -]AUTH(?:\s|$)/iu.test(line)))
      throw new Error('Local Stalwart SMTP does not advertise authentication');
    const authentication = Buffer.from(`\0${username}\0${password}`, 'utf8').toString('base64');
    await writeLine(socketRef.current, `AUTH PLAIN ${authentication}`);
    await expectCode(reader, [235]);
    await writeLine(socketRef.current, `MAIL FROM:<${from}>`);
    await expectCode(reader, [250]);
    await writeLine(socketRef.current, `RCPT TO:<${recipient}>`);
    await expectCode(reader, [250, 251]);
    await writeLine(socketRef.current, 'DATA');
    await expectCode(reader, [354]);
    const boundary = `ja-${createHash('sha256').update(delivery.messageId).digest('hex')}`;
    const contentLines = delivery.attachment
      ? [
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          quotedPrintableBody(delivery.body),
          `--${boundary}`,
          'Content-Type: application/pdf',
          `Content-Disposition: attachment; filename="${delivery.attachment.filename.replace(/[^a-zA-Z0-9_.-]/gu, '_')}"`,
          'Content-Transfer-Encoding: base64',
          '',
          delivery.attachment.content
            .toString('base64')
            .match(/.{1,76}/gu)
            ?.join('\r\n') ?? '',
          `--${boundary}--`,
        ]
      : [
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          quotedPrintableBody(delivery.body),
        ];
    const message = [
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${delivery.messageId}`,
      `From: J&A Automation <${from}>`,
      `To: <${recipient}>`,
      `Subject: ${encodedSubject(delivery.subject)}`,
      'MIME-Version: 1.0',
      ...contentLines,
    ].join('\r\n');
    dataMayHaveBeenAccepted = true;
    await writeLine(socketRef.current, `${message}\r\n.`);
    const dataResponse = await reader.read();
    if (dataResponse.code >= 400 && dataResponse.code <= 599) {
      // A complete negative final reply proves the server did not accept DATA.
      dataMayHaveBeenAccepted = false;
      throw new Error(`SMTP rejected command (${dataResponse.code})`);
    }
    if (dataResponse.code !== 250) throw new SmtpDeliveryUncertainError();
    // SMTP DATA 250 is the authoritative queue acceptance point. QUIT is only
    // connection hygiene: a peer may close immediately after accepting DATA,
    // and treating that close as a failed delivery would retry the same mail.
    await writeLine(socketRef.current, 'QUIT')
      .then(() => expectCode(reader, [221]))
      .catch(() => undefined);
  } catch (error) {
    if (dataMayHaveBeenAccepted) throw new SmtpDeliveryUncertainError();
    throw error;
  } finally {
    clearTimeout(deadline);
    reader.detach();
    socketRef.current.destroy();
  }
};

const deliveryClaim = (claimId: string): string =>
  `DELIVERY_IN_PROGRESS:${requiredText(claimId, 'claimId', 128)}`;

export const claimOutboxDelivery = (
  sqlite: DatabaseSync,
  request: SignedOutboxRequest,
  claimId: string,
): 'claimed' | 'already-delivered' => {
  const marker = deliveryClaim(claimId);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const event = sqlite
      .prepare('SELECT delivered_at,failed_at,last_error,attempts FROM outbox_event WHERE id=?')
      .get(request.eventId) as
      | {
          delivered_at: string | null;
          failed_at: string | null;
          last_error: string | null;
          attempts: number;
        }
      | undefined;
    if (event?.delivered_at) {
      sqlite.exec('COMMIT');
      return 'already-delivered';
    }
    if (
      !event ||
      event.failed_at ||
      event.attempts !== request.attempts ||
      event.last_error !== null
    )
      throw new Error('Outbox event cannot be claimed for delivery');
    const result = sqlite
      .prepare(
        `UPDATE outbox_event SET last_error=?,lease_until=COALESCE(lease_until,?)
          WHERE id=? AND delivered_at IS NULL AND failed_at IS NULL
            AND attempts=? AND last_error IS NULL`,
      )
      .run(marker, new Date(Date.now() + 60000).toISOString(), request.eventId, request.attempts);
    if (Number(result.changes) !== 1) throw new Error('Outbox delivery claim failed');
    sqlite.exec('COMMIT');
    return 'claimed';
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
};

export const releaseOutboxDeliveryClaim = (
  sqlite: DatabaseSync,
  request: SignedOutboxRequest,
  claimId: string,
): void => {
  sqlite
    .prepare(
      `UPDATE outbox_event SET last_error=NULL
        WHERE id=? AND delivered_at IS NULL AND failed_at IS NULL AND last_error=?`,
    )
    .run(request.eventId, deliveryClaim(claimId));
};

export const markOutboxDelivered = (
  sqlite: DatabaseSync,
  request: SignedOutboxRequest,
  claimId: string,
  deliveredAt = new Date().toISOString(),
): void => {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = sqlite
      .prepare(
        `UPDATE outbox_event
            SET delivered_at=COALESCE(delivered_at,?),lease_until=NULL,last_error=NULL
          WHERE id=? AND topic=? AND aggregate_id=? AND idempotency_key=?
            AND failed_at IS NULL AND last_error=?`,
      )
      .run(
        deliveredAt,
        request.eventId,
        request.topic,
        request.aggregateId,
        request.idempotencyKey,
        deliveryClaim(claimId),
      );
    if (Number(result.changes) !== 1) throw new Error('Outbox delivery acknowledgement failed');
    if (request.topic === 'invoice.email.requested') {
      const event = sqlite
        .prepare('SELECT payload_json FROM outbox_event WHERE id=?')
        .get(request.eventId) as { payload_json: string };
      const payload = JSON.parse(event.payload_json) as { requestedBy: string; recipient: string };
      sqlite
        .prepare(
          "INSERT INTO invoice_event(id,invoice_id,event_type,reason,actor_id,occurred_at,idempotency_key) VALUES(?,?,'sent',?,?,?,?)",
        )
        .run(
          randomUUID(),
          request.aggregateId,
          `SMTP queue accepted for ${recipientAddress(payload.recipient, 'invoice recipient')}`,
          payload.requestedBy,
          deliveredAt,
          `smtp:${request.eventId}`,
        );
      sqlite
        .prepare(
          "UPDATE invoice SET state=CASE WHEN state='issued' THEN 'sent' ELSE state END,sent_at=COALESCE(sent_at,?),updated_at=?,version=version+1 WHERE id=? AND state IN ('issued','sent','partially_paid','paid','overdue')",
        )
        .run(deliveredAt, deliveredAt, request.aggregateId);
    }
    if (request.topic === 'public-inquiry.received')
      sqlite
        .prepare('UPDATE public_inquiry SET delivered_at=COALESCE(delivered_at,?) WHERE id=?')
        .run(deliveredAt, request.aggregateId);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
};

/** Never release a claim if SMTP acceptance is known or ambiguous. */
export const failOutboxDelivery = (
  sqlite: DatabaseSync,
  request: SignedOutboxRequest,
  claimId: string,
  error: unknown,
  smtpAccepted: boolean,
): void => {
  if (smtpAccepted || error instanceof SmtpDeliveryUncertainError) {
    sqlite
      .prepare(
        "UPDATE outbox_event SET failed_at=?,lease_until=NULL,last_error='SMTP_DELIVERY_UNCERTAIN' WHERE id=? AND delivered_at IS NULL AND failed_at IS NULL AND last_error=?",
      )
      .run(new Date().toISOString(), request.eventId, deliveryClaim(claimId));
  } else releaseOutboxDeliveryClaim(sqlite, request, claimId);
};
