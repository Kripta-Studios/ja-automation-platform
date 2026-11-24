/**
 * T18: a JSON-only helper endpoint opened by a person in the browser (typed
 * URL, bookmark, reload) should land on its page, not show raw JSON. A real
 * document navigation asks for HTML; the page's own fetch() calls do not.
 */
export function isDocumentNavigation(request: Request): boolean {
  const mode = request.headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return (request.headers.get('accept') ?? '').includes('text/html');
}
