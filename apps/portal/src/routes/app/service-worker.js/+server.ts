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
    "const STATIC_CACHE='ja-portal-static-v2';",
    "const IDENTITY_COOKIE='ja_offline_identity';",
    'let currentIdentity=null;',
    'const partition=(value)=>encodeURIComponent(value);',
    "const cacheName=(identity)=>'ja-portal-private-'+partition(identity.tenantId)+'-'+partition(identity.deploymentId)+'-'+partition(identity.userId);",
    'const identityMatches=(identity,userId)=>Boolean(identity&&(!userId||identity.userId===userId));',
    "function decodeBase64(value){try{return atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4))}catch{return null}}",
    "function parseToken(token){if(typeof token!=='string')return null;const parts=token.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;const raw=decodeBase64(parts[0]);if(!raw)return null;try{const value=JSON.parse(raw);if(typeof value.sub!=='string'||typeof value.tenantId!=='string'||typeof value.deploymentId!=='string'||typeof value.sid!=='string'||!Number.isSafeInteger(value.exp)||value.exp<=Date.now())return null;return{userId:value.sub,tenantId:value.tenantId,deploymentId:value.deploymentId,expiresAt:value.exp}}catch{return null}}",
    "async function requestIdentity(request){try{const cookie=await self.cookieStore?.get(IDENTITY_COOKIE);if(cookie?.value){const identity=parseToken(cookie.value);if(identity)return identity}}catch{}const header=request.headers.get('cookie')||'';const item=header.split(';').map((part)=>part.trim()).find((part)=>part.startsWith(IDENTITY_COOKIE+'='));if(!item)return null;try{return parseToken(decodeURIComponent(item.slice(IDENTITY_COOKIE.length+1)))}catch{return null}}",
    "async function refreshIdentity(){try{const response=await fetch(SCOPE+'api/offline/identity',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(!response.ok)return null;const body=await response.json();const identity=parseToken(body?.token);if(identity&&body?.userId===identity.userId&&body?.tenantId===identity.tenantId&&body?.deploymentId===identity.deploymentId){currentIdentity=identity;return identity}return null}catch{return null}}",
    "async function forgetIdentity(data){const requestedUserId=typeof data?.userId==='string'?data.userId:null;const tokenIdentity=parseToken(data?.token);const rememberedIdentity=currentIdentity;if(identityMatches(rememberedIdentity,requestedUserId))currentIdentity=null;const targets=[tokenIdentity,rememberedIdentity].filter((identity,index,array)=>identityMatches(identity,requestedUserId)&&array.findIndex((candidate)=>candidate?.tenantId===identity.tenantId&&candidate?.deploymentId===identity.deploymentId&&candidate?.userId===identity.userId)===index);await Promise.all(targets.map((identity)=>caches.delete(cacheName(identity))));try{const cookie=await self.cookieStore?.get(IDENTITY_COOKIE);const cookieIdentity=parseToken(cookie?.value);if(identityMatches(cookieIdentity,requestedUserId))await self.cookieStore.delete(IDENTITY_COOKIE)}catch{}}",
    'const isStatic=(url)=>/\\.(?:css|js|png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/i.test(url.pathname);',
    "const isPrivateRoute=(url,request)=>url.pathname.startsWith(SCOPE)&&!url.pathname.startsWith(SCOPE+'api/')&&!url.pathname.endsWith('/service-worker.js')&&!isStatic(url)&&request.method==='GET';",
    "async function privateFetch(request){const refreshed=await refreshIdentity();const cookieIdentity=await requestIdentity(request);try{const response=await fetch(request);if(response.ok){const identity=refreshed||cookieIdentity;if(identity){const copy=response.clone();void caches.open(cacheName(identity)).then((cache)=>cache.put(request,copy))}return response}return response}catch{const identity=cookieIdentity||(request.mode==='navigate'?null:currentIdentity);if(!identity)return Response.error();const cached=await caches.open(cacheName(identity)).then((cache)=>cache.match(request));return cached||Response.error()}}",
    "self.addEventListener('install',()=>self.skipWaiting());",
    "self.addEventListener('activate',(event)=>event.waitUntil((async()=>{await self.clients.claim();await caches.delete('ja-portal-static')} )()));",
    "self.addEventListener('message',(event)=>{const data=event.data;if(data?.type==='ja-offline-forget'){event.waitUntil(forgetIdentity(data).finally(()=>event.ports?.[0]?.postMessage({type:'ja-offline-forgotten'})));return}if(data?.type!=='ja-offline-identity')return;const identity=parseToken(data.token);if(identity&&identity.userId===data.userId)currentIdentity=identity});",
    "self.addEventListener('sync',(event)=>{if(event.tag==='ja-portal-sync')event.waitUntil(self.clients.matchAll().then((clients)=>clients.forEach((client)=>client.postMessage({type:'sync-request'}))))});",
    "self.addEventListener('fetch',(event)=>{const url=new URL(event.request.url);if(!url.pathname.startsWith(SCOPE)||event.request.method!=='GET')return;if(isStatic(url)){event.respondWith(fetch(event.request).then((response)=>{if(response.ok){const copy=response.clone();void caches.open(STATIC_CACHE).then((cache)=>cache.put(event.request,copy))}return response}).catch(()=>caches.open(STATIC_CACHE).then((cache)=>cache.match(event.request)).then((response)=>response||Response.error())));return}if(isPrivateRoute(url,event.request))event.respondWith(privateFetch(event.request))});",
  ].join('');
  return new Response(source, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'service-worker-allowed': scope,
      'cache-control': 'no-cache',
    },
  });
};
