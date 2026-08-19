declare global {
  namespace App {
    interface Locals {
      correlationId: string;
      session: { id: string; userId: string; expiresAt: Date } | null;
      user: {
        id: string;
        name: string;
        email: string;
        role?: string;
        status?: string;
        mfaEnrolled?: boolean;
        mfaRequired?: boolean;
      } | null;
    }
  }
}
export {};
