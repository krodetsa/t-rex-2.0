# Changelog

## Unreleased

### Added
- **Achievements.** Steam-style achievement toasts that rise from the bottom-right, queue so they never overlap, play a chime, and persist unlocks in `localStorage` (each pops only once, ever). See `src/core/achievements.js`.
  - New achievement chime in `src/core/audio.js`, toast styling in `styles.css`, and an `#achievements` host in `index.html`.
  - Debug helpers: `__dbg.unlock(id)`, `__dbg.resetAchievements()`.
- **Adaptive quality manager** (`src/core/quality.js`). Four tiers (min/low/med/high) controlling canvas DPR, glow (`shadowBlur`) multiplier, particle counts, and background detail.
  - Refresh-rate-aware detection tracks both rAF-to-rAF frame delta (catches dropped frames → degrade) and JS work time (reveals headroom → upgrade), with hysteresis and a warm-up window.
  - Picks a conservative starting tier from `hardwareConcurrency` / `deviceMemory`.
  - The game loop now emits per-frame timing via a new `onFrame(deltaMs, workMs)` callback.
  - Debug helpers: `__dbg.setTier('min'|'low'|'med'|'high')`, `__dbg.setAuto(true)`.
- **Boss fight — final level "The Apex"** (`src/game/boss.js`, new level 6). A walled neon
  arena where you defeat a giant pterodactyl boss instead of reaching a goal.
  - The boss is a wing-flapping Pteranodon, roughly twice the T-Rex's size: it flies freely
    around the arena, repositions vertically, jumps/slams to the floor, and spits aimed
    fireballs at the player. Each of your fireballs knocks a chunk off its health bar.
  - A floating health bar tracks the boss above its head. The player dies in a single hit
    (fireball, projectile, or a bump into the boss or an enemy), same as the rest of the game.
  - Returning hazards: bouncing "flying ball" fireballs sweep the arena, and a shooter dino
    drops in from the sky once a minute.
  - The boss keeps its HP across your deaths, so the fight is a war of attrition across your
    lives. New `B` level char, aimed-projectile support, and a `bossSlam` SFX back it.
  - A ~5-second triumphant victory jingle (`audio.bossVictory()`) plays when the boss falls,
    in place of the short per-level win flourish.

### Changed
- Renderer wraps the canvas `shadowBlur` setter to centrally scale glow cost, and caps the backing-store DPR to the active quality tier.
- Background (fireflies, spores, foreground) and particle emit-counts now scale with the active quality tier.
- Minor level-1 layout tweak in `src/game/levels.js`.

### Fixed
- Level reset issue on run start.
- Game-over / win screens now ignore the jump-to-restart shortcut for 0.7s (`SCREEN_INPUT_LOCK`) so a mashed jump can't skip the screen and silently restart the whole run from level 1. Explicit button clicks are exempt.
- **Severe frame drops on Firefox.** The neon look is built on canvas `shadowBlur`, whose shadow path is far slower on Firefox — and *any* non-zero blur triggers it, so merely shrinking the radius didn't help. Added a glow-free `min` quality tier (`glow: 0` → every `shadowBlur` becomes `0`, skipping the shadow path entirely; particle/moon glow is kept via baked sprites). Firefox now starts on this tier, and an anti-oscillation ceiling stops the adaptive manager from bouncing back to a tier that already proved too slow (which would re-introduce periodic jank).
