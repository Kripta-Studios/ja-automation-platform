import type { LayoutServerLoad } from './$types';
import { assistantCanonicalOwner } from '$lib/server/assistant-canonical-owner';
import { openPortalRepository } from '$lib/server/portal-repository';
import { readPendingApprovals } from '$lib/server/approval-queue';

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

/** Unread inbox count for the bell badge. Presentation only; failures never block the page. */
function unreadNotificationCount(locals: App.Locals): number {
  if (!locals.user || !locals.session) return 0;
  try {
    const context = openPortalRepository(locals);
    try {
      return context.repository.countUnreadNotifications(context.principal);
    } finally {
      context.sqlite.close();
    }
  } catch {
    return 0;
  }
}

/**
 * Whether this worker is an active crew chief today (an active, unexpired
 * delegation on a live project). Crew hours appear in the navigation, Home
 * and search only then; the /crew route keeps its own server check.
 */
function activeCrewChief(locals: App.Locals): boolean {
  if (!locals.user || !locals.session || locals.user.workforceProfile) return false;
  if (locals.user.role !== 'worker') return false;
  try {
    const context = openPortalRepository(locals);
    try {
      const today = new Date().toISOString().slice(0, 10);
      return Boolean(
        context.sqlite
          .prepare(
            `SELECT 1 FROM crew_leader_grant g JOIN project p ON p.id=g.project_id
              WHERE g.chief_user_id=? AND g.status='active' AND g.starts_on<=?
                AND (g.ends_on IS NULL OR g.ends_on>=?)
                AND p.status IN ('active','paused','closing') LIMIT 1`,
          )
          .get(context.principal.userId, today, today),
      );
    } finally {
      context.sqlite.close();
    }
  } catch {
    return false;
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
  unreadNotificationCount: unreadNotificationCount(locals),
  crewChief: activeCrewChief(locals),
});
