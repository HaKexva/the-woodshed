// hqpack.js — optional high-quality sample pack loader.
// Manifest-driven, cache-first (Cache API → instant repeat visits), returns
// players with the same start() shape smplr uses so the band can hot-swap.

const CACHE_NAME = "woodshed-hq-v1";

async function cachedFetch(url) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit;
  } catch {
    /* Cache API unavailable (file://, private mode) — plain fetch */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch { /* quota — fine */ }
  }
  return res;
}

let manifestPromise = null;

export function getManifest() {
  manifestPromise ??= cachedFetch("samples/hq/manifest.json").then((r) => r.json());
  return manifestPromise;
}

/**
 * Load every instrument in the manifest at once. destinations maps
 * instrument name → AudioNode. onProgress(done, total) counts files
 * across the whole pack.
 */
export async function loadHqPack(ctx, destinations, onProgress) {
  const manifest = await getManifest();
  const names = Object.keys(manifest.instruments);
  const total = names.reduce((n, k) => {
    const s = manifest.instruments[k];
    return n + (s.type === "kit" ? Object.values(s.voices).flat().length : s.samples.length);
  }, 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);
  const out = {};
  await Promise.all(
    names.map(async (k) => {
      out[k] = await loadHqInstrument(ctx, k, { destination: destinations[k], onProgress: tick });
    })
  );
  return out;
}

async function decodeAll(ctx, base, entries, onProgress) {
  let done = 0;
  return Promise.all(
    entries.map(async (s) => {
      const res = await cachedFetch(base + s.file);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      onProgress?.(++done, entries.length);
      return { ...s, buffer };
    })
  );
}

/**
 * Load one HQ instrument. Keyed instruments return a player { start({note,
 * time, duration, velocity}), stop() }; the drum kit returns { pick(drum,
 * velocity) → AudioBuffer } (band keeps its own one-shot playback path).
 * Returns null when the manifest has no such instrument.
 */
export async function loadHqInstrument(ctx, name, { destination, onProgress } = {}) {
  const manifest = await getManifest();
  const spec = manifest.instruments[name];
  if (!spec) return null;

  if (spec.type === "kit") {
    const voices = {};
    const flat = Object.entries(spec.voices).flatMap(([drum, list]) =>
      list.map((s) => ({ ...s, drum }))
    );
    const loaded = await decodeAll(ctx, spec.base, flat, onProgress);
    for (const z of loaded) (voices[z.drum] ??= []).push(z);
    const rrPos = {};
    return {
      kit: true,
      pick(drum, vel = 90) {
        const list = voices[drum];
        if (!list) return null;
        const layer = list.filter((z) => vel >= z.loVel && vel <= z.hiVel);
        const pool = layer.length ? layer : list;
        // round-robin within the velocity layer so repeats never sound identical
        rrPos[drum] = ((rrPos[drum] ?? -1) + 1) % pool.length;
        return pool[rrPos[drum]].buffer;
      },
    };
  }

  const zones = await decodeAll(ctx, spec.base, spec.samples, onProgress);

  const release = spec.release ?? 0.3;
  const trim = spec.gainTrim ?? 1;
  const active = new Set();

  const pickZone = (note, vel) => {
    let z = zones.find((x) => note >= x.loKey && note <= x.hiKey && vel >= x.loVel && vel <= x.hiVel);
    z ??= zones.reduce((a, b) => (Math.abs(b.rootMidi - note) < Math.abs(a.rootMidi - note) ? b : a));
    return z;
  };

  return {
    start({ note, time, duration, velocity = 90 }) {
      const z = pickZone(note, velocity);
      const src = ctx.createBufferSource();
      src.buffer = z.buffer;
      src.playbackRate.value = Math.pow(2, (note - z.rootMidi) / 12);
      const g = ctx.createGain();
      // one continuous velocity→gain curve across both layers — avoids the
      // loudness seam where the sample layers meet
      const level = (0.22 + 0.78 * Math.pow(velocity / 127, 1.35)) * trim;
      const t0 = time ?? ctx.currentTime;
      // 4 ms attack declick, exponential release — a linear gate sounds choppy
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(level, t0 + 0.004);
      src.connect(g);
      g.connect(destination ?? ctx.destination);
      src.start(t0);
      if (duration) {
        g.gain.setTargetAtTime(0, t0 + duration, release / 3);
        src.stop(t0 + duration + release * 2);
      }
      active.add(src);
      src.onended = () => active.delete(src);
    },
    stop() {
      for (const src of active) {
        try { src.stop(); } catch { /* already stopped */ }
      }
      active.clear();
    },
  };
}
