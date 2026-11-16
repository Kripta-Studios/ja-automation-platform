import type { LayoutServerLoad } from './$types';
import { assistantCanonicalOwner } from '$lib/server/assistant-canonical-owner';
import { openPortalRepository } from '$lib/server/portal-repository';
import { projectVisibility, visibleProjectRecords } from '$lib/portal/project-visibility';
import { pendingApprovalSummary } from '$lib/portal/home-inbox';

/**
 * The navigation "Approve" badge: the same authorized approval queue the
 * Approvals screen reads, reduced to a count. Presentation only; failures
 * never block the page.
 */
function approvalPendingCount(locals: App.Locals): number {
  if (!locals.user || !locals.session || locals.user.workforceProfile) return 0;
  if (!['owner_admin', 'project_manager'].includes(String(locals.user.role))) return 0;
  try {
    const context = openPortalRepository(locals);
    try {
      const visible = projectVisibility(context.repository.listAssignedProjects(context.principal));
      return pendingApprovalSummary(
        visibleProjectRecords(
          context.repository.listApprovalQueue(context.principal),
          visible.projectIds,
        ),
      ).total;
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
});
