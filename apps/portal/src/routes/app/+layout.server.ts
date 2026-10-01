import type { LayoutServerLoad } from './$types';

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
        }
      : null,
});
