import { createDatabase } from '@ja/database';
import { error, json, redirect } from '@sveltejs/kit';
import { createDemoToken, demoEnabled } from '$lib/server/demo-session';
import type { RequestHandler } from './$types';

const cookieName = 'ja_demo_session';

export const POST: RequestHandler = async ({ request, cookies }) => {
  if (!demoEnabled) error(404, 'Demo access is disabled');
  const jsonRequest = request.headers.get('content-type')?.includes('application/json');
  const role = jsonRequest
    ? ((await request.json().catch(() => ({}))) as { role?: string }).role
    : String((await request.formData()).get('role') ?? 'admin');
  const accounts: Record<string, string> = {
    admin: 'owner@demo.jaautomation.local',
    finance: 'finance@demo.jaautomation.local',
    manager: 'pm@demo.jaautomation.local',
    worker: 'worker@demo.jaautomation.local',
  };
  const email = accounts[role ?? 'admin'] ?? 'owner@demo.jaautomation.local';
  const { sqlite } = createDatabase();
  try {
    const user = sqlite
      .prepare("SELECT id FROM user WHERE email=? AND status='active'")
      .get(email) as { id: string } | undefined;
    if (!user) error(409, 'Run pnpm demo:seed before opening the demo');
    cookies.set(cookieName, createDemoToken(user.id), {
      path: '/j-aautomation/app',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8,
    });
    if (!jsonRequest) redirect(303, '/j-aautomation/app');
    return json({ ok: true });
  } finally {
    sqlite.close();
  }
};

export const DELETE: RequestHandler = ({ cookies }) => {
  cookies.delete(cookieName, { path: '/j-aautomation/app' });
  return json({ ok: true });
};
