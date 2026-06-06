var CACHE="jw-v8c";
self.addEventListener("install",function(e){self.skipWaiting();e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(["/","/manifest.json"]);}));});
self.addEventListener("activate",function(e){e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));})]));});
self.addEventListener("fetch",function(e){
  var req=e.request;
  if(req.url.indexOf("/api/")>-1)return;
  var acc=req.headers.get("accept")||"";
  // Network-first for page navigations so new deploys appear immediately; cache only as offline fallback.
  if(req.mode==="navigate"||(req.method==="GET"&&acc.indexOf("text/html")>-1)){
    e.respondWith(fetch(req).then(function(r){var rc=r.clone();caches.open(CACHE).then(function(c){c.put(req,rc);});return r;}).catch(function(){return caches.match(req).then(function(r){return r||caches.match("/");});}));
    return;
  }
  // Cache-first for other static assets.
  e.respondWith(caches.match(req).then(function(r){return r||fetch(req);}));
});
