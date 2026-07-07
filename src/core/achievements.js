// Steam-style achievement toasts + unlock persistence.
//
// Achievements unlock once and are remembered in localStorage (like Steam), so the popup
// only ever appears the first time its condition is met. `unlock(id)` is idempotent — you
// can call it every time the condition holds; it no-ops after the first unlock.
//
// The toast is a small card that rises from the bottom-right corner, holds, then slides
// back out. Multiple unlocks queue so they never overlap. A short chime plays on show.

const STORE_KEY = "trex.achievements";

// accent is an "r,g,b" triplet so the CSS can build both solid rgb() and translucent
// rgba() shades without needing color-mix().
export const ACHIEVEMENTS = {
  first_blood: {
    title: "FIRST BLOOD",
    desc: "Commit your first kill.",
    icon: "🩸",
    accent: "255,61,90",
  },
  act_of_humanism: {
    title: "ACT OF HUMANISM",
    desc: "Complete the game without killing anyone.",
    icon: "🕊️",
    accent: "77,255,163",
  },
  skorostrel: {
    title: "SPEEDRUNNER",
    desc: "Beat the game in less than a minute.",
    icon: "⚡",
    accent: "255,209,64",
  },
  yebat_ti_loh: {
    title: "YEBAT' TI LOH",
    desc: "Die three times on the first level.",
    icon: "🤡",
    accent: "198,120,255",
  },
};

const HOLD_MS = 4000; // time the toast stays fully visible
const ANIM_MS = 560;  // slide in/out duration (keep in sync with the CSS transition)

let audioRef = null;
let host = null;
let unlocked = new Set();
const queue = [];
let showing = false;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) unlocked = new Set(JSON.parse(raw));
  } catch { /* ignore corrupt/blocked storage */ }
}
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...unlocked])); } catch { /* ignore */ }
}

export function initAchievements({ audio } = {}) {
  audioRef = audio || null;
  load();
  host = document.getElementById("achievements");
  if (!host) {
    host = document.createElement("div");
    host.id = "achievements";
    document.body.appendChild(host);
  }
  pump(); // flush anything queued before init (shouldn't normally happen)
}

export function isUnlocked(id) { return unlocked.has(id); }

// Mark an achievement unlocked (persisted). On the first unlock only, queue its toast and
// play the chime. Returns true if this call actually unlocked it.
export function unlock(id) {
  const meta = ACHIEVEMENTS[id];
  if (!meta || unlocked.has(id)) return false;
  unlocked.add(id);
  persist();
  queue.push({ id, meta });
  pump();
  return true;
}

// Testing helper: forget all unlocks so the toasts can fire again.
export function resetAchievements() {
  unlocked.clear();
  persist();
}

function pump() {
  if (showing || !host || !queue.length) return;
  showing = true;
  const { meta } = queue.shift();
  const card = buildCard(meta);
  host.appendChild(card);
  if (audioRef && audioRef.achievement) audioRef.achievement();

  // Force a reflow so the initial (off-screen) transform is committed before we add the
  // .show class, otherwise the browser may collapse both states into no transition.
  void card.offsetWidth;
  card.classList.add("show");

  setTimeout(() => {
    card.classList.remove("show");
    setTimeout(() => {
      card.remove();
      showing = false;
      pump(); // next queued achievement, if any
    }, ANIM_MS);
  }, HOLD_MS);
}

function buildCard(meta) {
  const card = document.createElement("div");
  card.className = "ach";
  card.style.setProperty("--accent", meta.accent);

  const icon = document.createElement("div");
  icon.className = "ach-icon";
  icon.textContent = meta.icon;

  const body = document.createElement("div");
  body.className = "ach-body";

  const label = document.createElement("div");
  label.className = "ach-label";
  label.textContent = "ACHIEVEMENT UNLOCKED";

  const title = document.createElement("div");
  title.className = "ach-title";
  title.textContent = meta.title;

  const desc = document.createElement("div");
  desc.className = "ach-desc";
  desc.textContent = meta.desc;

  body.append(label, title, desc);
  card.append(icon, body);
  return card;
}
