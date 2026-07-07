// Bootstrap + app state machine (title / playing / paused / win). Wires the renderer,
// camera, background, particles, audio and input into a Game instance per level, and
// drives the fixed-timestep loop.

import { createLoop } from "./core/loop.js";
import { createInput } from "./core/input.js";
import { Audio } from "./core/audio.js";
import { Renderer } from "./render/renderer.js";
import { Camera } from "./render/camera.js";
import { Background } from "./render/background.js";
import { Particles } from "./render/particles.js";
import { Game } from "./game/game.js";
import { LEVELS } from "./game/levels.js";
import { isConfigured, fetchTop, submitScore, formatTime } from "./core/leaderboard.js";
import { quality, initQuality, sampleFrame, setTier, setAuto } from "./core/quality.js";
import { initAchievements, unlock, resetAchievements } from "./core/achievements.js";

// Pick a starting quality tier from device hints before the renderer reads quality.dpr.
initQuality();

const canvas = document.getElementById("game");
const renderer = new Renderer(canvas);
// When the adaptive manager changes tier, push the new dpr/glow into the renderer.
quality.onChange = () => renderer.applyQuality();
const camera = new Camera();
const background = new Background();
const particles = new Particles();
const audio = new Audio();
initAchievements({ audio });

const el = (id) => document.getElementById(id);
const screens = { title: el("title"), pause: el("pause"), win: el("win"), gameover: el("gameover") };
const hud = el("hud");
const boneCount = el("boneCount");
const boneTotal = el("boneTotal");
const lifeCount = el("lifeCount");
const muteBtn = el("muteBtn");
const musicBtn = el("musicBtn");

// Leaderboard elements
const nameInput = el("nameInput");
const saveBtn = el("saveBtn");
const winSaveRow = el("winSave");
const winSaveMsg = el("winSaveMsg");
const winTimeEl = el("winTime");
const winKillsEl = el("winKills");
const winBoardBody = el("winBoardBody");
const winBoardMsg = el("winBoardMsg");
const titleBoardBody = el("titleBoardBody");
const titleBoardMsg = el("titleBoardMsg");

const deps = { audio, particles, camera, background };
// runTime accumulates seconds spent actually playing (pauses excluded); kills/deaths are
// the run totals. These are shown only in the leaderboard, not the in-game HUD. All reset
// when a fresh run starts.
const session = { index: 0, lives: 3, kills: 0, deaths: 0, runTime: 0, deathsL1: 0 };
let game = null;
let state = "title"; // title | playing | paused | win
let time = 0;

// When a game-over/win screen appears, briefly ignore the jump-to-restart shortcut so a
// jump the player was already mashing (e.g. trying to escape the fatal hit) can't skip the
// screen and silently restart the whole run from level 1. Explicit button clicks are exempt.
const SCREEN_INPUT_LOCK = 0.7; // s
let screenLockUntil = 0;

camera.setViewport(renderer.vw, renderer.vh);

// --- Screen helpers ----------------------------------------------------------
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
  if (!name) for (const k in screens) screens[k].classList.add("hidden");
}
function hideAllScreens() {
  for (const k in screens) screens[k].classList.add("hidden");
}

function setLives(n) {
  session.lives = n;
  lifeCount.textContent = n;
}
function setBones(cur, total) {
  boneCount.textContent = cur;
  boneTotal.textContent = total;
}

// --- Level flow --------------------------------------------------------------
const hooks = {
  onComplete: () => {
    if (session.index < LEVELS.length - 1) {
      session.index++;
      beginLevel(session.index);
    } else {
      winGame();
    }
  },
  onLives: (delta) => {
    if (delta < 0) {
      session.deaths++; // every death counts toward the run total
      // Deaths suffered on the first level (index 0) within this run.
      if (session.index === 0 && ++session.deathsL1 >= 3) unlock("yebat_ti_loh");
    }
    const n = session.lives + delta;
    setLives(Math.max(0, n));
    if (n <= 0) gameOver(); // out of lives -> game over, restart from level 1
  },
  onBones: (cur, total) => setBones(cur, total),
  onKill: () => { session.kills++; unlock("first_blood"); },
};

function beginLevel(i) {
  camera.setViewport(renderer.vw, renderer.vh);
  game = new Game(LEVELS[i], deps, hooks);
  state = "playing";
  hideAllScreens();
  hud.classList.remove("hidden");
  audio.startMusic();
}

function startGame() {
  audio.resume();
  session.index = 0;
  session.runTime = 0;
  session.kills = 0;
  session.deaths = 0;
  session.deathsL1 = 0;
  setLives(3);
  beginLevel(0);
}

function restartLevel() {
  if (state !== "playing" && state !== "paused") return;
  beginLevel(session.index);
}

function togglePause() {
  if (state === "playing") {
    state = "paused";
    showScreen("pause");
  } else if (state === "paused") {
    state = "playing";
    hideAllScreens();
    hud.classList.remove("hidden");
  }
}

function winGame() {
  state = "win";
  screenLockUntil = time + SCREEN_INPUT_LOCK;
  game = null;
  hud.classList.add("hidden");
  audio.stopMusic();

  const timeMs = session.runTime * 1000;
  lastRun = { timeMs, kills: session.kills, deaths: session.deaths, saved: false };
  winTimeEl.textContent = formatTime(timeMs);
  winKillsEl.textContent = session.kills;

  // Reset the save UI for this fresh result.
  winBoardBody.innerHTML = "";
  winSaveMsg.classList.add("hidden");
  winSaveMsg.classList.remove("err");
  const configured = isConfigured();
  winSaveRow.classList.toggle("hidden", !configured);
  saveBtn.disabled = false;
  nameInput.disabled = false;
  nameInput.value = localStorage.getItem("trex.name") || "";

  showScreen("win");
  loadWinBoard();
  if (configured) setTimeout(() => nameInput.focus(), 60);

  // End-of-run achievements. If several are earned at once they queue and show one after
  // another (see achievements.js).
  setTimeout(() => {
    if (timeMs < 60000) unlock("skorostrel");        // sub-minute clear
    if (session.kills === 0) unlock("act_of_humanism"); // pacifist run
  }, 650);
}

// ---- Leaderboard rendering / loading / saving -------------------------------
let lastRun = null; // { timeMs, kills, deaths, saved } for the just-finished run

// Build table rows from score records. `name` is set via textContent so other
// players' names can never inject markup.
function renderBoard(tbody, rows, highlight) {
  tbody.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    if (highlight && !highlight.used &&
        row.name === highlight.name && Math.abs(row.time_ms - highlight.timeMs) < 1000) {
      tr.className = "me";
      highlight.used = true;
    }
    tr.innerHTML =
      `<td class="rank">${i + 1}</td><td class="nm"></td>` +
      `<td class="tm">${formatTime(row.time_ms)}</td>` +
      `<td class="kl">${row.kills}</td><td class="dt">${row.deaths ?? 0}</td>`;
    tr.querySelector(".nm").textContent = row.name;
    tbody.appendChild(tr);
  });
}

function boardMessage(msgEl, text, isError) {
  msgEl.textContent = text;
  msgEl.classList.remove("hidden");
  msgEl.classList.toggle("err", !!isError);
}

async function loadTitleBoard() {
  if (!isConfigured()) { boardMessage(titleBoardMsg, "Leaderboard offline"); return; }
  const rows = await fetchTop(3);
  if (rows === null) { boardMessage(titleBoardMsg, "Couldn't load leaderboard", true); return; }
  if (!rows.length) { boardMessage(titleBoardMsg, "No scores yet — be the first!"); return; }
  titleBoardMsg.classList.add("hidden");
  renderBoard(titleBoardBody, rows);
}

async function loadWinBoard(highlight) {
  if (!isConfigured()) {
    boardMessage(winBoardMsg, "Add your Supabase keys in src/core/leaderboard.js to enable this.");
    return;
  }
  const rows = await fetchTop(10);
  if (rows === null) { boardMessage(winBoardMsg, "Couldn't load leaderboard.", true); return; }
  if (!rows.length) { boardMessage(winBoardMsg, "No scores yet — be the first!"); return; }
  winBoardMsg.classList.add("hidden");
  renderBoard(winBoardBody, rows, highlight);
}

async function saveScore() {
  if (!lastRun || lastRun.saved) return;
  const name = (nameInput.value || "").trim() || "ANON";
  saveBtn.disabled = true;
  nameInput.disabled = true;
  boardMessage(winSaveMsg, "Saving…");
  const ok = await submitScore({ name, timeMs: lastRun.timeMs, kills: lastRun.kills, deaths: lastRun.deaths });
  if (ok) {
    lastRun.saved = true;
    localStorage.setItem("trex.name", name);
    boardMessage(winSaveMsg, "Saved! 🎉");
    winSaveRow.classList.add("hidden");
    loadWinBoard({ name, timeMs: lastRun.timeMs, used: false });
  } else {
    boardMessage(winSaveMsg, "Couldn't save — check your connection.", true);
    saveBtn.disabled = false;
    nameInput.disabled = false;
  }
}

function gameOver() {
  state = "gameover";
  screenLockUntil = time + SCREEN_INPUT_LOCK;
  game = null;
  hud.classList.add("hidden");
  showScreen("gameover");
  audio.stopMusic();
}

// --- Input edges (UI-level actions fire immediately) -------------------------
const input = createInput((action) => {
  audio.resume();
  if (action === "mute") {
    const muted = audio.toggleMute();
    muteBtn.classList.toggle("muted", muted);
    return;
  }
  if (action === "musicMute") {
    const muted = audio.toggleMusicMute();
    musicBtn.classList.toggle("muted", muted);
    return;
  }
  if (state === "title" || state === "gameover" || state === "win") {
    if (action === "jump" && time >= screenLockUntil) startGame();
    return;
  }
  if (action === "pause") togglePause();
  else if (action === "restart") restartLevel();
});

// --- Buttons -----------------------------------------------------------------
el("startBtn").addEventListener("click", startGame);
el("resumeBtn").addEventListener("click", togglePause);
el("restartBtn").addEventListener("click", () => { togglePause(); restartLevel(); });
el("againBtn").addEventListener("click", startGame);
el("retryBtn").addEventListener("click", startGame);
saveBtn.addEventListener("click", saveScore);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveScore(); }
});
muteBtn.addEventListener("click", () => {
  audio.resume();
  const muted = audio.toggleMute();
  muteBtn.classList.toggle("muted", muted);
});
musicBtn.addEventListener("click", () => {
  audio.resume();
  const muted = audio.toggleMusicMute();
  musicBtn.classList.toggle("muted", muted);
});

window.addEventListener("resize", () => {
  renderer.resize();
  camera.setViewport(renderer.vw, renderer.vh);
});

// --- Main loop ---------------------------------------------------------------
const loop = createLoop({
  update: (dt) => {
    time += dt;
    if (state === "playing" && game) {
      session.runTime += dt; // only counts while actively playing (not paused/screens)
      game.update(dt, input);
    }
    input.endStep();
  },
  render: (alpha) => {
    if (game) {
      game.draw(renderer, alpha);
    } else {
      // Title / win backdrop: slow auto-panning parallax. The sky gradient repaints
      // every pixel, so no separate clear() is needed.
      camera.snapTo(400 + Math.sin(time * 0.15) * 300, 240);
      background.draw(renderer, camera, time);
    }
  },
  onFrame: sampleFrame,
});

showScreen("title");
loadTitleBoard();
loop.start();

// Debug handle (harmless; used for in-browser verification).
window.__dbg = {
  get state() { return state; },
  get game() { return game; },
  session,
  input,
  audio,
  quality,
  setTier,   // force a quality tier: __dbg.setTier('low'|'med'|'high')
  setAuto,   // re-enable adaptive quality: __dbg.setAuto(true)
  unlock,             // fire an achievement toast: __dbg.unlock('first_blood')
  resetAchievements,  // forget unlocks so they can pop again
};
