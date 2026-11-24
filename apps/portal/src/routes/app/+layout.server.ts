import type { LayoutServerLoad } from './$types';
import { assistantCanonicalOwner } from '$lib/server/assistant-canonical-owner';
import { openPortalRepository } from '$lib/server/portal-repository';
import { readPendingApprovals } from '$lib/server/approval-queue';
import { createDatabase } from '@ja/database';
import { personDisplayName } from '$lib/portal/display-name';

/**
 * T18: the real person to ask when a page is not available ("Contact an
 * owner" becomes a mail link). The company owner's business contact only;
 * cached briefly so the layout does not open the database on every request.
 */
let ownerContactCache: { at: number; value: { name: string; email: string } | null } | null = null;
function ownerContact(locals: App.Locals): { name: string; email: string } | null {
  if (!locals.user || !locals.session) return null;
  if (ownerContactCache && Date.now() - ownerContactCache.at < 600_000) return ownerContactCache.value;
  let value: { name: string; email: string } | null = null;
  try {
    const { sqlite } = createDatabase();
    try {
      const owner = sqlite
        .prepare(
          "SELECT name,email FROM user WHERE role='owner_admin' AND status='active' AND email NOT LIKE '%.invalid' ORDER BY created_at LIMIT 1",
        )
        .get() as { name: string | null; email: string | null } | undefined;
      if (owner?.email) value = { name: personDisplayName(owner.name, owner.email), email: owner.email };
    } finally {
      sqlite.close();
    }
  } catch {
    value = null;
  }
  ownerContactCache = { at: Date.now(), value };
  return value;
}

/**
 * The navigation "Approve" badge: the same pending count Home and the
 * Approvals screen show (one server function, `readPendingApprovals`). Presentation only; failures
 * never block the page.
 */
function approvalPendingCount(locals: App.Locals): number {
  if (!locals.user || !locals.session || locals.user.workforceProfile) return 0;
  if (!['owner_admin', 'project_manager'].includes(String(locals.user.role))) return 0;
  try {
    const context = openPortalRepository(locals);
    try {
      // Only what this viewer can act on: never a PM's own records or
      // owner-only supplier-workforce time (P1).
      return readPendingApprovals(context).reviewable.total;
    } finally {
      context.sqlite.close();
    }
  } catch {
    return 0;
  }
}

// Identity only. Every child loader retains its own object authorization and safe DTO.
export const load: LayoutServerLoad = ({ locals }) => ({
  offlineEnabled:
    process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() !== 'false' &&
    !locals.user?.workforceProfile,
  chromeUser:
    locals.user && locals.session
      ? {
          id: locals.user.id,
          name: locals.user.name,
          role: locals.user.role,
          workforceProfile: locals.user.workforceProfile,
          canonicalOwner: assistantCanonicalOwner(locals.user),
        }
      : null,
  approvalPendingCount: approvalPendingCount(locals),
  ownerContact: ownerContact(locals),
});
