import { readFile } from 'node:fs/promises';
import tls from 'node:tls';

const CORPORATE_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@j-aautomation\.com$/iu;
const IMAP_TAG = 'JA01';
const MAX_RESPONSE_BYTES = 64 * 1024;

type ImapSocket = Pick<
  tls.TLSSocket,
  'destroyed' | 'destroy' | 'end' | 'once' | 'on' | 'setTimeout' | 'write'
>;

export type ImapAuthConfig = {
  enabled?: boolean;
  host?: string;
  port?: number;
  servername?: string;
  timeoutMs?: number;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  caFile?: string;
  signal?: AbortSignal;
  /** Test seam. Production callers always use node:tls. */
  connect?: (options: tls.ConnectionOptions, listener: () => void) => ImapSocket;
};

function enabledFromEnvironment(): boolean {
  return process.env.JA_MAIL_AUTH_ENABLED?.trim().toLowerCase() === 'true';
}

/** True when the portal must authenticate linked mailbox users against Stalwart. */
export function isMailAuthEnabled(): boolean {
  return enabledFromEnvironment();
}

/**
 * - `accepted`: Stalwart accepted the credentials.
 * - `rejected`: Stalwart answered NO/BAD, or the input can never be valid.
 * - `unavailable`: no definitive answer (TLS/network failure, timeout, BYE).
 * - `disabled`: delegated mail authentication is switched off.
 */
export type ImapCredentialOutcome = 'accepted' | 'rejected' | 'unavailable' | 'disabled';

function validHost(value: string): boolean {
  return value.length > 0 && value.length <= 253 && !/[\s\0\r\n]/u.test(value);
}

export function normalizeCorporateEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return CORPORATE_EMAIL.test(email) && !/[\0\r\n]/u.test(value) ? email : null;
}

function quoteImap(value: string): string {
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

async function resolveCa(config: ImapAuthConfig): Promise<string | Buffer | undefined> {
  if (config.ca !== undefined) return config.ca;
  const caFile = config.caFile ?? process.env.JA_IMAP_CA_FILE;
  return caFile ? readFile(caFile) : undefined;
}

/** Authenticate against Stalwart without reading or copying its password hash. */
export async function verifyImapCredentials(
  emailInput: string,
  password: string,
  config: ImapAuthConfig = {},
): Promise<boolean> {
  return (await checkImapCredentials(emailInput, password, config)) === 'accepted';
}

/** Like verifyImapCredentials, but distinguishes a rejection from an outage. */
export async function checkImapCredentials(
  emailInput: string,
  password: string,
  config: ImapAuthConfig = {},
): Promise<ImapCredentialOutcome> {
  if (!(config.enabled ?? enabledFromEnvironment())) return 'disabled';
  const email = normalizeCorporateEmail(emailInput);
  if (!email || !password || password.length > 128 || /[\0\r\n]/u.test(password)) return 'rejected';

  const host = config.host ?? process.env.JA_IMAP_HOST ?? 'mx1.j-aautomation.com';
  const port = config.port ?? Number(process.env.JA_IMAP_PORT ?? 993);
  const servername = config.servername ?? process.env.JA_IMAP_SERVERNAME ?? host;
  const timeoutMs = config.timeoutMs ?? Number(process.env.JA_IMAP_TIMEOUT_MS ?? 4_000);
  const rejectUnauthorized =
    config.rejectUnauthorized ?? process.env.JA_IMAP_TLS_REJECT_UNAUTHORIZED !== 'false';
  if (
    !validHost(host) ||
    !validHost(servername) ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 250 ||
    timeoutMs > 30_000 ||
    (process.env.NODE_ENV === 'production' && !rejectUnauthorized)
  )
    return 'unavailable';

  let ca: string | Buffer | undefined;
  try {
    ca = await resolveCa(config);
  } catch {
    return 'unavailable';
  }

  return new Promise<ImapCredentialOutcome>((resolve) => {
    let socket: ImapSocket | undefined;
    let settled = false;
    let state: 'greeting' | 'login' = 'greeting';
    let buffer = '';
    const abort = () => finish('unavailable');
    const timer = setTimeout(() => finish('unavailable'), timeoutMs);

    function finish(result: ImapCredentialOutcome) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      config.signal?.removeEventListener('abort', abort);
      if (socket && !socket.destroyed) socket.destroy();
      resolve(result);
    }

    config.signal?.addEventListener('abort', abort, { once: true });
    if (config.signal?.aborted) return finish('unavailable');

    try {
      const connect = config.connect ?? ((options, listener) => tls.connect(options, listener));
      socket = connect(
        { host, port, servername, rejectUnauthorized, ...(ca === undefined ? {} : { ca }) },
        () => {},
      );
      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => finish('unavailable'));
      socket.once('error', () => finish('unavailable'));
      socket.once('close', () => finish('unavailable'));
      socket.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        buffer += chunk.toString();
        if (Buffer.byteLength(buffer, 'utf8') > MAX_RESPONSE_BYTES) return finish('unavailable');

        let boundary = buffer.indexOf('\r\n');
        while (boundary >= 0 && !settled) {
          const line = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (/^\* BYE(?:\s|$)/iu.test(line)) return finish('unavailable');
          if (state === 'greeting') {
            if (!/^\* OK(?:\s|$)/iu.test(line)) return finish('unavailable');
            state = 'login';
            socket?.write(`${IMAP_TAG} LOGIN ${quoteImap(email)} ${quoteImap(password)}\r\n`);
          } else {
            const tagged = new RegExp(`^${IMAP_TAG} (OK|NO|BAD)(?:\\s|$)`, 'iu').exec(line);
            if (tagged?.[1]?.toUpperCase() === 'OK') {
              try {
                socket?.write('JA02 LOGOUT\r\n');
                socket?.end();
              } catch {
                // Authentication succeeded; cleanup remains best effort.
              }
              return finish('accepted');
            }
            if (tagged) return finish('rejected');
          }
          boundary = buffer.indexOf('\r\n');
        }
      });
    } catch {
      finish('unavailable');
    }
  });
}
