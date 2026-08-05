// mytunes.js — tunes you wrote, kept in this browser.
//
// The songbook ships in js/songs.js and is read-only; anything you add in the
// editor used to live only in the tab that made it, which is why the editor
// carried a warning telling you so. These are saved instead, listed under their
// own heading, and can be carried to another device as one file.
//
// Storage is localStorage, not IndexedDB: a tune is a few hundred bytes of
// chord symbols, the whole collection is read at once on load, and the sync API
// keeps the list rendering straightforward.

const KEY = "woodshed-mytunes-v1";

/** Every tune this browser has saved, oldest first. Never throws — a corrupt
 *  or absent store reads as empty rather than taking the page down with it. */
export function loadMine() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    // normalise on read, not just on write: records saved by an older build,
    // or hand-edited in an exported file, are missing fields the list and the
    // band both assume exist
    return Array.isArray(list) ? list.filter(isTune).map(normalise) : [];
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // private mode, or the quota is full — the caller says so
  }
}

function isTune(t) {
  return t && typeof t.title === "string" && Array.isArray(t.progression) && t.progression.length > 0;
}

/** Fill in what a hand-written or third-party file leaves out. A tune arriving
 *  without a style or a bpm is perfectly reasonable input; the list and the
 *  band both assume those exist, so they get filled here rather than guarded
 *  for at every point of use. */
function normalise(t) {
  const ts = t.timeSignature === 3 ? 3 : 4;
  return {
    ...t,
    title: String(t.title).trim() || "Untitled",
    composer: t.composer || "unknown",
    key: t.key || "—",
    bpm: Number(t.bpm) > 0 ? Number(t.bpm) : 120,
    style: STYLES.includes(t.style) ? t.style : "swing",
    timeSignature: ts,
    form: t.form || `${t.progression.length}-bar`,
  };
}

const STYLES = ["swing", "bossa", "ballad", "blues", "modal", "latin", "funk"];

const newId = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Save a new tune, or overwrite the one with this id. Returns the stored copy. */
export function saveMine(song, id) {
  const list = loadMine();
  const stored = normalise({ ...song, id: id ?? song.id ?? newId(), saved: new Date().toISOString().slice(0, 10) });
  const at = list.findIndex((t) => t.id === stored.id);
  if (at >= 0) list[at] = stored;
  else list.push(stored);
  persist(list);
  return stored;
}

export function removeMine(id) {
  persist(loadMine().filter((t) => t.id !== id));
}

/** The whole collection as one file's worth of text. */
export function exportMine() {
  return JSON.stringify({ woodshed: "tunes", version: 1, tunes: loadMine() }, null, 2);
}

/**
 * Read a collection back. Accepts what exportMine writes, a bare array, or a
 * single tune object — people paste all three, and rejecting two of them for
 * being the wrong shape would be pedantry rather than safety.
 * Returns { added, skipped } and never partially applies: bad input changes
 * nothing.
 */
export function importMine(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { added: 0, skipped: 0, error: "notJson" };
  }
  const incoming = Array.isArray(data) ? data : Array.isArray(data?.tunes) ? data.tunes : [data];
  const good = incoming.filter(isTune);
  if (!good.length) return { added: 0, skipped: incoming.length, error: "noTunes" };

  const list = loadMine();
  const seen = new Set(list.map((t) => t.id));
  let added = 0;
  for (const t of good) {
    // an id that is already here means the same tune travelled back, so give
    // the arriving copy a fresh one rather than silently overwriting
    const stored = normalise({ ...t, id: t.id && !seen.has(t.id) ? t.id : newId() });
    seen.add(stored.id);
    list.push(stored);
    added++;
  }
  persist(list);
  return { added, skipped: incoming.length - good.length };
}

// A title is optional, so something has to fill the gap. Two halves that read
// like tunes rather than like filenames — the point is that it is nameable and
// findable later, not that it is clever.
const FIRST = [
  "Minor", "Blue", "Late", "Slow", "Seventh", "Broken", "Quiet", "Crooked",
  "Midnight", "Paper", "Second", "Hollow", "Bright", "Small", "Long", "Empty",
  "Half", "Corner", "Winter", "Borrowed",
];
const SECOND = [
  "Errand", "Ledger", "Kitchen", "Avenue", "Window", "Ferry", "Habit", "Hours",
  "Corner", "Weather", "Business", "Letter", "Detour", "Morning", "Company",
  "Traffic", "Postcard", "Landing", "Appetite", "Season",
];

/** A name for an untitled tune. Takes the key when there is one, because
 *  "Something in Eb" is how people actually refer to a sketch. */
export function randomTitle(key) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (key && key !== "—" && Math.random() < 0.25) return `Something in ${key.split(" ")[0]}`;
  const name = `${pick(FIRST)} ${pick(SECOND)}`;
  // don't hand back a name already sitting in the list
  return loadMine().some((t) => t.title === name) ? `${name} (2)` : name;
}
