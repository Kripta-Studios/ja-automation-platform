import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAuthOriginConfig } from '../../apps/portal/src/lib/server/auth-origins.js';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Better Auth origin configuration', () => {
  it('derives an explicit production allowlist and preserves the reverse-proxy origin', () => {
    const config = resolveAuthOriginConfig(
      {
        NODE_ENV: 'production',
        ORIGIN: 'https://portal.example.test/',
        JA_ALLOWED_ORIGINS: 'https://portal.example.test,https://public.example.test',
        JA_WEBAUTHN_ORIGIN: 'https://portal.example.test',
      },
      'production',
    );

    expect(config.baseURL).toBe('https://portal.example.test');
    expect(config.trustedOrigins).toEqual([
      'https://portal.example.test',
      'https://public.example.test',
    ]);
    expect(config.trustedOrigins).not.toContain('https://attacker.example.test');
  });

  it('allows a Docker image-build placeholder without accepting it as runtime production config', () => {
    const build = resolveAuthOriginConfig(
      { NODE_ENV: 'production', JA_RELEASE_BUILD: '1' },
      'production',
    );
    expect(build.trustedOrigins).toEqual(['https://ja-portal-build.invalid']);
    expect(() => resolveAuthOriginConfig({ NODE_ENV: 'production' }, 'production')).toThrow(
      /origin configuration/i,
    );
  });

  it('rejects missing or malformed production origin configuration', () => {
    expect(() => resolveAuthOriginConfig({}, 'production')).toThrow(/origin configuration/i);
    expect(() =>
      resolveAuthOriginConfig(
        {
          NODE_ENV: 'production',
          ORIGIN: 'https://portal.example.test',
          JA_ALLOWED_ORIGINS: 'https://portal.example.test,https://*.example.test',
        },
        'production',
      ),
    ).toThrow(/wildcard/i);
    expect(() =>
      resolveAuthOriginConfig(
        { NODE_ENV: 'production', ORIGIN: 'https://portal.example.test/auth' },
        'production',
      ),
    ).toThrow(/origin/i);
  });

  it('rejects loopback origins in production while allowing explicit local test origins', () => {
    for (const origin of ['http://localhost:5174', 'http://127.0.0.1:5174']) {
      expect(() =>
        resolveAuthOriginConfig({ NODE_ENV: 'production', ORIGIN: origin }, 'production'),
      ).toThrow(/loopback|localhost|127\.0\.0\.1/i);
    }

    const local = resolveAuthOriginConfig(
      {
        NODE_ENV: 'test',
        ORIGIN: 'http://127.0.0.1:5174',
        JA_WEBAUTHN_ORIGIN: 'http://localhost:5174',
      },
      'test',
    );
    expect(local.trustedOrigins).toEqual(['http://127.0.0.1:5174', 'http://localhost:5174']);
  });

  it('honors an explicit WebAuthn relying-party origin independently from the auth base URL', () => {
    const config = resolveAuthOriginConfig(
      {
        NODE_ENV: 'production',
        ORIGIN: 'https://auth.example.test',
        JA_WEBAUTHN_ORIGIN: 'https://portal.example.test',
      },
      'production',
    );
    expect(config.baseURL).toBe('https://auth.example.test');
    expect(config.webauthnOrigin).toBe('https://portal.example.test');
    expect(config.trustedOrigins).toEqual([
      'https://auth.example.test',
      'https://portal.example.test',
    ]);
  });

  it('marks the portal Docker build as an image-build so analyse can import the production server', () => {
    const dockerfile = source('deployment/Dockerfile.portal');
    expect(dockerfile).toMatch(/JA_RELEASE_BUILD=1/);
    expect(source('deployment/jaautomation.env.example')).not.toMatch(/JA_RELEASE_BUILD=/);
  });

  it('binds the Better Auth config to the validated policy instead of a static localhost list', () => {
    const authSource = source('apps/portal/src/lib/server/auth.ts');
    expect(authSource).toContain('resolveAuthOriginConfig');
    expect(authSource).toContain('trustedOrigins: authOriginConfig.trustedOrigins');
    expect(authSource).toContain("building ? 'build'");
    expect(authSource).not.toContain("'http://localhost:5174',");
  });
});
