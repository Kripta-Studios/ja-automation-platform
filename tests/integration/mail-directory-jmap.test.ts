import { describe, expect, it, vi } from 'vitest';
import { StalwartClient } from '../../apps/portal/src/lib/server/stalwart-client';

function response(methodResponses: unknown[]) {
  return new Response(JSON.stringify({ methodResponses }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Stalwart 0.16 JMAP client', () => {
  it('resolves the live domain and never requests credentials while listing', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const method = (body.methodCalls as unknown[][])[0]?.[0];
      if (method === 'x:Domain/query')
        return response([['x:Domain/query', { ids: ['domain-9'] }, 'domain-query']]);
      if (method === 'x:Domain/get')
        return response([
          ['x:Domain/get', { list: [{ id: 'domain-9', name: 'j-aautomation.com' }] }, 'domain-get'],
        ]);
      if (method === 'x:Account/query')
        return response([['x:Account/query', { ids: ['acct-1'], total: 1 }, 'account-query']]);
      return response([
        [
          'x:Account/get',
          {
            list: [
              {
                id: 'acct-1',
                name: 'ana',
                emailAddress: 'ana@j-aautomation.com',
                description: 'Ana',
                domainId: 'domain-9',
                quotas: { maxDiskQuota: 10 },
                usedDiskQuota: 1,
              },
            ],
          },
          'account-get',
        ],
      ]);
    });
    const client = new StalwartClient({
      url: 'https://mx1.j-aautomation.com/jmap',
      token: 'test-token',
      domain: 'j-aautomation.com',
      fetch: fetcher as typeof fetch,
    });
    await expect(client.listMailboxes()).resolves.toEqual([
      {
        id: 'acct-1',
        username: 'ana',
        email: 'ana@j-aautomation.com',
        name: 'Ana',
        domainId: 'domain-9',
        quotaBytes: 10,
        usedDiskQuotaBytes: 1,
      },
    ]);
    const getBody = bodies.find((body) => JSON.stringify(body).includes('x:Account/get'));
    expect(bodies.every((body) => (body.using as string[]).includes('urn:stalwart:jmap'))).toBe(
      true,
    );
    expect(JSON.stringify(getBody)).not.toContain('credentials');
    expect(JSON.stringify(bodies)).not.toContain('test-token');
  });

  it('uses Account/set for create, password update and destroy', async () => {
    const calls: unknown[][] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const call =
        (JSON.parse(String(init?.body)) as { methodCalls: unknown[][] }).methodCalls[0] ?? [];
      calls.push(call);
      if (call[0] === 'x:Domain/query')
        return response([['x:Domain/query', { ids: ['d'] }, 'domain-query']]);
      if (call[0] === 'x:Domain/get')
        return response([
          ['x:Domain/get', { list: [{ id: 'd', name: 'j-aautomation.com' }] }, 'domain-get'],
        ]);
      const id = call[2];
      if (id === 'account-create')
        return response([['x:Account/set', { created: { mailbox: { id: 'new-id' } } }, id]]);
      if (id === 'account-password')
        return response([['x:Account/set', { updated: { 'new-id': null } }, id]]);
      return response([['x:Account/set', { destroyed: ['new-id'] }, id]]);
    });
    const client = new StalwartClient({
      url: 'https://mx1.j-aautomation.com/jmap',
      token: 'token',
      domain: 'j-aautomation.com',
      fetch: fetcher as typeof fetch,
    });
    await client.createMailbox({
      username: 'new.user',
      name: 'New User',
      password: 'LongPassword!23',
      quotaBytes: 1024,
    });
    await client.updatePassword('new-id', 'ChangedPassword!23');
    await client.destroyMailbox('new-id');
    expect(calls.filter((call) => call[0] === 'x:Account/set')).toHaveLength(3);
    const passwordCall = calls.find((call) => call[2] === 'account-password');
    expect(JSON.stringify(passwordCall)).toContain('credentials/0/secret');
    expect(JSON.stringify(passwordCall)).not.toContain('"credentials":');
  });
});
