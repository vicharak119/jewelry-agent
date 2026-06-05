var CACHE="jw-v5";
self.addEventListener("install",function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(["/","/manifest.json"]);}));});
self.addEventListener("fetch",function(e){if(e.request.url.indexOf("/api/")>-1)return;e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request);}));});
