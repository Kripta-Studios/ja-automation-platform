declare global {
  namespace App {
    interface Locals {
      session: { id: string; userId: string; expiresAt: Date } | null;
      user: {
        id: string;
        name: string;
        email: string;
        role?: string;
        status?: string;
        mfaEnrolled?: boolean;
      } | null;
    }
  }
}
export {};
