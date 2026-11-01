// BEAM Travel History PWA — PRIVATE BY DEFAULT.
// Cache only the audited, versioned public shell. No runtime cache writes.
// Never cache Supabase, signed links, personal trips, photos or API responses.
const CACHE_NAME = "beam-travel-shell-v1-20261101-family-a5-portrait-ten-photos-1500px-no-crop-v7";
const SCOPE_PATH = "/travel/";
const PUBLIC_SHELL = [
  "./index.html", "./config.js", "./offline-bootstrap.js", "./pwa.js",
  "./photo-utils.js", "./photo-upload.js", "./trip-detail.js",
  "./countries.js", "./country-picker.js", "./factual-pdf.js", "./factual-pdf-file.js",
  "./journal-stats.js", "./dashboard-filters.js", "./dashboard-filters.css", "./printable-journal.js", "./family-booklet.js",
  "./visual-cards.js", "./visual-cards.css",
  "./assets/world-map.svg", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  // Keep the 30 audited popular SVGs in the offline PUBLIC shell. Other ISO
  // SVGs load from the same origin online; no private data or runtime caching.
  ...["ae","be","bh","ca","cd","cg","ci","cn","de","dz","es","fr","gb","gf","gh","gn","gp","it","ma","ml","mq","mt","pt","re","sa","sg","sl","sn","tr","us"].map(code => "./assets/flags/" + code + ".svg")
];
const SAFE_PATHS = new Set(PUBLIC_SHELL.map(path => new URL(path, self.registration.scope).pathname));

function isPublicShell(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    url.search === "" && url.hash === "" &&
    url.pathname.startsWith(SCOPE_PATH) &&
    SAFE_PATHS.has(url.pathname);
}

async function deleteTravelCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith("beam-travel-shell-"))
    .map(name => caches.delete(name)));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PUBLIC_SHELL.map(path => new URL(path, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("beam-travel-shell-") &&
      name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type !== "BEAM_CLEAR_PUBLIC_SHELL") return;
  event.waitUntil((async () => {
    try {
      await deleteTravelCaches();
      event.ports?.[0]?.postMessage({type:"BEAM_SHELL_CLEARED"});
    } catch {
      event.ports?.[0]?.postMessage({type:"BEAM_SHELL_CLEAR_FAILED"});
    }
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  // Absolutely no fetch interception for Supabase URLs, cross-origin CDN,
  // private photos, signed URL query strings, POST, or unknown files.
  const url = new URL(request.url);
  const isBareHome = request.method === "GET" &&
    url.origin === self.location.origin && url.pathname === SCOPE_PATH &&
    url.search === "" && url.hash === "";
  if (!isPublicShell(request) && !isBareHome) return;

  event.respondWith((async () => {
    if (request.mode === "navigate") {
      try {
        // Network-first for navigation. Do NOT cache the network response.
        // Revalidate with the server (ETag/304 when supported) so an online
        // security update wins without always re-downloading unchanged files.
        return await fetch(request, {cache:"no-cache"});
      } catch {
        // Serve a fresh PUBLIC offline-only page, never a previously rendered
        // app document. Works even after logout purges the shell caches.
        return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#174d3a"><title>BEAM · Hors ligne</title>
<style>body{margin:0;background:#f7f5ef;color:#17231f;font:17px system-ui,sans-serif}
main{max-width:520px;margin:12vh auto;padding:28px}h1{font:normal 40px Georgia,serif;line-height:1.1}
small{color:#174d3a;font-weight:700;letter-spacing:.12em}</style></head>
<body><main><small>BEAM · TRAVEL HISTORY</small>
<h1>Connexion nécessaire pour consulter votre carnet</h1>
<p>Vos voyages et photos sont privés et indisponibles hors ligne. Reconnectez-vous à Internet pour continuer.</p>
<button onclick="location.reload()">Réessayer</button></main></body></html>`, {
          status:503,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}
        });
      }
    }
    // All public assets are NETWORK-FIRST with HTTP revalidation, even when an older shell is cached.
    // Never add runtime responses to the cache: the only cached data is the
    // vetted public install-time shell, and private requests bypass this SW.
    try {
      return await fetch(request, {cache:"no-cache"});
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const fallback = await cache.match(request, {ignoreSearch:false});
      if (fallback) return fallback;
      return new Response("Ressource indisponible sans connexion.", {
        status:503,
        headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}
      });
    }
  })());
});
