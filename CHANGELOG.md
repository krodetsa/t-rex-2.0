# Changelog

## Unreleased

### Added
- **Achievements.** Steam-style achievement toasts that rise from the bottom-right, queue so they never overlap, play a chime, and persist unlocks in `localStorage` (each pops only once, ever). See `src/core/achievements.js`.
  - New achievement chime in `src/core/audio.js`, toast styling in `styles.css`, and an `#achievements` host in `index.html`.
  - Debug helpers: `__dbg.unlock(id)`, `__dbg.resetAchievements()`.
- **Adaptive quality manager** (`src/core/quality.js`). Three tiers (low/med/high) controlling canvas DPR, glow (`shadowBlur`) multiplier, particle counts, and background detail.
  - Refresh-rate-aware detection tracks both rAF-to-rAF frame delta (catches dropped frames → degrade) and JS work time (reveals headroom → upgrade), with hysteresis and a warm-up window.
  - Picks a conservative starting tier from `hardwareConcurrency` / `deviceMemory`.
  - The game loop now emits per-frame timing via a new `onFrame(deltaMs, workMs)` callback.
  - Debug helpers: `__dbg.setTier('low'|'med'|'high')`, `__dbg.setAuto(true)`.

### Changed
- Renderer wraps the canvas `shadowBlur` setter to centrally scale glow cost, and caps the backing-store DPR to the active quality tier.
- Background (fireflies, spores, foreground) and particle emit-counts now scale with the active quality tier.
- Minor level-1 layout tweak in `src/game/levels.js`.

### Fixed
- Level reset issue on run start.
- Game-over / win screens now ignore the jump-to-restart shortcut for 0.7s (`SCREEN_INPUT_LOCK`) so a mashed jump can't skip the screen and silently restart the whole run from level 1. Explicit button clicks are exempt.
