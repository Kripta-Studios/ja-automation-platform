import { base } from '$app/paths';
export const GET = () => {
  const scope = `${base}/app/`;
  const source = `const CACHE='ja-portal-shell-v2';const SCOPE=${JSON.stringify(scope)};self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(!url.pathname.startsWith(SCOPE)||url.pathname.startsWith(SCOPE+'api/')||event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(response=>response||Response.error())))});`;
  return new Response(source, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': scope,
      'cache-control': 'no-cache',
    },
  });
};
