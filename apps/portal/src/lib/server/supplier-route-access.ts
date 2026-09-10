/** Restricted workforce accounts use a positive operational route allowlist.
 * Object authorization remains mandatory in each allowed handler. */
export function supplierRouteAllowed(path: string): boolean {
  const route = path.replace(/\/__data\.json$/u, '').replace(/\/$/u, '') || '/';
  if (
    [
      '/',
      '/login',
      '/time',
      '/reports',
      '/profile',
      '/help',
      '/supplier',
      '/supplier/report',
      '/supplier/report.csv',
      '/mfa-enrollment',
      '/service-worker.js',
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
    ].includes(route)
  )
    return true;
  if (/^\/(time|reports)\/[^/]+$/u.test(route)) {
    // These named routes are management/customer-wide views, not own records.
    return !['/reports/review', '/reports/period', '/reports/export'].includes(route);
  }
  if (/^\/help\/[^/]+$/u.test(route)) return true;
  if (/^\/api\/auth(?:\/|$)/u.test(route)) return true;
  if (route === '/api/security/mfa') return true;
  // The localized artifact repository allows workers only their own daily/technical reports.
  if (/^\/api\/localized-pdf(?:\/|$)/u.test(route)) return true;
  if (/^\/api\/reports\/[^/]+\/attachments(?:\/|$)/u.test(route)) return true;
  return false;
}
