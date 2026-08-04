# Sourcing a larger songbook

Where chord changes for a 1000+ tune songbook can come from, what the licences
actually say, and why the answer is a method rather than a download.

Researched August 2026. Every corpus below was checked by reading its actual
licence text, not a badge or a summary.

## The short answer

**There is no cleanly-licensed bulk jazz chord corpus.** Not because nobody
built one, but because the compositions are mostly still in US copyright, so
every collection large enough to matter either carries a non-commercial clause,
carries no licence at all, or asserts a grant its authors never held.

Two viable paths, and they answer different questions:

| | What it is | Tunes |
|---|---|---|
| **A — licensed import** | Bulk-import a corpus we may redistribute | **66** |
| **B — corroborated encoding** | Consult several corpora, encode the consensus, cite them | **972** (317 triple-checked) |

B is the recommendation, and it is what `README.md` already prescribes: verify
against at least two independent sources and list them in `source[]`. Consulting
a source and encoding the consensus is not redistributing it.

## Why B is defensible, empirically

This is the most useful single finding, and it is measured rather than argued.

Impro-Visor's Imaginary Book and the iRb corpus share 860 comparable titles.
Comparing harmonic sequences transposition-invariantly (root pitch-class plus
reduced quality, consecutive repeats collapsed):

- **exact agreement: 2.9%**
- median similarity: 0.68
- similarity ≥ 0.95: 4.1%

Two large, independently produced corpora of the *same repertoire* disagree
substantially. That is exactly what independent transcription of an
uncopyrightable underlying progression looks like. It means:

- the underlying progression is a fact, which is why the readings differ
- any one corpus's chart is that transcriber's reading, which is the thing not
  to copy
- the intersection of several is the fact, which is the thing we may encode

So the 2.9% figure is simultaneously the evidence that copying one source is
risky and the evidence that encoding the consensus of several is not.

## Corpus by corpus

### Impro-Visor — Imaginary Book (2,614 leadsheets)

**Do not vendor these files.** The project's own FAQ, still live, says:

> The Imaginary Book is not part of the open source software, and thus is not
> distributed via source-forge.

The software is GPL-2.0-or-later, and Keller did commit the leadsheets into the
GPL repo in 2017 (and ships them in the installers), but **no grant covering the
data was ever added** and the carve-out was never retracted. "It's GPL data" is
not a claim we can make.

No statement of origin exists anywhere reachable — not the repo, the site, or
the papers. Distribution ran through a Yahoo! group that also had a "Contributed
Transcriptions" folder; Yahoo Groups was destroyed in 2020, so the trail is gone.
A sibling directory's README does admit that another Impro-Visor sub-corpus was
keyed in "as it comes from a book", which tells you the working practice.

Two corrections to earlier assumptions, both favourable:

- **It is chords-only.** Only 19 of 2,614 files carry a real melody; the rest
  have a placeholder note and rests. The melody-bearing directories are
  `leadsheets/transcriptions` and `leadsheets/solos` — exclude those wholesale.
- **The format has a `year` field**, but it is populated in only 6.3% of
  Imaginary Book files, so it cannot drive a public-domain filter. Composer is
  populated in 88.9%.

Nine years public, 33 forks, no recorded challenge — but the GitHub DMCA archive
is the only complete public record reachable, so absence is not proof.

**Verdict: excellent reference source, not an import.**

### Ralph Patt's Vanilla Book (412 charts)

The most valuable near-miss. Chords only, no melody, no lyrics — exactly the
right shape. But there is **no licence, no copyright notice, and no grant**
anywhere on the site, the widely repeated "he put it in the public domain" claim
is unsupported, and Patt died in 2010 so his estate holds it until roughly 2080.
The domain is dead; only Wayback captures survive.

His own framing is the problem: *"This book reflects the way I hear these tunes."*
That is a signed declaration that these are one identified person's readings —
the transcription risk in its purest form. Copying it verbatim would be the worst
available choice; consulting it is fine.

### iRb (Broze & Shanahan, 1,186 tunes)

Deposited on Zenodo under CC BY 4.0 — a real grant by both named authors. But
their own published methodology says the corpus was scraped from the iReal Pro
forum by reverse-engineering its format, and describes its sources as *"of
unknown origin and questionable legality"*. The forum's terms grant a licence to
the operator only, not to the public. So the grantors published that they never
held the rights they granted.

**Verdict: unclear, leaning no as an import.** Usable as a reference. If used at
all, pull from the Zenodo DOI (the GitHub mirror has no licence) and record the
DOI and hash.

### ChoCo (~19,811 jazz tunes across 18 partitions)

Dual-licensed CC BY 4.0 / CC BY-NC-SA 4.0, but the paper admits that for 7 of 18
sub-corpora *"we could not find any specific licensing information"* and the
relicence rests on unpublished private email.

Three specific problems:

- **Wikifonia's "public domain" claim is false**, verifiably, in ChoCo's own
  shipped files: of 45 sampled scores, 38 carry `All Rights Reserved` and 37
  contain lyrics.
- **Band-in-a-Box contradicts itself** — the raw README says the files *"cannot
  be re-distributed here due to copyright"*, yet the derived files are committed
  and labelled CC BY 4.0.
- **33,840 iReal-Pro-forum-scraped tunes** sit in the repo undescribed by the
  paper.

Clean partitions are all non-jazz. **Jazz tunes with a clean, verifiable,
GPLv3-redistributable licence: effectively zero.**

### OpenEWLD — the one clean import (66 tunes)

MIT-licensed, 568 works, 136 jazz-tagged, of which **66 are pre-1931** and
therefore in the US public domain. Chord symbols extractable from MusicXML while
discarding melody and lyrics.

Caveat: its own PD filter uses life+70 (EU), not the US rule, and its
public-domain claim is stated as an intention rather than a warranty. The
pre-1931 subset is safe under the US rule regardless.

### Ruled out

| Source | Why |
|---|---|
| JAAH (113 jazz) | CC BY-NC-SA — NC is incompatible with GPLv3 §7 |
| Jazz Harmony Treebank (1,170) | CC BY-NC-SA, and derived from iRb |
| Isophonics (225) | **no licence stated at all**; the CC BY-NC-SA on that site covers only its impulse responses. Zero jazz anyway |
| music21 corpus | non-uniform, self-flagged for commercial restrictions; ~3 ragtime files. Code is BSD, the music is not |
| McGill Billboard (740) | genuinely CC0, but 5 jazz tracks out of 890 |
| Open Music Theory | CC BY-SA 4.0 but contains no data files |
| Hooktheory, jazzstandards.com, MuseScore.com | explicit anti-redistribution terms |

### The Wikifonia precedent

Worth knowing because it sets the ceiling. Wikifonia was a **licensed,
royalty-paying operation** with an agreement through a publishers'
representative, and its own terms were already non-commercial and
no-redistribution. It closed in 2013 with:

> A license to secure the rights of copyrighted works could not be extended.

An entity that paid for a blanket publisher licence could not keep it. A GPLv3
project cannot obtain or sublicense such rights at all. Everything downstream of
Wikifonia inherits that.

## The method

1. **Consult, don't copy.** Use Impro-Visor, iRb (via the Zenodo DOI) and the
   Vanilla Book (via Wayback) as reference sources. Encode the consensus, cite
   all of them in `source[]`.
2. **Never take one source verbatim.** If the sources agree, you have a fact. If
   you take one source's idiosyncratic reading, you have taken their expression.
   The 2.9% exact-agreement figure means the second case is easy to avoid.
3. **Don't vendor `.ls` files into the repo.** If tooling is wanted, ship a fetch
   script rather than the data.
4. **Ship the 66 OpenEWLD pre-1931 tunes as a licence-clean base layer** if an
   unimpeachable floor is wanted. They are mostly early Great American Songbook,
   which the current 23 barely touch.
5. **Hard-exclude:** `leadsheets/transcriptions` and `leadsheets/solos`, the 19
   melody-bearing Imaginary Book files, anything NC, anything Wikifonia-derived,
   and ChoCo's `real-book` / `ireal-pro` / `biab-internet-corpus` partitions.

Database rights are addressed by construction: taking the intersection of
several corpora and re-expressing it is not extracting a substantial part of any
one of them. CC BY 4.0 §4(a) also expressly grants extraction where sui generis
rights apply, which covers the Zenodo-sourced iRb.

## Corroboration coverage

Titles normalised, leading articles stripped, melody-bearing files excluded:

| Corpus | Distinct titles |
|---|---|
| Impro-Visor Imaginary Book | 2,521 |
| iRb | 1,186 |
| Vanilla Book | 410 |
| OpenEWLD (jazz) | 123 |

| Overlap | Tunes |
|---|---|
| in ≥2 independent corpora | **972** |
| in ≥3 | **317** |
| in all four | 24 |
| union | 2,927 |

972 tunes can be verified against two independent transcription lineages — 42×
the current songbook — and 317 against three.

## Not verified

- Whether the destroyed Yahoo! Groups archive recorded the Imaginary Book's
  origin. It is unstated in every reachable source.
- Whether any takedown against Impro-Visor exists outside the GitHub DMCA archive
  (Lumen is behind a proof-of-work wall).
- The iReal Pro forum terms in force when iRb was scraped in 2011–12.
- Whether any offline source records a Vanilla Book rights grant. If those 412
  tunes are wanted as a licensed import, contacting Patt's estate is the only
  route — and the data is exactly the right shape, so it may be worth asking.
