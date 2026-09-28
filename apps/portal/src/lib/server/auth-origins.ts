/**
 * Resolve the origins used by Better Auth from deployment configuration.
 *
 * Better Auth accepts wildcard patterns, which are intentionally not part of
 * this application's security contract.  This module turns every configured
 * value into an exact URL origin before it reaches the auth library and fails
 * closed when production has no usable origin configuration.
 */
export type AuthOriginEnvironment = Readonly<Record<string, string | undefined>>;

export type AuthOriginConfig = Readonly<{
  baseURL: string;
  webauthnOrigin: string;
  trustedOrigins: string[];
}>;

export class AuthOriginConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthOriginConfigurationError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '::1']);
const BUILD_PLACEHOLDER_ORIGIN = 'https://ja-portal-build.invalid';

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  return LOOPBACK_HOSTS.has(normalized) || /^127\./u.test(normalized);
}

function parseOrigin(rawValue: string, source: string, environment: string): string {
  const raw = rawValue.trim();
  if (!raw || /[\r\n]/u.test(raw))
    throw new AuthOriginConfigurationError(`${source} must contain a valid origin`);
  if (raw.includes('*'))
    throw new AuthOriginConfigurationError(`${source} must not contain wildcard origins`);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AuthOriginConfigurationError(`${source} must contain a valid origin`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new AuthOriginConfigurationError(`${source} must use http or https`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin === 'null'
  )
    throw new AuthOriginConfigurationError(
      `${source} must be an origin without path or credentials`,
    );

  if (environment === 'production') {
    if (isLoopback(parsed.hostname))
      throw new AuthOriginConfigurationError(
        `${source} must not use a loopback origin in production`,
      );
    if (parsed.protocol !== 'https:')
      throw new AuthOriginConfigurationError(`${source} must use HTTPS in production`);
  }
  return parsed.origin;
}

function configuredValues(
  value: string | undefined,
  source: string,
  list: boolean,
  environment: string,
): string[] {
  if (value === undefined) return [];
  const raw = value.trim();
  if (!raw) throw new AuthOriginConfigurationError(`${source} must not be empty`);
  const parts = list ? value.split(',') : [value];
  if (parts.some((part) => !part.trim()))
    throw new AuthOriginConfigurationError(`${source} contains an empty origin`);
  return parts.map((part) => parseOrigin(part, source, environment));
}

export function resolveAuthOriginConfig(
  environment: AuthOriginEnvironment = process.env,
  nodeEnvironment = environment.NODE_ENV ?? 'development',
): AuthOriginConfig {
  const configuredOrigin = configuredValues(environment.ORIGIN, 'ORIGIN', false, nodeEnvironment);
  const configuredAllowlist = configuredValues(
    environment.JA_ALLOWED_ORIGINS,
    'JA_ALLOWED_ORIGINS',
    true,
    nodeEnvironment,
  );
  const configuredWebAuthnOrigin = configuredValues(
    environment.JA_WEBAUTHN_ORIGIN,
    'JA_WEBAUTHN_ORIGIN',
    false,
    nodeEnvironment,
  );
  const originValues = [...configuredOrigin, ...configuredAllowlist, ...configuredWebAuthnOrigin];

  const trustedOrigins = [...new Set(originValues)];
  if (trustedOrigins.length === 0) {
    // SvelteKit's postbuild analyse imports the production server with
    // NODE_ENV=production before the runtime env file exists. The Docker
    // image build sets JA_RELEASE_BUILD=1 for that process only. A running
    // production container must still fail closed without real origins.
    if (nodeEnvironment === 'production' && environment.JA_RELEASE_BUILD === '1') {
      trustedOrigins.push(BUILD_PLACEHOLDER_ORIGIN);
    } else if (nodeEnvironment === 'production') {
      throw new AuthOriginConfigurationError(
        'Production auth origin configuration is missing or invalid',
      );
    } else {
      // Local development and deterministic test runs may use the documented
      // loopback default. It is never accepted by the production branch above.
      trustedOrigins.push('http://localhost:5174', 'http://127.0.0.1:5174');
    }
  }

  const baseURL = configuredOrigin[0] ?? configuredWebAuthnOrigin[0] ?? trustedOrigins[0]!;
  const webauthnOrigin = configuredWebAuthnOrigin[0] ?? configuredOrigin[0] ?? baseURL;

  return { baseURL, webauthnOrigin, trustedOrigins };
}
