/** Stroke icons for navigation labels (sidebar, phone bar, account menu). */
export const navIconPaths: Readonly<Record<string, string>> = {
  Today: 'M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.25Z',
  Dashboard: 'M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.25Z',
  Time: 'M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  Reports: 'M5 3.5h14v17H5zM8 8h8M8 12h8M8 16h5',
  Expenses: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  Projects: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  Clients:
    'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20M12.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a2.5 2.5 0 1 1 0 5',
  Team: 'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20M12.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a2.5 2.5 0 1 1 0 5',
  Planning: 'M5 4h14v16H5zM8 2v4M16 2v4M5 9h14M9 13h2M13 13h2M9 17h2',
  'PLC / Technical': 'M3 13h4l2-7 4 12 2-6h6',
  Home: 'M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.25Z',
  Approvals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 2.5 2.5L16.5 8',
  Approve: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 2.5 2.5L16.5 8',
  Billing: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h4',
  Invoices: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h4',
  Finance: 'M4 18 9 12l4 3 7-9M15 6h5v5',
  Documents: 'M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6',
  Notifications: 'M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4L6 17ZM10 20h4M9.5 7.5a3 3 0 0 1 5 0',
  Profile: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  Settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 4a6.5 6.5 0 0 0-.15-1.4l1.45-1.12-2-3.46-1.72.68a7 7 0 0 0-2.4-1.4L15.45 3h-4l-.26 2.3a7 7 0 0 0-2.4 1.4l-1.72-.68-2 3.46 1.45 1.12a6.5 6.5 0 0 0 0 2.8l-1.45 1.12 2 3.46 1.72-.68a7 7 0 0 0 2.4 1.4l.26 2.3h4l.26-2.3a7 7 0 0 0 2.4-1.4l1.72.68 2-3.46-1.45-1.12c.1-.45.15-.92.15-1.4Z',
  Audit: 'M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Zm-3 9 2 2 4-4',
  'My Pay': 'M4 7h16v10H4zM4 10h16M8 14h2',
  'Finance Overview': 'M4 18 9 12l4 3 7-9M15 6h5v5',
  'Economic Review': 'M4 18 9 12l4 3 7-9M15 6h5v5',
  'Collections / Ledger': 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h4',
  Accounting: 'M5 3.5h14v17H5zM8 8h8M8 12h8M8 16h5',
  'Commercial Configuration':
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 4a6.5 6.5 0 0 0-.15-1.4l1.45-1.12-2-3.46-1.72.68a7 7 0 0 0-2.4-1.4L15.45 3h-4l-.26 2.3a7 7 0 0 0-2.4 1.4l-1.72-.68-2 3.46 1.45 1.12a6.5 6.5 0 0 0 0 2.8l-1.45 1.12 2 3.46 1.72.68a7 7 0 0 0 2.4 1.4l.26 2.3h4l.26-2.3a7 7 0 0 0 2.4-1.4l1.72.68 2-3.46-1.45-1.12c.1-.45.15-.92.15-1.4Z',
  'Data management':
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  Suppliers:
    'M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  // People, not a clock: the crew entry sits next to Time on the phone bar.
  'Crew hours':
    'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20M12.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a2.5 2.5 0 1 1 0 5',
};

const extra: Readonly<Record<string, string>> = {
  'My team': navIconPaths.Team ?? '',
  'Cash calendar': navIconPaths.Planning ?? '',
  'Subcontractor settlement': navIconPaths.Billing ?? '',
  'Currency conversions': 'M4 8h13l-3-3M20 16H7l3 3',
  Payments: navIconPaths['Collections / Ledger'] ?? '',
  Money: navIconPaths.Finance ?? '',
  Rates: navIconPaths.Settings ?? '',
  'Detailed analysis': navIconPaths.Finance ?? '',
  'Operational report': navIconPaths.Reports ?? '',
};

/** The icon path for a navigation label, with a neutral arrow as fallback. */
export function navIconPath(label: string): string {
  return navIconPaths[label] ?? extra[label] ?? 'M5 12h14M12 5l7 7-7 7';
}
