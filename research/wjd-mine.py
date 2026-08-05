#!/usr/bin/env python3
"""Mine the Weimar Jazz Database — and the EsAC folk songs — into js/solo-vocab.js.

The WJD is 456 hand-transcribed solos with note-level pitch and timing, a chord
per beat, and manual phrase and mid-level-unit annotation. This is the closest a
static site can get to listening to the masters: instead of guessing how often
Coltrane leaps or how long a Miles phrase runs, measure it.

Nothing here ships. It is run once against a local copy of the database and its
output — js/solo-vocab.js — is what the generator reads.

    curl -O https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db
    curl -O https://jazzomat.hfm-weimar.de/download/downloads/esac.db
    python3 research/wjd-mine.py wjazzd.db esac.db > js/solo-vocab.js

The second file is optional and supplies the "singer" style. The WJD transcribes
no vocal solos at all — its instrument codes run ts/tp/as/tb/ss/cor/cl/vib/bs/p/g
and no voice — so what a sung line does differently has to come from a corpus of
sung melody. EsAC is 7,352 European folk songs: not jazz, but the constraints a
voice puts on a line are the same whoever is singing.

Licence: the WJD is ODbL (attribution + share-alike on derived databases). The
generated file carries its credit line; do not strip it.
"""

import json
import sqlite3
import sys
from collections import Counter, defaultdict

# Which WJD performers stand behind each of the woodshed's soloist styles. The
# styles the corpus cannot cover are listed for honesty rather than faked:
# Monk and Silver are pianists and Wes a chord-melody guitarist, and the WJD
# transcribes single-line wind and guitar solos only.
STYLE_SOURCES = {
    "parker": ["Charlie Parker"],
}
UNCOVERED = ["monk", "silver"]

# Which performers stand behind each horn, for the instrument-level defaults.
INSTRUMENT_SOURCES = {
    "trumpet": ["tp", "cor"],
    "trombone": ["tb"],
    "alto": ["as"],
    "tenor": ["ts"],
}

QUALITIES = [
    ("m7b5", [0, 3, 6, 10]),
    ("-7b5", [0, 3, 6, 10]),
    ("o7", [0, 3, 6, 9]),
    ("-j7", [0, 3, 7, 11]),
    ("-6", [0, 3, 7, 9]),
    ("-7", [0, 3, 7, 10]),
    ("+j7", [0, 4, 8, 11]),
    ("+7", [0, 4, 8, 10]),
    ("j7", [0, 4, 7, 11]),
    ("sus7", [0, 5, 7, 10]),
    ("sus", [0, 5, 7, 10]),
    ("o", [0, 3, 6]),
    ("+", [0, 4, 8]),
    ("-", [0, 3, 7]),
    ("6", [0, 4, 7, 9]),
    ("7", [0, 4, 7, 10]),
]
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def parse_chord(sym):
    """(root pitch class, chord-tone pitch classes) or None for NC / junk."""
    if not sym or sym in ("NC", "="):
        return None
    sym = sym.split("/")[0]
    if not sym or sym[0] not in PC:
        return None
    root = PC[sym[0]]
    i = 1
    while i < len(sym) and sym[i] in "b#":
        root += 1 if sym[i] == "#" else -1
        i += 1
    rest = sym[i:]
    for name, ivs in QUALITIES:
        if rest.startswith(name):
            return root % 12, [(root + iv) % 12 for iv in ivs]
    return root % 12, [(root + iv) % 12 for iv in (0, 4, 7)]


def ioi_class(beats):
    """Inter-onset interval bucketed the way a player feels it, not in seconds.

    The wide eighth bucket is deliberate: these solos are swung, so a pair of
    "eighths" is played roughly 0.67 + 0.33 of a beat. Bucketing at 0.65 files
    the long half of every swung pair as a quarter note and reports a corpus
    that is 15% quarters and barely swings at all."""
    if beats < 0.2:
        return "s16"      # sixteenth or faster
    if beats < 0.29:
        return "t16"      # triplet sixteenth
    if beats < 0.8:
        return "e8"       # eighth, swung or even
    if beats < 1.6:
        return "q"        # quarter
    if beats < 2.8:
        return "h"        # half
    return "long"


IOI_BEATS = {"s16": 0.25, "t16": 1 / 3, "e8": 0.5, "q": 1.0, "h": 2.0, "long": 3.0}


def load(db):
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    solos = {
        r["melid"]: dict(r)
        for r in con.execute("select melid, performer, instrument, title, avgtempo, style from solo_info")
    }
    notes = defaultdict(list)
    for r in con.execute("select melid, onset, pitch, duration, bar, beat, tatum, division, beatdur from melody order by melid, onset"):
        notes[r["melid"]].append(dict(r))
    chords = defaultdict(list)
    for r in con.execute("select melid, onset, chord from beats where chord != '' order by melid, onset"):
        chords[r["melid"]].append((r["onset"], r["chord"]))
    phrases = defaultdict(list)
    for r in con.execute("select melid, start, end from sections where type='PHRASE' order by melid, start"):
        phrases[r["melid"]].append((r["start"], r["end"]))
    ideas = defaultdict(list)
    for r in con.execute("select melid, start, end, value from sections where type='IDEA' order by melid, start"):
        ideas[r["melid"]].append((r["start"], r["end"], r["value"]))
    con.close()
    return solos, notes, chords, phrases, ideas


def chord_at(chord_list, onset):
    lo, hi, found = 0, len(chord_list) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        if chord_list[mid][0] <= onset + 1e-6:
            found = chord_list[mid][1]
            lo = mid + 1
        else:
            hi = mid - 1
    return found


def analyse(solos, notes, chords, phrases, ideas, melids):
    ivs = Counter()
    dir_runs = Counter()
    phrase_beats = Counter()
    phrase_notes = Counter()
    iois = Counter()
    mlu = Counter()
    licks = Counter()
    on_beat_tone = [0, 0]
    off_beat_tone = [0, 0]
    total_notes = 0

    for melid in melids:
        ns = notes.get(melid, [])
        if len(ns) < 8:
            continue
        beatdur = next((n["beatdur"] for n in ns if n["beatdur"]), None)
        if not beatdur:
            continue
        total_notes += len(ns)
        cl = chords.get(melid, [])

        for i, n in enumerate(ns):
            sym = chord_at(cl, n["onset"]) if cl else None
            parsed = parse_chord(sym) if sym else None
            if parsed:
                is_tone = int(n["pitch"]) % 12 in parsed[1]
                div = n["division"] or 1
                on = (n["tatum"] or 1) == 1
                bucket = on_beat_tone if on else off_beat_tone
                bucket[0] += is_tone
                bucket[1] += 1
                del div

        # phrase-internal statistics only: a gap between phrases is not an
        # interval anyone played
        for start, end in phrases.get(melid, []):
            seg = ns[start : end + 1]
            if len(seg) < 3:
                continue
            span = (seg[-1]["onset"] + seg[-1]["duration"] - seg[0]["onset"]) / beatdur
            phrase_beats[round(span * 2) / 2] += 1
            phrase_notes[len(seg)] += 1
            run, prev_sign = 1, 0
            for a, b in zip(seg, seg[1:]):
                step = int(b["pitch"]) - int(a["pitch"])
                ivs[max(-13, min(13, step))] += 1
                gap = (b["onset"] - a["onset"]) / beatdur
                iois[ioi_class(gap)] += 1
                sign = (step > 0) - (step < 0)
                if sign and sign == prev_sign:
                    run += 1
                else:
                    if prev_sign:
                        dir_runs[run] += 1
                    run = 1
                if sign:
                    prev_sign = sign
            dir_runs[run] += 1

            # vocabulary: every 5-note window inside the phrase, as the
            # (interval, ioi-class) shape that would transpose anywhere
            for i in range(len(seg) - 4):
                win = seg[i : i + 5]
                steps, durs, ok = [0], [], True
                for a, b in zip(win, win[1:]):
                    step = int(b["pitch"]) - int(a["pitch"])
                    if abs(step) > 12:
                        ok = False
                        break
                    steps.append(step)
                    durs.append(ioi_class((b["onset"] - a["onset"]) / beatdur))
                if ok and any(steps):
                    licks[(tuple(steps), tuple(durs))] += 1

        for start, end, value in ideas.get(melid, []):
            mlu[value.lstrip("#~+-")] += 1

    return {
        "solos": len(melids),
        "notes": total_notes,
        "intervals": ivs,
        "dirRuns": dir_runs,
        "phraseBeats": phrase_beats,
        "phraseNotes": phrase_notes,
        "iois": iois,
        "mlu": mlu,
        "licks": licks,
        "onBeatTone": on_beat_tone,
        "offBeatTone": off_beat_tone,
    }


def pct(part, whole):
    return round(100 * part / whole, 1) if whole else None


def summarise(a, lick_count=20):
    ivs, total = a["intervals"], sum(a["intervals"].values())
    absiv = Counter()
    for k, v in ivs.items():
        absiv[abs(k)] += v
    runs, run_total = a["dirRuns"], sum(a["dirRuns"].values())
    weighted_run = sum(k * v for k, v in runs.items()) / run_total if run_total else 0
    pb = a["phraseBeats"]
    pb_total = sum(pb.values())
    ordered = sorted(pb.items())
    cum, median = 0, None
    for k, v in ordered:
        cum += v
        if median is None and cum >= pb_total / 2:
            median = k
    ioi_total = sum(a["iois"].values())
    mlu_total = sum(a["mlu"].values())

    # The licks worth keeping. The raw frequency list is dominated by plain
    # scale and chromatic runs — the single commonest 5-note window in the
    # whole corpus is four descending semitones — and the generator already
    # makes those from its scale figure. What it cannot invent is shape, so
    # keep only windows that turn at least twice and are not one interval
    # repeated, and record them in the (steps, durs) form it already speaks.
    top = []
    for (steps, durs), count in a["licks"].most_common(lick_count * 40):
        if count < 3:
            break
        moves = [s for s in steps[1:] if s]
        turns = sum(1 for x, y in zip(moves, moves[1:]) if (x > 0) != (y > 0))
        if turns < 2 or len(set(moves)) < 3:
            continue
        top.append({
            "steps": list(steps),
            "durs": [round(IOI_BEATS[d], 4) for d in durs] + [1.0],
            "n": count,
        })
        if len(top) >= lick_count:
            break

    return {
        "solos": a["solos"],
        "notes": a["notes"],
        "step": pct(absiv[1] + absiv[2], total),
        "third": pct(absiv[3] + absiv[4], total),
        "leap": pct(sum(v for k, v in absiv.items() if k >= 5), total),
        "repeat": pct(absiv[0], total),
        "meanDirRun": round(weighted_run, 2),
        "dirRun4plus": pct(sum(v for k, v in runs.items() if k >= 4), run_total),
        "descending": pct(sum(v for k, v in ivs.items() if k < 0), total),
        "phraseBeatsMedian": median,
        "phraseBeatsMean": round(sum(k * v for k, v in pb.items()) / pb_total, 2) if pb_total else None,
        "notesPerPhrase": round(
            sum(k * v for k, v in a["phraseNotes"].items()) / sum(a["phraseNotes"].values()), 1
        ) if a["phraseNotes"] else None,
        "ioi": {k: pct(v, ioi_total) for k, v in a["iois"].most_common()},
        "mlu": {k: pct(v, mlu_total) for k, v in a["mlu"].most_common(6)},
        "chordToneOnBeat": pct(*a["onBeatTone"]),
        "chordToneOffBeat": pct(*a["offBeatTone"]),
        "licks": top,
    }


def sung_profile(db):
    """Singability, measured. Folk song is not jazz, but a voice is a voice:
    what this supplies is the shape of a line somebody had to breathe."""
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    notes = defaultdict(list)
    for r in con.execute("select melid, onset, pitch, duration, beatdur from melody order by melid, onset"):
        notes[r["melid"]].append(dict(r))
    phrases = defaultdict(list)
    for r in con.execute("select melid, start, end from sections where type='PHRASE' order by melid, start"):
        phrases[r["melid"]].append((r["start"], r["end"]))
    con.close()

    absiv = Counter()
    runs = Counter()
    pnotes = Counter()
    pbeats = Counter()
    spans = []
    after_skip = [0, 0]
    licks = Counter()
    for melid, ns in notes.items():
        if len(ns) < 8:
            continue
        beatdur = next((n["beatdur"] for n in ns if n["beatdur"]), None)
        spans.append(max(int(n["pitch"]) for n in ns) - min(int(n["pitch"]) for n in ns))
        for start, end in phrases.get(melid, []):
            seg = ns[start : end + 1]
            if len(seg) < 3:
                continue
            pnotes[len(seg)] += 1
            if beatdur:
                pbeats[round(((seg[-1]["onset"] + seg[-1]["duration"] - seg[0]["onset"]) / beatdur) * 2) / 2] += 1
            steps = [int(b["pitch"]) - int(a["pitch"]) for a, b in zip(seg, seg[1:])]
            for st in steps:
                absiv[min(abs(st), 13)] += 1
            run, prev = 1, 0
            for st in steps:
                sign = (st > 0) - (st < 0)
                if sign and sign == prev:
                    run += 1
                else:
                    if prev:
                        runs[run] += 1
                    run = 1
                if sign:
                    prev = sign
            runs[run] += 1
            for x, y in zip(steps, steps[1:]):
                if abs(x) >= 3 and x and y:
                    after_skip[0] += (y > 0) != (x > 0)
                    after_skip[1] += 1
            if beatdur:
                for i in range(len(seg) - 4):
                    win = seg[i : i + 5]
                    ss, dd, ok = [0], [], True
                    for a, b in zip(win, win[1:]):
                        st = int(b["pitch"]) - int(a["pitch"])
                        if abs(st) > 9:
                            ok = False
                            break
                        ss.append(st)
                        dd.append(ioi_class((b["onset"] - a["onset"]) / beatdur))
                    if ok and any(ss):
                        licks[(tuple(ss), tuple(dd))] += 1

    tot = sum(absiv.values())
    rt = sum(runs.values())
    pbt = sum(pbeats.values())
    cum, median = 0, None
    for k, v in sorted(pbeats.items()):
        cum += v
        if median is None and cum >= pbt / 2:
            median = k
    top = []
    for (steps, durs), count in licks.most_common(4000):
        if count < 8:
            break
        moves = [x for x in steps[1:] if x]
        turns = sum(1 for a, b in zip(moves, moves[1:]) if (a > 0) != (b > 0))
        if turns < 2 or len(set(moves)) < 3:
            continue
        top.append({"steps": list(steps), "durs": [round(IOI_BEATS[d], 4) for d in durs] + [1.0], "n": count})
        if len(top) >= 12:
            break
    return {
        "sources": ["EsAC folk song database"],
        "solos": len(notes),
        "notes": sum(len(v) for v in notes.values()),
        "step": pct(absiv[1] + absiv[2], tot),
        "third": pct(absiv[3] + absiv[4], tot),
        "leap": pct(sum(v for k, v in absiv.items() if k >= 5), tot),
        "repeat": pct(absiv[0], tot),
        "over7": pct(sum(v for k, v in absiv.items() if k > 7), tot),
        "meanDirRun": round(sum(k * v for k, v in runs.items()) / rt, 2),
        "reversalAfterSkip": pct(*after_skip),
        "notesPerPhrase": round(sum(k * v for k, v in pnotes.items()) / sum(pnotes.values()), 1),
        "phraseBeatsMedian": median,
        "phraseBeatsMean": round(sum(k * v for k, v in pbeats.items()) / pbt, 2) if pbt else None,
        "rangeSemitones": round(sum(spans) / len(spans), 1),
        "licks": top,
    }


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else "wjazzd.db"
    solos, notes, chords, phrases, ideas = load(db)

    by_performer = defaultdict(list)
    by_instrument = defaultdict(list)
    for melid, info in solos.items():
        by_performer[info["performer"]].append(melid)
        by_instrument[info["instrument"]].append(melid)

    out = {"styles": {}, "instruments": {}}
    out["all"] = summarise(analyse(solos, notes, chords, phrases, ideas, list(solos)), lick_count=24)

    for style, performers in STYLE_SOURCES.items():
        melids = [m for p in performers for m in by_performer.get(p, [])]
        if not melids:
            print(f"// no WJD solos for {style}", file=sys.stderr)
            continue
        out["styles"][style] = summarise(analyse(solos, notes, chords, phrases, ideas, melids))
        out["styles"][style]["sources"] = performers

    for inst, codes in INSTRUMENT_SOURCES.items():
        melids = [m for code in codes for m in by_instrument.get(code, [])]
        if melids:
            out["instruments"][inst] = summarise(
                analyse(solos, notes, chords, phrases, ideas, melids), lick_count=12
            )

    if len(sys.argv) > 2:
        out["styles"]["singer"] = sung_profile(sys.argv[2])

    header = f"""// solo-vocab.js — GENERATED by research/wjd-mine.py. Do not edit by hand.
//
// Measured from the Weimar Jazz Database: {len(solos)} hand-transcribed jazz
// solos with note-level pitch, timing, chords and manual phrase annotation.
// These are the numbers the generator used to guess at — how far a real line
// steps, how long it runs in one direction, how many beats a phrase lasts, how
// often a note on the beat is a chord tone — taken from the players themselves.
//
// Weimar Jazz Database, The Jazzomat Research Project, Hochschule fur Musik
// Franz Liszt Weimar. Open Data Commons Open Database License (ODbL 1.0):
// https://jazzomat.hfm-weimar.de/  — attribution and share-alike apply to this
// derived data. Styles with no WJD source ({", ".join(UNCOVERED)}) keep their
// hand-authored numbers; the corpus transcribes single-line wind and guitar
// solos, so pianists and chord-melody guitar are simply not in it — and neither
// is any singer, which is why the "singer" profile below is measured from the
// EsAC folk song database (7,352 sung melodies) instead. Also Jazzomat, also ODbL.

export const WJD = """

    print(header + json.dumps(out, indent=2, sort_keys=True) + ";")


if __name__ == "__main__":
    main()
