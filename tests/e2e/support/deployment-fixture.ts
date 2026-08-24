/**
 * The browser fixture is deliberately anchored to stable, non-production
 * deployment identifiers.  Playwright passes these values explicitly to the
 * preview server and the seed process; no caller shell identity is trusted.
 */
export const e2eTenantId = 'e2e-client-essential-tenant';
export const e2eDeploymentId = 'e2e-client-essential-deployment';
