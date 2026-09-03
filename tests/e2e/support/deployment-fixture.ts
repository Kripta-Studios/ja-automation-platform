/**
 * The browser fixture is deliberately anchored to stable, non-production
 * deployment identifiers.  Playwright passes these values explicitly to the
 * preview server and the seed process; no caller shell identity is trusted.
 */
export const e2eTenantId = 'e2e-client-essential-tenant';
export const e2eDeploymentId = 'e2e-client-essential-deployment';

export const caddyBaseUrlEnvironmentKey = 'JA_E2E_CADDY_BASE_URL' as const;

/**
 * Resolve the externally deployed Caddy origin used by the final boundary
 * step. A preview/loopback origin is not substituted when the variable is
 * absent: step 32 must remain an explicit external prerequisite.
 */
export function readCaddyBaseUrl(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = environment[caddyBaseUrlEnvironmentKey]?.trim();
  if (!configured) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${caddyBaseUrlEnvironmentKey} must be an absolute HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/')
  )
    throw new Error(
      `${caddyBaseUrlEnvironmentKey} must be an HTTP(S) origin without credentials or a path`,
    );
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/u, '');
}

export function caddyBoundaryUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/')) throw new Error('Caddy boundary paths must begin with /');
  return new URL(path, `${baseUrl.replace(/\/+$/u, '')}/`).toString();
}
