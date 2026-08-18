import { base } from '$app/paths';
export const GET = () => {
  const scope = `${base}/app/`;
  const source = `const CACHE='ja-portal-shell-v1';const SCOPE=${JSON.stringify(scope)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([SCOPE,SCOPE+'manifest.webmanifest']))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(!u.pathname.startsWith(SCOPE)||u.pathname.startsWith(SCOPE+'api/')||e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match(SCOPE))))});`;
  return new Response(source, {
    headers: {
      'content-type': 'text/javascript',
      'service-worker-allowed': scope,
      'cache-control': 'no-cache',
    },
  });
};
