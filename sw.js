// Offline for a practice room.
//
// This is a tool you open in a basement with one bar of signal, so the shell —
// the page, the styles, the modules, the songbook — is precached on install and
// the app opens with no network at all. The samples are not: 3.4MB up front on
// somebody's mobile data to look at a chord chart is rude. They cache as they
// are first used, so one session with sound makes the whole thing offline.
//
// Bump CACHE when anything in SHELL changes; the old one is deleted on activate.
const CACHE = "woodshed-v1";
const SAMPLES = "woodshed-samples-v1";

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/band.js",
  "./js/theory.js",
  "./js/songs.js",
  "./js/i18n.js",
  "./js/mytunes.js",
  "./js/hqpack.js",
  "./js/solo-vocab.js",
  "./js/solo-metrics.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  // addAll is all-or-nothing, and one 404 would leave the app with no offline
  // at all; a missing file should cost that file, not the feature.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SAMPLES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Cache first: things that never change under a given URL. */
async function fromCache(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** Network first: correctness now, offline later. */
async function fromNetwork(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // A sample at a given path is the same bytes forever, and they are the
  // expensive ones. Same for the CDN modules, whose URLs carry their version.
  const isSample = url.origin === location.origin && url.pathname.includes("/samples/");
  const isPinnedVendor = url.hostname === "cdn.jsdelivr.net" || url.hostname.endsWith("gstatic.com");
  if (isSample) return e.respondWith(fromCache(request, SAMPLES));
  if (isPinnedVendor) return e.respondWith(fromCache(request, CACHE));

  // Everything else this site owns — the page, the styles, the modules — goes
  // to the network first. Serving a stale module from cache is how you spend an
  // afternoon debugging code that is no longer running.
  if (url.origin === location.origin) return e.respondWith(fromNetwork(request, CACHE));

  // fonts.googleapis.com serves a stylesheet that points at gstatic; it is
  // small and it changes, so treat it like our own.
  if (url.hostname.endsWith("googleapis.com")) return e.respondWith(fromNetwork(request, CACHE));
});
