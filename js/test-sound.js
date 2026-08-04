// test-sound.js — by-ear A/B bench for the sound-quality branch.
// Not linked from the app; open /test-sound.html directly.

import { SONGS } from "./songs.js";
import { Band } from "./band.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const band = new Band({
  onProgress: (n, total) => ($("#status").textContent = `loading instruments… ${n}/${total}`),
  onReady: () => ($("#status").textContent = ""),
});

// representative tunes per style
const PICKS = ["Autumn Leaves", "Take the A Train", "Blue Bossa", "Watermelon Man", "Misty", "So What", "Blue Monk"];
const songs = PICKS.map((t) => SONGS.find((s) => s.title === t)).filter(Boolean);
$("#song").innerHTML = songs.map((s, i) => `<option value="${i}">${s.title} (${s.style} · ${s.bpm})</option>`).join("");
band.loadSong(songs[0]);

let playing = false;

$("#song").addEventListener("change", (e) => {
  const wasPlaying = playing;
  if (wasPlaying) stop();
  band.loadSong(songs[Number(e.target.value)]);
  if (wasPlaying) play();
});

async function play() {
  await band.play();
  playing = true;
  $("#play").textContent = "■ stop";
}

function stop() {
  band.stop();
  playing = false;
  $("#play").textContent = "▶ play";
}

$("#play").addEventListener("click", () => (playing ? stop() : play()));

// ---- A/B: A forces every polish element off; B restores the
// checkbox state
function applyB() {
  $$("input[data-mix]").forEach((c) => band.setMix(c.dataset.mix, c.checked));
  band.setGrand($("#grand").checked);
}

function setSide(side) {
  $("#ab-a").classList.toggle("active", side === "a");
  $("#ab-b").classList.toggle("active", side === "b");
  if (side === "a") {
    band.setMix("on", false);
    band.setGrand(false);
  } else {
    applyB();
  }
}

$("#ab-a").addEventListener("click", () => setSide("a"));
$("#ab-b").addEventListener("click", () => setSide("b"));

$$("input[data-mix]").forEach((c) =>
  c.addEventListener("change", () => {
    setSide("b"); // touching an element implies you're auditioning B
  })
);

$("#grand").addEventListener("change", () => setSide("b"));

$("#ride").addEventListener("change", (e) => band.setRide(e.target.checked));

document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT"].includes(e.target.tagName) && e.code === "Space") return;
  if (e.code === "Space") {
    e.preventDefault();
    playing ? stop() : play();
  }
  if (e.key === "a") setSide("a");
  if (e.key === "b") setSide("b");
});
