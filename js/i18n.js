// i18n.js — UI strings. English is the default; zh-TW (Traditional Chinese)
// is selectable via the masthead toggle and persisted in localStorage.
// Song titles, composer names, chord symbols, and style names stay as-is.

export const STRINGS = {
  en: {
    tagline: "jazz changes trainer",
    "mode.session": "Session",
    "mode.inspire": "Inspire",
    tunes: "tunes",
    addTune: "+ add a tune",
    sideLabel: "side {letter} — standards",
    searchPh: "search tunes…",
    noMatch: "no tunes match",
    sleeveNote: "export JSON and open a PR to share it",
    soloNotes: "solo notes · ",
    played: "played",
    soloistStyle: "soloist style · ",
    crowding: "crowding",
    sparse: "sparse",
    crowded: "crowded",
    loudness: "loudness",
    soft: "soft",
    sharp: "sharp",
    voicing: "voicing",
    mono: "mono",
    multi: "multi",
    next: "next · {chord}",
    bars: "bars {from}–{to} of {total}",
    creditsHead: "sources & credits",
    credits1:
      'This tool displays <strong>chord symbols only</strong> — no melodies, no lyrics, no recordings. Song titles and composer names are shown as factual metadata. Chord changes follow common lead-sheet practice, cross-checked against jazz-education references.',
    verified: "changes for this song verified against: ",
    credits2:
      'Samples: <a href="https://github.com/gleitz/midi-js-soundfonts" rel="noopener">MusyngKite soundfont kit (CC BY-SA 3.0)</a> and the Splendid Grand Piano via <a href="https://github.com/danigb/smplr" rel="noopener">smplr (MIT)</a> · scheduling by <a href="https://tonejs.github.io/" rel="noopener">Tone.js (MIT)</a> · drums synthesized in-browser. "Real" pack (all CC0): <a href="https://github.com/sfzinstruments/karoryfer.meatbass" rel="noopener">Meatbass</a>, <a href="https://github.com/sfzinstruments/karoryfer.black-and-green-guitars" rel="noopener">Black &amp; Green Guitars</a> and <a href="https://github.com/sfzinstruments/karoryfer.swirly-drums" rel="noopener">Swirly Drums</a> by Karoryfer Samples · <a href="https://github.com/sfzinstruments/virtuosity_drums" rel="noopener">Virtuosity Drums</a> by Versilian Studios. This site is <a href="https://github.com/HaKexva/the-woodshed" rel="noopener">open source under GPLv3</a>. For personal practice &amp; education.',
    tempo: "tempo",
    band: "band",
    play: "play",
    stop: "stop",
    "mute.keys": "keys",
    "mute.gtr": "gtr",
    "mute.bass": "bass",
    "mute.drums": "drums",
    "mute.ride": "ride",
    "mute.hq": "Real",
    hint: "play / stop",
    "status.loading": "loading instruments… {n}/{total}",
    "status.loadingSolo": "loading solo piano…",
    "status.loadingHq": "loading Real sounds… {n}/{total} ·",
    hqSkip: "use standard",
    "ed.heading": "add a tune",
    "ed.warning":
      'nothing is saved here — a refresh or closed tab clears your tune. <strong>export the JSON</strong> to keep it: paste it back below later, or PR it into the songbook.',
    "ed.title": "title",
    "ed.composer": "composer",
    "ed.key": "key",
    "ed.bpm": "bpm",
    "ed.style": "style",
    "ed.beatsPerBar": "beats / bar",
    "ed.form": "form",
    "ed.sourceUrl": "source URL",
    "ed.changesHint":
      'changes — bars split by <code>|</code>, chords in a bar by spaces, optional beats with <code>:</code> (e.g. <code>Dm7b5:3 G7:1</code>)',
    "ed.preview": "preview in player",
    "ed.export": "export json",
    "ed.random": "random changes",
    "ed.close": "close",
    "ed.importLabel": "or paste a previously exported tune JSON",
    "ed.load": "load json",
    "ed.copy": "copy",
    "ed.copied": "copied",
    "ed.gh": "edit songs.js on GitHub →",
    "ed.hint":
      '<strong>Share your tune with everyone:</strong> paste the exported JSON into <code>js/songs.js</code> before the closing <code>];</code> (the GitHub link opens the editor — it forks the repo for you automatically), then open a pull request.',
    "err.titleRequired": "title is required",
    "err.noBars": "no bars found — separate bars with |",
    "err.badChord": 'bar {n}: "{sym}" doesn\'t look like a chord',
    "err.badBeats": 'bar {n}: bad beat count in "{tok}" (whole or half beats only)',
    "err.sumMismatch": "bar {n}: beats sum to {sum}, need {ts} — use chord:beats for uneven splits",
    "err.loadJson": "couldn't load JSON: {msg}",
    "err.needTitleProg": "needs at least a title and a progression",
    editPreview: "edit",
    "blurb.miles": "space, short motifs, mid register, behind the beat",
    "blurb.parker": "relentless bebop 8ths, enclosures, barline-crossing phrases",
    "blurb.coltrane": "sheets of sound — 16th cascades, stacked arpeggios",
    "blurb.monk": "angular leaps, weak-beat jabs, sudden silences",
    "blurb.chet": "singable stepwise lines, chord tones, soft and unhurried",
    "blurb.dexter": "way behind the beat, long even notes, sneaks in quotes",
    "blurb.wes": "builds the chorus: single notes → octaves → chords",
    "blurb.silver": "short funky riffs, repeated and squeezed, gospel smears",
  },
  zh: {
    tagline: "爵士和聲練習室",
    "mode.session": "合奏",
    "mode.inspire": "靈感",
    tunes: "曲目",
    addTune: "＋新增樂曲",
    sideLabel: "{letter} 面 — 經典曲目",
    searchPh: "搜尋樂曲…",
    noMatch: "沒有符合的樂曲",
    sleeveNote: "匯出 JSON 並發 PR 分享你的樂曲",
    soloNotes: "即興音階 · ",
    played: "已奏",
    soloistStyle: "獨奏風格 · ",
    crowding: "音符密度",
    sparse: "疏",
    crowded: "密",
    loudness: "力度",
    soft: "柔",
    sharp: "強",
    voicing: "聲部",
    mono: "單音",
    multi: "和音",
    next: "下一個 · {chord}",
    bars: "第 {from}–{to} 小節・共 {total} 小節",
    creditsHead: "來源與致謝",
    credits1:
      "本工具<strong>僅顯示和弦記號</strong>——不含旋律、歌詞或錄音。曲名與作曲者僅作為事實性資訊呈現。和弦進行依照常見的 lead sheet 慣例，並與爵士教育資源相互查證。",
    verified: "本曲和弦已比對下列來源：",
    credits2:
      '取樣音色：<a href="https://github.com/gleitz/midi-js-soundfonts" rel="noopener">MusyngKite soundfont（CC BY-SA 3.0）</a>與 Splendid Grand Piano，經由 <a href="https://github.com/danigb/smplr" rel="noopener">smplr（MIT）</a>播放 · 排程由 <a href="https://tonejs.github.io/" rel="noopener">Tone.js（MIT）</a>驅動 · 鼓組為瀏覽器內合成。真實音色包（皆為 CC0）：Karoryfer Samples 的 <a href="https://github.com/sfzinstruments/karoryfer.meatbass" rel="noopener">Meatbass</a>、<a href="https://github.com/sfzinstruments/karoryfer.black-and-green-guitars" rel="noopener">Black &amp; Green Guitars</a> 與 <a href="https://github.com/sfzinstruments/karoryfer.swirly-drums" rel="noopener">Swirly Drums</a> · Versilian Studios 的 <a href="https://github.com/sfzinstruments/virtuosity_drums" rel="noopener">Virtuosity Drums</a>。本站以 <a href="https://github.com/HaKexva/the-woodshed" rel="noopener">GPLv3 開源</a>。僅供個人練習與教育用途。',
    tempo: "速度",
    band: "樂隊",
    play: "播放",
    stop: "停止",
    "mute.keys": "鋼琴",
    "mute.gtr": "吉他",
    "mute.bass": "貝斯",
    "mute.drums": "鼓",
    "mute.ride": "疊音鈸",
    "mute.hq": "真實音色",
    hint: "播放／停止",
    "status.loading": "載入樂器中… {n}/{total}",
    "status.loadingSolo": "載入獨奏鋼琴中…",
    "status.loadingHq": "載入真實音色中… {n}/{total} ·",
    hqSkip: "先用標準音色",
    "ed.heading": "新增樂曲",
    "ed.warning":
      "這裡不會儲存任何內容——重新整理或關閉分頁就會清空。<strong>請匯出 JSON</strong> 保存：日後可貼回下方，或發 PR 加入曲庫。",
    "ed.title": "曲名",
    "ed.composer": "作曲者",
    "ed.key": "調性",
    "ed.bpm": "速度",
    "ed.style": "風格",
    "ed.beatsPerBar": "每小節拍數",
    "ed.form": "曲式",
    "ed.sourceUrl": "來源網址",
    "ed.changesHint":
      "和弦進行——小節以 <code>|</code> 分隔、同小節和弦以空格分隔，拍數可用 <code>:</code> 指定（例如 <code>Dm7b5:3 G7:1</code>）",
    "ed.preview": "在播放器試聽",
    "ed.export": "匯出 JSON",
    "ed.random": "隨機和弦",
    "ed.close": "關閉",
    "ed.importLabel": "或貼上先前匯出的樂曲 JSON",
    "ed.load": "載入 JSON",
    "ed.copy": "複製",
    "ed.copied": "已複製",
    "ed.gh": "在 GitHub 編輯 songs.js →",
    "ed.hint":
      "<strong>與大家分享你的樂曲：</strong>把匯出的 JSON 貼進 <code>js/songs.js</code> 結尾的 <code>];</code> 之前（GitHub 連結會開啟線上編輯器並自動為你 fork），然後發一個 pull request。",
    "err.titleRequired": "必須填寫曲名",
    "err.noBars": "找不到小節——請用 | 分隔小節",
    "err.badChord": "第 {n} 小節：「{sym}」看起來不是和弦",
    "err.badBeats": "第 {n} 小節：「{tok}」的拍數無效（僅限整數或半拍）",
    "err.sumMismatch": "第 {n} 小節：拍數總和為 {sum}，應為 {ts}——不均分請用 和弦:拍數",
    "err.loadJson": "無法載入 JSON：{msg}",
    "err.needTitleProg": "至少需要曲名與和弦進行",
    editPreview: "編輯",
    "blurb.miles": "留白、短小動機、中音域、拖後拍",
    "blurb.parker": "連綿的 bebop 八分音符、環繞音、跨小節樂句",
    "blurb.coltrane": "音牆——十六分音符瀑布、堆疊琶音",
    "blurb.monk": "稜角跳進、弱拍重擊、驟然靜默",
    "blurb.chet": "如歌的級進旋律、和弦內音、輕柔從容",
    "blurb.dexter": "大幅拖後拍、綿長平均的音符、偷偷引用旋律",
    "blurb.wes": "逐段堆疊：單音 → 八度 → 和弦",
    "blurb.silver": "短小放克樂句反覆推進、福音式滑音",
  },
};

let lang = localStorage.getItem("woodshed-lang") === "zh" ? "zh" : "en";

export function getLang() {
  return lang;
}

export function setLang(l) {
  lang = l === "zh" ? "zh" : "en";
  localStorage.setItem("woodshed-lang", lang);
  applyStatic();
}

/** Translate a key, with {var} interpolation. Falls back to English. */
export function t(key, vars = {}) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Re-render every statically tagged node for the current language. */
export function applyStatic() {
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
}
