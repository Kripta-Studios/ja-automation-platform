import { base } from '$app/paths';
export const GET = () => {
  const scope = `${base}/app/`;
  const source = `const CACHE='ja-portal-shell-v4';const SCOPE=${JSON.stringify(scope)};const SAFE_ROUTES=new Set([SCOPE,SCOPE+'time',SCOPE+'reports',SCOPE+'expenses']);self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('sync',event=>{if(event.tag==='ja-portal-sync')event.waitUntil(self.clients.matchAll().then(clients=>clients.forEach(client=>client.postMessage({type:'sync-request'}))))});self.addEventListener('fetch',event=>{const url=new URL(event.request.url);const isStatic=/\\.(?:css|js|png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/i.test(url.pathname);const cacheable=isStatic||SAFE_ROUTES.has(url.pathname);if(!url.pathname.startsWith(SCOPE)||url.pathname.startsWith(SCOPE+'api/')||event.request.method!=='GET'||!cacheable)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(response=>response||Response.error())))});`;
  return new Response(source, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': scope,
      'cache-control': 'no-cache',
    },
  });
};
