const publicBasePath = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';

/** The production proxy serves the private portal under the same public base path. */
export const portalLoginUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? `${publicBasePath}/app/login`;
