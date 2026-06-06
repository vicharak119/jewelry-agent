var CACHE="jw-v6";
self.addEventListener("install",function(e){self.skipWaiting();e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(["/","/manifest.json"]);}));});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}));});
self.addEventListener("fetch",function(e){if(e.request.url.indexOf("/api/")>-1)return;e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request);}));});
