import { base } from '$app/paths';
export const GET = () => {
  const scope = `${base}/app/`;
  const offlineDisabled = process.env.JA_OFFLINE_ENABLED?.trim().toLowerCase() === 'false';
  if (offlineDisabled) {
    const source = [
      'const OFFLINE_ENABLED=false;',
      "self.addEventListener('install',()=>self.skipWaiting());",
      "self.addEventListener('activate',(event)=>event.waitUntil((async()=>{await self.clients.claim();const keys=await caches.keys();await Promise.all(keys.filter((key)=>key.startsWith('ja-portal-private-')).map((key)=>caches.delete(key)));})()));",
    ].join('');
    return new Response(source, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'service-worker-allowed': scope,
        'cache-control': 'no-cache',
      },
    });
  }
  const source = [
    'const OFFLINE_ENABLED=true;',
    `const SCOPE=${JSON.stringify(scope)};`,
    `const IMMUTABLE_SCOPE=${JSON.stringify(`${base}/_app/immutable/`)};`,
    "const STATIC_CACHE='ja-portal-static-v2';",
    "const IDENTITY_COOKIE='ja_offline_identity';",
    'let currentIdentity=null;',
    'const privateStates=new Map();',
    'const partition=(value)=>encodeURIComponent(value);',
    "const legacyCacheName=(identity)=>'ja-portal-private-'+partition(identity.tenantId)+'-'+partition(identity.deploymentId)+'-'+partition(identity.userId);",
    "const cacheName=(identity)=>'ja-portal-private-v3-'+partition(identity.tenantId)+'-'+partition(identity.deploymentId)+'-'+partition(identity.userId);",
    'function privateState(identity){const key=cacheName(identity);if(!privateStates.has(key))privateStates.set(key,{generation:0,blocked:false,tail:Promise.resolve()});return privateStates.get(key)}',
    'function privateMutation(state,work){const next=state.tail.then(work);state.tail=next.catch(()=>{});return next}',
    'function invalidatePrivateReads(identity){const state=privateState(identity);const generation=++state.generation;state.blocked=true;return privateMutation(state,async()=>{await Promise.all([cacheName(identity),legacyCacheName(identity)].map((name)=>caches.delete(name)));if(state.generation===generation)state.blocked=false})}',
    'const identityMatches=(identity,userId)=>Boolean(identity&&(!userId||identity.userId===userId));',
    "function decodeBase64(value){try{return atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4))}catch{return null}}",
    "function parseToken(token){if(typeof token!=='string')return null;const parts=token.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;const raw=decodeBase64(parts[0]);if(!raw)return null;try{const value=JSON.parse(raw);if(typeof value.sub!=='string'||typeof value.tenantId!=='string'||typeof value.deploymentId!=='string'||typeof value.sid!=='string'||!Number.isSafeInteger(value.exp)||value.exp<=Date.now())return null;return{userId:value.sub,tenantId:value.tenantId,deploymentId:value.deploymentId,expiresAt:value.exp}}catch{return null}}",
    "async function requestIdentity(request){try{const cookie=await self.cookieStore?.get(IDENTITY_COOKIE);if(cookie?.value){const identity=parseToken(cookie.value);if(identity)return identity}}catch{}const header=request.headers.get('cookie')||'';const item=header.split(';').map((part)=>part.trim()).find((part)=>part.startsWith(IDENTITY_COOKIE+'='));if(!item)return null;try{return parseToken(decodeURIComponent(item.slice(IDENTITY_COOKIE.length+1)))}catch{return null}}",
    "async function refreshIdentity(){try{const response=await fetch(SCOPE+'api/offline/identity',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(!response.ok)return null;const body=await response.json();const identity=parseToken(body?.token);if(identity&&body?.userId===identity.userId&&body?.tenantId===identity.tenantId&&body?.deploymentId===identity.deploymentId){currentIdentity=identity;return identity}return null}catch{return null}}",
    "async function forgetIdentity(data){const requestedUserId=typeof data?.userId==='string'?data.userId:null;const tokenIdentity=parseToken(data?.token);const rememberedIdentity=currentIdentity;if(identityMatches(rememberedIdentity,requestedUserId))currentIdentity=null;const targets=[tokenIdentity,rememberedIdentity].filter((identity,index,array)=>identityMatches(identity,requestedUserId)&&array.findIndex((candidate)=>candidate?.tenantId===identity.tenantId&&candidate?.deploymentId===identity.deploymentId&&candidate?.userId===identity.userId)===index);await Promise.all(targets.map(invalidatePrivateReads));try{const cookie=await self.cookieStore?.get(IDENTITY_COOKIE);const cookieIdentity=parseToken(cookie?.value);if(identityMatches(cookieIdentity,requestedUserId))await self.cookieStore.delete(IDENTITY_COOKIE)}catch{}}",
    "const isStatic=(url)=>isImmutable(url)||['logo.png','icon-192.png','icon-512.png','manifest.webmanifest','fonts/geist-latin.woff2','fonts/geist-mono-latin.woff2'].some((path)=>url.pathname===SCOPE+path);",
    'const isImmutable=(url)=>url.pathname.startsWith(IMMUTABLE_SCOPE)&&/\\.(?:css|js|woff2?)$/i.test(url.pathname);',
    "const isPrivateRoute=(url,request)=>url.pathname.startsWith(SCOPE)&&!url.pathname.startsWith(SCOPE+'api/')&&!url.pathname.endsWith('/service-worker.js')&&!isStatic(url)&&request.method==='GET';",
    "async function accessUnavailable(request){let locale=new URL(request.url).searchParams.get('lang');const valid=(value)=>typeof value==='string'&&/^(en|es|pt)(?:-[A-Za-z]{2})?$/.test(value)?value.slice(0,2):null;locale=valid(locale);if(!locale){for(const name of ['ja.portal.locale','ja-portal-locale']){try{locale=valid((await self.cookieStore?.get(name))?.value)}catch{}if(locale)break}}locale=locale||'en';const copy={en:['Connect to check access to this page','Go online to check your current access before opening this page.','Return to app'],es:['Conéctate para comprobar el acceso a esta página','Conéctate a Internet para comprobar tu acceso actual antes de abrir esta página.','Volver a la aplicación'],pt:['Conecte-se para verificar o acesso a esta página','Conecte-se à Internet para verificar seu acesso atual antes de abrir esta página.','Voltar ao aplicativo']}[locale];const headers={'cache-control':'no-store','content-type':request.mode==='navigate'?'text/html; charset=utf-8':'text/plain; charset=utf-8'};if(request.mode!=='navigate')return new Response(copy[0],{status:503,headers});headers['content-security-policy']=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\";return new Response('<!doctype html><html lang=\"'+locale+'\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>'+copy[0]+'</title><style>body{font:1rem system-ui;margin:2rem auto;padding:1rem;max-width:36rem;line-height:1.5}a{display:inline-block;padding:.75rem 0}</style><main role=\"alert\"><h1>'+copy[0]+'</h1><p>'+copy[1]+'</p><a href=\"'+SCOPE+'\">'+copy[2]+'</a></main></html>',{status:503,headers})}",
    "async function privateFetch(request){const refreshed=await refreshIdentity();const cookieIdentity=await requestIdentity(request);const identity=refreshed||cookieIdentity;const state=identity?privateState(identity):null;const generation=state?.generation;try{const response=await fetch(request);if([401,403,404].includes(response.status)&&identity){try{await invalidatePrivateReads(identity)}catch{}return response}if(response.ok&&identity){const copy=response.clone();await privateMutation(state,async()=>{if(state.blocked||state.generation!==generation)return;const cache=await caches.open(cacheName(identity));if(state.blocked||state.generation!==generation)return;await cache.put(request,copy)}).catch(()=>{});}return response}catch{const fallbackIdentity=cookieIdentity||(request.mode==='navigate'?null:currentIdentity);if(!fallbackIdentity)return Response.error();const fallbackState=privateState(fallbackIdentity);const fallbackGeneration=fallbackState.generation;if(fallbackState.blocked)return accessUnavailable(request);try{const cached=await caches.open(cacheName(fallbackIdentity)).then((cache)=>cache.match(request));if(fallbackState.blocked||fallbackState.generation!==fallbackGeneration)return accessUnavailable(request);return cached||(fallbackState.generation>0?accessUnavailable(request):Response.error())}catch{return fallbackState.generation>0?accessUnavailable(request):Response.error()}}}",
    "self.addEventListener('install',()=>self.skipWaiting());",
    "self.addEventListener('activate',(event)=>event.waitUntil((async()=>{const identity=await requestIdentity(new Request(new URL(SCOPE,self.location.origin)));if(identity){try{await invalidatePrivateReads(identity)}catch{}}try{await caches.delete('ja-portal-static')}catch{}await self.clients.claim()} )()));",
    "self.addEventListener('message',(event)=>{const data=event.data;if(data?.type==='ja-offline-purge-private-reads'){event.waitUntil((async()=>{try{const identity=parseToken(data.token);const live=await refreshIdentity();if(!identity||!live||cacheName(identity)!==cacheName(live))throw Error('Identity unavailable');await invalidatePrivateReads(identity);event.ports?.[0]?.postMessage({type:'ja-offline-private-reads-purged',success:true})}catch{event.ports?.[0]?.postMessage({type:'ja-offline-private-reads-purged',success:false})}})());return}if(data?.type==='ja-offline-forget'){event.waitUntil(forgetIdentity(data).finally(()=>event.ports?.[0]?.postMessage({type:'ja-offline-forgotten'})));return}if(data?.type!=='ja-offline-identity')return;const identity=parseToken(data.token);if(identity&&identity.userId===data.userId)currentIdentity=identity});",
    "self.addEventListener('sync',(event)=>{if(event.tag==='ja-portal-sync')event.waitUntil(self.clients.matchAll().then((clients)=>clients.forEach((client)=>client.postMessage({type:'sync-request'}))))});",
    "self.addEventListener('fetch',(event)=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith(SCOPE+'api/')||(!url.pathname.startsWith(SCOPE)&&!isImmutable(url)))return;if(isStatic(url)){const work=fetch(event.request).then(async(response)=>{if(response.ok){const copy=response.clone();await caches.open(STATIC_CACHE).then((cache)=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(()=>caches.open(STATIC_CACHE).then((cache)=>cache.match(event.request)).then((response)=>response||Response.error()));event.respondWith(work);event.waitUntil(work.then(()=>{},()=>{}));return}if(isPrivateRoute(url,event.request))event.respondWith(privateFetch(event.request))});",
  ].join('');
  return new Response(source, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': scope,
      'cache-control': 'no-cache',
    },
  });
};
