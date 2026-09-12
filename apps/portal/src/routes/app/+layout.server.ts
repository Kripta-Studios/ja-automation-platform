import type { LayoutServerLoad } from './$types';

// Identity only. Every child loader retains its own object authorization and safe DTO.
export const load: LayoutServerLoad = ({ locals }) => ({
  chromeUser:
    locals.user && locals.session
      ? {
          name: locals.user.name,
          role: locals.user.role,
          workforceProfile: locals.user.workforceProfile,
        }
      : null,
});
