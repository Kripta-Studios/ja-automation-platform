import { readFile } from 'node:fs/promises';

const CORE_CAPABILITY = 'urn:ietf:params:jmap:core';
// Stalwart 0.16 exposes its administrative objects under this capability.
// Keep it version-pinned until the VPS is deliberately upgraded.
const ADMIN_CAPABILITY = 'urn:stalwart:jmap';
const ACCOUNT_PROPERTIES = [
  '@type',
  'id',
  'name',
  'emailAddress',
  'description',
  'domainId',
  'quotas',
  'usedDiskQuota',
] as const;

export type StalwartMailbox = Readonly<{
  id: string;
  username: string;
  email: string;
  name: string;
  domainId: string;
  quotaBytes: number | null;
  usedDiskQuotaBytes: number | null;
}>;

type Fetch = typeof globalThis.fetch;
type JmapTuple = [string, Record<string, unknown>, string];

export class StalwartUnavailableError extends Error {
  constructor(message = 'STALWART_DIRECTORY_UNAVAILABLE') {
    super(message);
    this.name = 'StalwartUnavailableError';
  }
}

export class StalwartOperationRejectedError extends Error {
  constructor(
    public readonly operation: 'create' | 'update' | 'destroy',
    public readonly rejectionType: string,
    public readonly properties: readonly string[],
  ) {
    super(`STALWART_${operation.toUpperCase()}_REJECTED_${rejectionType}`);
    this.name = 'StalwartOperationRejectedError';
  }
}

export type StalwartClientOptions = Readonly<{
  url: string;
  token: string;
  domain: string;
  excludedUsernames?: readonly string[];
  fetch?: Fetch;
}>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function quotaFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  return safeInteger((value as Record<string, unknown>).maxDiskQuota);
}

export class StalwartClient {
  private readonly fetcher: Fetch;
  private readonly excludedUsernames: ReadonlySet<string>;

  constructor(private readonly options: StalwartClientOptions) {
    if (!/^https:\/\//u.test(options.url) && process.env.NODE_ENV === 'production')
      throw new Error('STALWART_JMAP_TLS_REQUIRED');
    if (!options.token.trim()) throw new Error('STALWART_TOKEN_REQUIRED');
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.excludedUsernames = new Set(
      (options.excludedUsernames ?? [])
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  private async call(methodCalls: readonly JmapTuple[]): Promise<JmapTuple[]> {
    let response: Response;
    try {
      response = await this.fetcher(this.options.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ using: [CORE_CAPABILITY, ADMIN_CAPABILITY], methodCalls }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new StalwartUnavailableError();
    }
    if (!response.ok) throw new StalwartUnavailableError(`STALWART_HTTP_${response.status}`);
    let document: unknown;
    try {
      document = await response.json();
    } catch {
      throw new StalwartUnavailableError('STALWART_RESPONSE_INVALID');
    }
    const tuples = (document as { methodResponses?: unknown })?.methodResponses;
    if (!Array.isArray(tuples)) throw new StalwartUnavailableError('STALWART_RESPONSE_INVALID');
    const result = tuples as JmapTuple[];
    const methodError = result.find(([name]) => name === 'error');
    if (methodError) {
      const errorType = text(methodError[1]?.type) || 'unknown';
      throw new StalwartUnavailableError(`STALWART_METHOD_${errorType}`);
    }
    return result;
  }

  private result(responses: readonly JmapTuple[], name: string, callId: string) {
    const tuple = responses.find(([method, , id]) => method === name && id === callId);
    if (!tuple) throw new StalwartUnavailableError('STALWART_METHOD_RESPONSE_MISSING');
    return tuple[1];
  }

  async resolveDomainId(): Promise<string> {
    const query = await this.call([
      ['x:Domain/query', { filter: { name: this.options.domain }, limit: 2 }, 'domain-query'],
    ]);
    const ids = this.result(query, 'x:Domain/query', 'domain-query').ids;
    if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string')
      throw new StalwartUnavailableError('STALWART_DOMAIN_NOT_UNIQUE');
    const get = await this.call([
      ['x:Domain/get', { ids: [ids[0]], properties: ['id', 'name'] }, 'domain-get'],
    ]);
    const list = this.result(get, 'x:Domain/get', 'domain-get').list;
    const domain = Array.isArray(list)
      ? (list[0] as Record<string, unknown> | undefined)
      : undefined;
    if (text(domain?.name).toLowerCase() !== this.options.domain.toLowerCase())
      throw new StalwartUnavailableError('STALWART_DOMAIN_MISMATCH');
    return text(domain?.id) || ids[0];
  }

  async listMailboxes(): Promise<StalwartMailbox[]> {
    const domainId = await this.resolveDomainId();
    const ids: string[] = [];
    let position = 0;
    for (;;) {
      const responses = await this.call([
        [
          'x:Account/query',
          { filter: { domainId }, position, limit: 250, calculateTotal: true },
          'account-query',
        ],
      ]);
      const result = this.result(responses, 'x:Account/query', 'account-query');
      const page = Array.isArray(result.ids)
        ? result.ids.filter((id): id is string => typeof id === 'string')
        : [];
      ids.push(...page);
      const total = safeInteger(result.total);
      if (page.length === 0 || (total !== null && ids.length >= total) || page.length < 250) break;
      position += page.length;
    }
    if (ids.length === 0) return [];
    const responses = await this.call([
      ['x:Account/get', { ids, properties: [...ACCOUNT_PROPERTIES] }, 'account-get'],
    ]);
    const list = this.result(responses, 'x:Account/get', 'account-get').list;
    if (!Array.isArray(list)) throw new StalwartUnavailableError('STALWART_ACCOUNTS_INVALID');
    return list.flatMap((raw) => {
      const account = raw as Record<string, unknown>;
      const accountType = text(account['@type']);
      if (accountType && accountType !== 'User') return [];
      const username = text(account.name).trim().toLowerCase();
      if (this.excludedUsernames.has(username)) return [];
      const email = (
        text(account.emailAddress) || `${username}@${this.options.domain}`
      ).toLowerCase();
      const id = text(account.id);
      if (!id || !username || text(account.domainId) !== domainId)
        throw new StalwartUnavailableError('STALWART_ACCOUNT_INVALID');
      return [
        {
          id,
          username,
          email,
          name: text(account.description).trim() || username,
          domainId,
          quotaBytes: quotaFrom(account.quotas),
          usedDiskQuotaBytes: safeInteger(account.usedDiskQuota),
        },
      ];
    });
  }

  async createMailbox(input: {
    username: string;
    name: string;
    password: string;
    quotaBytes: number;
  }): Promise<StalwartMailbox> {
    const domainId = await this.resolveDomainId();
    const createId = 'mailbox';
    const responses = await this.call([
      [
        'x:Account/set',
        {
          create: {
            [createId]: {
              '@type': 'User',
              name: input.username,
              domainId,
              description: input.name,
              credentials: { '0': { '@type': 'Password', secret: input.password } },
              roles: { '@type': 'User' },
              permissions: { '@type': 'Inherit' },
              quotas: { maxDiskQuota: input.quotaBytes },
              aliases: {},
              memberGroupIds: {},
              encryptionAtRest: { '@type': 'Disabled' },
            },
          },
        },
        'account-create',
      ],
    ]);
    const result = this.result(responses, 'x:Account/set', 'account-create');
    const created = (result.created as Record<string, Record<string, unknown>> | undefined)?.[
      createId
    ];
    const id = text(created?.id);
    if (!id) {
      const rejected = (result.notCreated as Record<string, Record<string, unknown>> | undefined)?.[
        createId
      ];
      if (rejected) {
        const rawType = text(rejected.type);
        const rejectionType = /^[a-zA-Z0-9_-]{1,64}$/u.test(rawType) ? rawType : 'unknown';
        const properties = Array.isArray(rejected.properties)
          ? rejected.properties
              .filter(
                (property): property is string =>
                  typeof property === 'string' && /^[a-zA-Z0-9_.\/-]{1,64}$/u.test(property),
              )
              .slice(0, 12)
          : [];
        console.error(
          JSON.stringify({
            event: 'stalwart.account.create_rejected',
            rejectionType,
            properties,
          }),
        );
        throw new StalwartOperationRejectedError('create', rejectionType, properties);
      }
      throw new StalwartUnavailableError('STALWART_CREATE_NOT_CONFIRMED');
    }
    return {
      id,
      username: input.username,
      email: `${input.username}@${this.options.domain}`,
      name: input.name,
      domainId,
      quotaBytes: input.quotaBytes,
      usedDiskQuotaBytes: 0,
    };
  }

  async updatePassword(stalwartAccountId: string, password: string): Promise<void> {
    const responses = await this.call([
      [
        'x:Account/set',
        {
          update: {
            // Patch only the primary password. Replacing the complete
            // credentials object could erase Stalwart-managed app passwords.
            [stalwartAccountId]: { 'credentials/0/secret': password },
          },
        },
        'account-password',
      ],
    ]);
    const result = this.result(responses, 'x:Account/set', 'account-password');
    const updated = result.updated;
    if (
      !(
        (Array.isArray(updated) && updated.includes(stalwartAccountId)) ||
        (updated && typeof updated === 'object' && stalwartAccountId in updated)
      )
    )
      throw new StalwartUnavailableError('STALWART_UPDATE_NOT_CONFIRMED');
  }

  async destroyMailbox(stalwartAccountId: string): Promise<void> {
    const responses = await this.call([
      ['x:Account/set', { destroy: [stalwartAccountId] }, 'account-destroy'],
    ]);
    const result = this.result(responses, 'x:Account/set', 'account-destroy');
    if (!Array.isArray(result.destroyed) || !result.destroyed.includes(stalwartAccountId))
      throw new StalwartUnavailableError('STALWART_DESTROY_NOT_CONFIRMED');
  }
}

export async function createConfiguredStalwartClient(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<StalwartClient> {
  const url = environment.JA_STALWART_JMAP_URL?.trim();
  const tokenFile = environment.JA_STALWART_TOKEN_FILE?.trim();
  const developmentToken = environment.JA_STALWART_TOKEN?.trim();
  if (!url) throw new StalwartUnavailableError('STALWART_JMAP_URL_REQUIRED');
  let token = '';
  if (tokenFile) {
    try {
      token = (await readFile(tokenFile, { encoding: 'utf8' })).trim();
    } catch {
      throw new StalwartUnavailableError('STALWART_TOKEN_FILE_UNAVAILABLE');
    }
  } else if (environment.NODE_ENV !== 'production') token = developmentToken ?? '';
  if (!token || token.length > 16_384)
    throw new StalwartUnavailableError('STALWART_TOKEN_UNAVAILABLE');
  return new StalwartClient({
    url,
    token,
    domain: environment.JA_STALWART_DOMAIN?.trim().toLowerCase() || 'j-aautomation.com',
    excludedUsernames: (environment.JA_STALWART_EXCLUDED_USERNAMES ?? '')
      .split(',')
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean),
  });
}
