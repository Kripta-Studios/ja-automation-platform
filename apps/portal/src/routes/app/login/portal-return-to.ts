/** Resume a workspace URL after either sign-in step. */
export function portalReturnTo(login: URL, base: string): string | null {
  const value = login.searchParams.get('returnTo');
  const prefix = `${base}/app/`;
  if (!value?.startsWith(prefix) || /[\\\s]|\/\//u.test(value)) return null;
  const target = new URL(value, login);
  if (target.origin !== login.origin || !target.pathname.startsWith(prefix)) return null;
  const section = target.pathname.slice(prefix.length).split('/')[0];
  if (section === 'login' || section === 'invite' || section === 'api') return null;
  return target.pathname + target.search + target.hash;
}
