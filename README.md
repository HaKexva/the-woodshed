# the woodshed 🎷

A jazz chord-progression practice tool that runs entirely in the browser — no build step, no server, no login. A synthesized-and-sampled backing band (piano, guitar, bass, drums) plays classic jazz standards while you practice.

## Modes

- **Session** — the band loops the tune continuously. The lead sheet highlights the current bar, the big card shows the current chord, and the next chord is previewed. A **solo-notes strip** shows the 8-note chord scale to improvise with over the current chord (e.g. `Dm7 → D dorian: D E F G A B C D`), root notes highlighted.
- **Inspire** — the band plays and a generated soloist improvises over the changes so you can hear the scales in action. Pick the soloist (keys `1`–`5`): **trumpet, trombone, alto sax, tenor sax, or keys** (Splendid Grand — distinct from the electric-piano comping). Lines follow a dynamic arc across each chorus (sparse open → peak ~3/4 through → cool-down) with motif echoes, bebop enclosures into chord changes, blue notes, and grace-note scoops; the **solo density** slider scales the whole arc from sparse to hot, live. The note currently being played lights up in the solo-notes strip. Horn soloists are ~70–150 KB WebAudioFont presets; a new line is generated every play.

Other controls: tempo slider (50–240 bpm), per-instrument mutes, `space` to play/stop.

## Tech

| Piece | Choice | Why |
|---|---|---|
| Scheduling | [Tone.js](https://tonejs.github.io/) | Transport with native swing, BPM ramps, looping, lookahead scheduling on the Web Audio clock |
| Piano / bass / guitar | [smplr](https://github.com/danigb/smplr) soundfonts | Real sampled instruments from a CDN, ~2 MB each, browser-cached; successor to the archived soundfont-player |
| Drums | Tone.js synths | Instant start, zero assets to host; ride/hat/kick/brush-snare/rim synthesized |
| Theory | `js/theory.js` (own, zero-dep) | Chord-symbol parser + guide-tone voicings + walking-bass helpers |

Everything loads from CDNs (jsDelivr, Google Fonts); the repo itself is pure static files.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. Opening `index.html` via `file://` will NOT work (ES modules need http).

## Deploy to GitHub Pages

1. Create a GitHub repo and push these files to the `main` branch.
2. Repo **Settings → Pages → Source**: select `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Your app is live at `https://<user>.github.io/<repo>/`.

## Add your own songs

Append an object to `js/songs.js`:

```js
{
  title: "My Tune",
  composer: "Somebody",
  key: "F major",
  bpm: 132,
  style: "swing",        // swing | bossa | ballad | blues | modal | latin
  timeSignature: 4,      // beats per bar (3 for waltz)
  form: "32-bar AABA",
  progression: [
    [{ chord: "Gm7", beats: 2 }, { chord: "C7", beats: 2 }],  // one bar, two chords
    [{ chord: "FMaj7", beats: 4 }],                            // one bar, one chord
    // ... beats in each bar must sum to timeSignature
  ],
}
```

Supported chord symbols: major/minor/dominant with the usual jazz extensions and alterations (`Maj7`, `m7`, `7b9`, `7#11`, `m7b5`, `dim7`, `alt`, `sus`, `6`, `69`, slash chords like `F7/C`, …). Unknown suffixes degrade gracefully to the closest known quality — check the browser console for parse warnings.

The `style` field picks the band's feel: swing tunes get walking bass + Freddie Green guitar + swung ride; bossa/latin get clave, straight 8ths, and a bossa bass pattern; ballads get sparse brushed accompaniment; funk gets backbeat drums and a syncopated bass riff.

Optional fields: `source` (array of URLs the changes were verified against — shown in the app's credits section) and `note` (known chart variants).

## The songbook (MVP)

14 standards, each cross-checked against at least two jazz-education sources:

Autumn Leaves · Blue Bossa · Fly Me to the Moon · All the Things You Are · Take the A Train · So What · Misty · Satin Doll · Summertime · Cantaloupe Island · The Girl from Ipanema · Black Orpheus · Blue Monk · There Will Never Be Another You

Per-song source URLs live in `js/songs.js` and are displayed in the app. Where charts commonly diverge (e.g. the last 8 bars of There Will Never Be Another You, the Misty bridge, Black Orpheus in general), the `note` field says which variant was chosen and why.

## Sources & legal

- **What's included:** chord symbols, song titles, composer names, form/tempo metadata. Song titles and composer credits are factual metadata; the chord progressions are shown as commonly taught in jazz education.
- **What's deliberately NOT included:** melodies, lyrics, published lead-sheet layouts, or audio recordings of the original works — those are the copyrighted elements of these songs.
- **Chord-change references:** learnjazzstandards.com, jazz-circle.com, antonjazz.com, jazz-guitar-licks.com, jazzleadsheet.com, jazzingly.com, saxteacheruk.com, brunojazz.com, jazzimprov.net, musictheorymanual.com, Wikipedia, swiss-jazz.ch (per-song URLs in `js/songs.js`).
- **Instrument samples:** band = [MusyngKite soundfont kit](https://github.com/gleitz/midi-js-soundfonts) (CC BY-SA 3.0, hosted by gleitz.github.io as intended) via [smplr](https://github.com/danigb/smplr) (MIT); keys soloist = smplr's Splendid Grand Piano; horn soloists = [WebAudioFont](https://github.com/surikov/webaudiofont) JCLive presets (GPLv3 player, live-sampled with loop points). Scheduling by [Tone.js](https://tonejs.github.io/) (MIT). Drums are synthesized in-browser — no samples.
- **License:** this project is licensed under [GPLv3](LICENSE) (required by the WebAudioFont player it links).
- **Purpose:** personal practice and music education.

This is a good-faith educational project, not legal advice; if you plan to commercialize it, consult a music-licensing professional.
