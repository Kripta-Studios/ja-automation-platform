/**
 * A form posted without JavaScript enhancement (or before hydration) leaves the browser on the
 * action URL, for example `/supplier?/submitTime&projectId=…`. Later client code that rewrites
 * the query string then turns it into `?%2FsubmitTime=&projectId=…`. Either way the internal
 * action name stays visible, and a reload or a shared link carries it.
 *
 * SvelteKit action keys are the query keys that start with "/". Returns the same URL without
 * them, or `null` when there is nothing to clean.
 */
export function urlWithoutFormAction(url: URL): URL | null {
  const keys = [...new Set([...url.searchParams.keys()].filter((key) => key.startsWith('/')))];
  if (!keys.length) return null;
  const clean = new URL(url);
  for (const key of keys) clean.searchParams.delete(key);
  return clean;
}
