/**
 * Give each E2E project creation a stable numeric suffix. The fixture database is shared by
 * all viewport projects in one Playwright run, while project numbers are unique per client.
 */
export function e2eCostCenter(
  prefix: string,
  scenario: number,
  viewport: string,
  instance = 0,
): string {
  const viewportNumber: Record<string, number> = {
    'phone-360': 1,
    'phone-390': 2,
    'phone-430': 3,
    'tablet-768': 4,
    'tablet-1024': 5,
    'laptop-1280': 6,
    desktop: 7,
    'wide-1920': 8,
  };
  const viewportCode = viewportNumber[viewport];
  if (!viewportCode || !Number.isInteger(scenario) || scenario < 1 || scenario > 99)
    throw new Error('Unknown E2E cost-center scenario or viewport');
  if (!Number.isInteger(instance) || instance < 0 || instance > 99)
    throw new Error('Invalid E2E cost-center instance');
  return `${prefix}-8${String(scenario).padStart(2, '0')}${viewportCode}${String(instance).padStart(2, '0')}`;
}
