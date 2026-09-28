import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeCorporateEmail,
  verifyImapCredentials,
} from '../../apps/portal/src/lib/server/imap-auth';

class FakeImapSocket extends EventEmitter {
  destroyed = false;
  writes: string[] = [];
  setTimeout() {
    return this;
  }
  write(value: string) {
    this.writes.push(value);
    return true;
  }
  end() {
    return this;
  }
  destroy() {
    this.destroyed = true;
    return this;
  }
}

function connection(socket: FakeImapSocket) {
  return vi.fn((_options, connected: () => void) => {
    queueMicrotask(connected);
    return socket as never;
  });
}

describe('Stalwart IMAPS authentication', () => {
  it('parses chunked greeting and tagged success exactly once', async () => {
    const socket = new FakeImapSocket();
    const result = verifyImapCredentials('Worker.One@j-aautomation.com', 's3cret"\\value', {
      enabled: true,
      timeoutMs: 1_000,
      connect: connection(socket),
    });
    await Promise.resolve();
    socket.emit('data', Buffer.from('* O'));
    socket.emit('data', Buffer.from('K Stalwart ready\r\n'));
    expect(socket.writes).toEqual([
      'JA01 LOGIN "worker.one@j-aautomation.com" "s3cret\\"\\\\value"\r\n',
    ]);
    socket.emit('data', Buffer.from('* CAPABILITY IMAP4rev1\r\nJA01 O'));
    socket.emit('data', Buffer.from('K authenticated\r\n'));
    await expect(result).resolves.toBe(true);
    expect(socket.writes.filter((line) => line.startsWith('JA01 LOGIN'))).toHaveLength(1);
  });

  it.each(['NO invalid credentials', 'BAD invalid command'])('rejects tagged %s', async (reply) => {
    const socket = new FakeImapSocket();
    const result = verifyImapCredentials('worker@j-aautomation.com', 'wrong', {
      enabled: true,
      timeoutMs: 1_000,
      connect: connection(socket),
    });
    await Promise.resolve();
    socket.emit('data', '* OK ready\r\n');
    socket.emit('data', `JA01 ${reply}\r\n`);
    await expect(result).resolves.toBe(false);
  });

  it('fails closed on timeout, socket error, BYE and disabled mode', async () => {
    const timeoutSocket = new FakeImapSocket();
    const timeout = verifyImapCredentials('worker@j-aautomation.com', 'secret', {
      enabled: true,
      timeoutMs: 250,
      connect: connection(timeoutSocket),
    });
    await Promise.resolve();
    timeoutSocket.emit('timeout');
    await expect(timeout).resolves.toBe(false);

    const errorSocket = new FakeImapSocket();
    const errored = verifyImapCredentials('worker@j-aautomation.com', 'secret', {
      enabled: true,
      connect: connection(errorSocket),
    });
    await Promise.resolve();
    errorSocket.emit('error', new Error('TLS certificate rejected'));
    await expect(errored).resolves.toBe(false);

    const byeSocket = new FakeImapSocket();
    const bye = verifyImapCredentials('worker@j-aautomation.com', 'secret', {
      enabled: true,
      connect: connection(byeSocket),
    });
    await Promise.resolve();
    byeSocket.emit('data', '* BYE unavailable\r\n');
    await expect(bye).resolves.toBe(false);

    const connect = connection(new FakeImapSocket());
    await expect(
      verifyImapCredentials('worker@j-aautomation.com', 'secret', { enabled: false, connect }),
    ).resolves.toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['other@example.com', 'secret'],
    ['worker@j-aautomation.com\r\nJA01 OK', 'secret'],
    ['worker@j-aautomation.com', 'secret\nJA01 LOGIN'],
    ['worker@j-aautomation.com', 'secret\0tail'],
  ])('rejects non-corporate and injection input', async (email, password) => {
    const connect = connection(new FakeImapSocket());
    await expect(verifyImapCredentials(email, password, { enabled: true, connect })).resolves.toBe(
      false,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('normalizes only the exact corporate domain', () => {
    expect(normalizeCorporateEmail(' Antonny.Luty@j-aautomation.com ')).toBe(
      'antonny.luty@j-aautomation.com',
    );
    expect(normalizeCorporateEmail('antonny.luty@evil-j-aautomation.com')).toBeNull();
  });

  it('does not permit disabling certificate validation in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const connect = connection(new FakeImapSocket());
      await expect(
        verifyImapCredentials('worker@j-aautomation.com', 'secret', {
          enabled: true,
          rejectUnauthorized: false,
          connect,
        }),
      ).resolves.toBe(false);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
