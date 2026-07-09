# T‑REX // NEON RUN

<img width="1909" height="958" alt="image" src="https://github.com/user-attachments/assets/93459b53-d2f0-415b-8b71-5d77d8dc5c99" />


A neon, synthwave‑flavoured T‑Rex platformer that runs entirely in the browser. Sprint,
jump and blast fireballs through six hand‑authored levels of glowing jungle - then face a
giant wing‑flapping pterodactyl in the final boss arena.

Everything is procedural: the graphics are drawn from primitives with canvas glow, the
music and every sound effect are synthesized live with the Web Audio API, and there are
**no build tools, no frameworks and no dependencies**, just vanilla ES modules.

**RAWWWR OR DIE.**

## Play

The game is a static site, but ES modules must be served over HTTP (opening `index.html`
straight from disk won't work). Start any static server from the project root:

```bash
# Included tiny no‑cache dev server (Python 3)
python3 .devserver.py            # serves on http://127.0.0.1:8123
python3 .devserver.py 8080       # ...or pick a port

# Or use anything else you like
python3 -m http.server 8000
npx serve
```

Then open the printed URL in your browser.

## Controls

| Action | Keys |
| --- | --- |
| Move | `←` `→` / `A` `D` |
| Jump (hold for higher) | `Space` / `↑` / `W` |
| Shoot fireball | `Enter` |
| Restart level | `R` |
| Pause | `Esc` |
| Toggle sound | `M` |
| Toggle music | `N` |

Collect every bone in a level to open the exit portal. On the final level, defeat the boss
to win.

## Features

- **Six hand‑authored levels** of increasing difficulty (movement warm‑up → lava gauntlets →
  vertical towers), capped by a boss fight.
- **Boss fight - "The Apex".** A giant neon pterodactyl that flies, repositions, jumps and
  slams the floor, and spits aimed fireballs. Chip down its health bar while dodging sweeping
  fireball hazards and shooter dinos that drop from the sky. Beat it for a triumphant ~5s
  victory jingle.
- **Tuned platforming feel:** acceleration/friction, variable‑height jumps, coyote time, jump
  buffering, asymmetric gravity with an apex hang, and squash‑&‑stretch.
- **Procedural neon rendering** with additive bloom and a parallax jungle backdrop (moon,
  mist, canopy, ferns, fireflies, drifting spores, hanging vines).
- **Fully synthesized audio** - SFX and looping background music generated in‑browser with
  Web Audio; no audio files, no network.
- **Adaptive quality manager** that watches real frame timing and steps quality up/down across
  four tiers (`min`/`low`/`med`/`high`) so the game stays smooth on weak hardware. Includes a
  glow‑free floor tier and Firefox‑specific handling (see [Performance](#performance)).
- **Steam‑style achievements** with pop‑up toasts, persisted in `localStorage`.
- **Optional online leaderboard** (fastest completion time) backed by Supabase.

## Achievements

| Achievement | How to unlock |
| --- | --- |
| 🩸 First Blood | Get your first kill |
| 🕊️ Act of Humanism | Finish the game without killing anyone |
| ⚡ SPEEDRUNNER | Beat the game in under a minute |
| 🤡 Yebat' Ti Loh | Die three times on the first level |

Unlocks are remembered in `localStorage`, so each toast only ever appears once.

## Project structure

```
index.html          Canvas, HUD, screens (title / pause / win / game‑over)
styles.css          Neon UI, CRT overlays, achievement toasts
.devserver.py       Tiny no‑cache static server for local dev
src/
  main.js           Bootstrap + app state machine; wires everything together
  core/
    loop.js         Fixed‑timestep game loop (+ per‑frame timing hook)
    input.js        Keyboard input (held state + one‑shot edges)
    math.js         Small math helpers (clamp, lerp, smoothDamp, aabb, …)
    rng.js          Seeded RNG
    audio.js        Synthesized SFX (Web Audio)
    music.js        Looping background‑music sequencer
    quality.js      Adaptive quality manager
    achievements.js Achievement unlocks + toast queue
    leaderboard.js  Supabase leaderboard client
  game/
    level.js        ASCII level parser → tile grid + spawn specs
    levels.js       The six hand‑authored level plans
    physics.js      AABB‑vs‑tilemap collision (one‑way platforms, sub‑stepping)
    player.js       T‑Rex controller (all the "game feel")
    game.js         Per‑level orchestration, collisions, win/lose, boss logic
    boss.js         The pterodactyl boss (AI + procedural rendering)
    entities.js     Bones, fireballs, goal portal, enemy dinos, projectiles
  render/
    renderer.js     Canvas/viewport, camera transform, neon glow primitives
    camera.js       Smooth follow camera with lookahead + deadzone
    background.js    Parallax neon jungle backdrop
    trex.js         Procedural T‑Rex drawing
    particles.js    Pooled additive particle system
```

## Performance

The neon look leans entirely on canvas `shadowBlur` (glow), which is cheap on Chromium GPUs
but very expensive on Firefox - and any non‑zero blur triggers Firefox's slow shadow path.
The adaptive quality manager (`src/core/quality.js`) handles this:

- Four tiers control canvas DPR, a global glow multiplier, particle counts and background
  detail. Detection tracks both rAF‑to‑rAF frame delta (dropped frames → degrade) and JS work
  time per frame (spare headroom → upgrade), with hysteresis and a warm‑up window.
- The `min` tier sets glow to `0`, so every `shadowBlur` collapses to `0` and the canvas skips
  the shadow path entirely; particle/moon glow is preserved via baked sprite textures.
- Firefox starts on the `min` tier, and an anti‑oscillation ceiling stops the manager from
  repeatedly retrying a tier that already proved too slow.

You can override quality from the console via the debug handle:

```js
__dbg.setTier('min' | 'low' | 'med' | 'high');  // force a tier (disables auto)
__dbg.setAuto(true);                             // re‑enable adaptive quality
```

The `window.__dbg` object also exposes the current `game`, `session`, `audio`, and
achievement helpers (`__dbg.unlock(id)`, `__dbg.resetAchievements()`).

## Leaderboard (optional)

The win screen shows a global "fastest time" leaderboard backed by
[Supabase](https://supabase.com/)'s auto‑generated PostgREST API. It's optional - with no
backend configured, the game plays normally and simply shows "Leaderboard offline".

To enable your own:

1. Create a Supabase project and a `scores` table:

   | column | type | notes |
   | --- | --- | --- |
   | `id` | `int8` | identity / primary key |
   | `name` | `text` | player name (≤ 20 chars) |
   | `time_ms` | `int8` | completion time in ms (ranked ascending) |
   | `kills` | `int4` | enemies slain |
   | `deaths` | `int4` | deaths that run |
   | `created_at` | `timestamptz` | default `now()` |

2. Enable Row Level Security and add policies allowing anonymous `select` and `insert`.
3. Put your project URL and anon (publishable) key in `src/core/leaderboard.js`.

Scores are ranked by fastest `time_ms`.

## Tech

Vanilla JavaScript (ES modules), HTML5 Canvas 2D, Web Audio API. No build step, no bundler,
no runtime dependencies.

