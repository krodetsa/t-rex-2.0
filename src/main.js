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

const canvas = document.getElementById("game");
const renderer = new Renderer(canvas);
const camera = new Camera();
const background = new Background();
const particles = new Particles();
const audio = new Audio();

const el = (id) => document.getElementById(id);
const screens = { title: el("title"), pause: el("pause"), win: el("win"), gameover: el("gameover") };
const hud = el("hud");
const boneCount = el("boneCount");
const boneTotal = el("boneTotal");
const lifeCount = el("lifeCount");
const muteBtn = el("muteBtn");

const deps = { audio, particles, camera, background };
const session = { index: 0, lives: 3 };
let game = null;
let state = "title"; // title | playing | paused | win
let time = 0;

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
    const n = session.lives + delta;
    setLives(Math.max(0, n));
    if (n <= 0) gameOver(); // out of lives -> game over, restart from level 1
  },
  onBones: (cur, total) => setBones(cur, total),
};

function beginLevel(i) {
  camera.setViewport(renderer.vw, renderer.vh);
  game = new Game(LEVELS[i], deps, hooks);
  state = "playing";
  hideAllScreens();
  hud.classList.remove("hidden");
  // audio.startMusic();
}

function startGame() {
  audio.resume();
  session.index = 0;
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
  game = null;
  hud.classList.add("hidden");
  showScreen("win");
  audio.stopMusic();
}

function gameOver() {
  state = "gameover";
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
  if (state === "title" || state === "gameover" || state === "win") {
    if (action === "jump") startGame();
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
muteBtn.addEventListener("click", () => {
  audio.resume();
  const muted = audio.toggleMute();
  muteBtn.classList.toggle("muted", muted);
});

window.addEventListener("resize", () => {
  renderer.resize();
  camera.setViewport(renderer.vw, renderer.vh);
});

// --- Main loop ---------------------------------------------------------------
const loop = createLoop({
  update: (dt) => {
    time += dt;
    if (state === "playing" && game) game.update(dt, input);
    input.endStep();
  },
  render: (alpha) => {
    if (game) {
      game.draw(renderer, alpha);
    } else {
      // Title / win backdrop: slow auto-panning parallax.
      renderer.clear();
      camera.snapTo(400 + Math.sin(time * 0.15) * 300, 240);
      background.draw(renderer, camera, time);
    }
  },
});

showScreen("title");
loop.start();

// Debug handle (harmless; used for in-browser verification).
window.__dbg = {
  get state() { return state; },
  get game() { return game; },
  input,
  audio,
};
