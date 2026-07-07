// Per-level orchestration: owns the player, entities, particles and camera; runs the
// update order and win/lose/respawn logic; draws the world (tiles + entities + player +
// particles). Screens/HUD/level-sequencing live in main.js and talk to this via hooks.

import { Level, TILE, T } from "./level.js";
import { Player } from "./player.js";
import { Bone, Fireball, Goal, Enemy, Projectile, SHOOT_INTERVAL, SHOOT_RANGE } from "./entities.js";
import { overlapsTile } from "./physics.js";
import { drawTrex } from "../render/trex.js";
import { aabb, clamp } from "../core/math.js";

const RESPAWN_DELAY = 1.0; // s of death animation before respawn
const WIN_DELAY = 0.7;
const SHOOT_COOLDOWN = 0.3; // s between the T-Rex's fireballs
const CRUMBLE_DELAY = 0.9;  // s a crumbling platform holds after you step on it

export class Game {
  constructor(plan, deps, hooks) {
    this.level = new Level(plan);
    this.audio = deps.audio;
    this.particles = deps.particles;
    this.camera = deps.camera;
    this.background = deps.background;
    this.hooks = hooks; // { onComplete, onLives, onBones, onKill }

    const fx = {
      jump: (x, y) => { this.particles.jump(x, y); this.audio.jump(); },
      land: (x, y, power) => { this.particles.land(x, y, power); if (power > 0.06) this.audio.land(); },
      step: (x, y, dir) => { this.particles.footstep(x, y, dir); this.audio.step(); },
    };
    this.player = new Player(this.level.spawn, fx);

    this._boneSpecs = [];
    this._enemySpecs = [];
    this.fireballs = [];
    this.enemies = [];
    this.projectiles = [];
    this.shootCd = 0;
    this.goal = null;
    for (const s of this.level.spawns) {
      if (s.type === "bone") this._boneSpecs.push(s);
      else if (s.type === "fireballH") this.fireballs.push(new Fireball(s, "h"));
      else if (s.type === "fireballV") this.fireballs.push(new Fireball(s, "v"));
      else if (s.type === "enemyWalk") this._enemySpecs.push({ spec: s, kind: "walker" });
      else if (s.type === "enemyShoot") this._enemySpecs.push({ spec: s, kind: "shooter" });
      else if (s.type === "goal") this.goal = new Goal(s);
    }
    this.bonesTotal = this._boneSpecs.length;
    this._spawnBones();
    this._spawnEnemies();
    this._initCrumbles();

    // Cache the lava tile columns per row for cheap ember spawning.
    this._lavaSurface = this._findLavaSurface();

    this.state = "play"; // play | dying | won
    this.timer = 0;
    this.time = 0;
    this._emberT = 0;

    this.camera.snapTo(this.player.cx, this.player.cy);
    this.camera._clamp(this.level);
    this._reportHud();
  }

  // (Re)create all bones from their spawn specs and reset the counter/goal lock.
  // Called on level start and on every respawn so a death restores collected bones.
  _spawnBones() {
    this.bones = this._boneSpecs.map((s) => new Bone(s));
    this.bonesLeft = this.bonesTotal;
    if (this.goal) this.goal.active = false;
    this._reportHud();
  }

  // (Re)create all enemies and clear any in-flight fireballs. Like bones, killed
  // enemies come back on respawn so a death restores the level to its start state.
  _spawnEnemies() {
    this.enemies = this._enemySpecs.map(({ spec, kind }) => new Enemy(spec, kind));
    this.projectiles = [];
    this.shootCd = 0;
  }

  // Scan the grid once for crumbling-platform tiles and build their live state.
  // Cells are mutated to EMPTY when they collapse and restored on respawn.
  _initCrumbles() {
    this.crumbles = [];
    this._crumbleMap = new Map();
    for (let r = 0; r < this.level.rows; r++) {
      for (let c = 0; c < this.level.cols; c++) {
        if (this.level.grid[r][c] === T.CRUMBLE) {
          const cell = { row: r, col: c, state: "idle", timer: 0 };
          this.crumbles.push(cell);
          this._crumbleMap.set(r * this.level.cols + c, cell);
        }
      }
    }
  }

  // Restore every crumbling platform (called on respawn).
  _resetCrumbles() {
    for (const c of this.crumbles) {
      c.state = "idle";
      c.timer = 0;
      this.level.grid[c.row][c.col] = T.CRUMBLE;
    }
  }

  // Trigger the platform under the player's feet, tick shaking timers, and remove
  // collapsed tiles from the grid so the player falls through.
  _updateCrumbles(dt) {
    if (!this.crumbles.length) return;
    if (this.player.grounded) {
      const pb = this.player.body;
      const footRow = Math.floor((pb.y + pb.h + 0.001) / TILE);
      const c0 = Math.floor(pb.x / TILE);
      const c1 = Math.floor((pb.x + pb.w - 1e-4) / TILE);
      for (let col = c0; col <= c1; col++) {
        const cell = this._crumbleMap.get(footRow * this.level.cols + col);
        if (cell && cell.state === "idle") {
          cell.state = "shaking";
          cell.timer = CRUMBLE_DELAY;
          this.audio.crack();
        }
      }
    }
    for (const c of this.crumbles) {
      if (c.state !== "shaking") continue;
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = "gone";
        this.level.grid[c.row][c.col] = T.EMPTY;
        this.particles.land(c.col * TILE + TILE / 2, c.row * TILE + 6, 0.6);
        this.audio.crumble();
      }
    }
  }

  _findLavaSurface() {
    const surf = [];
    for (let c = 0; c < this.level.cols; c++) {
      for (let r = 0; r < this.level.rows; r++) {
        if (this.level.grid[r][c] === T.LAVA && (r === 0 || this.level.grid[r - 1][c] !== T.LAVA)) {
          surf.push({ x: c * TILE + TILE / 2, y: r * TILE });
          break;
        }
      }
    }
    return surf;
  }

  _reportHud() {
    if (this.hooks.onBones) this.hooks.onBones(this.bonesTotal - this.bonesLeft, this.bonesTotal);
  }

  update(dt, input) {
    this.time += dt;

    // Ambient lava embers regardless of state.
    this._emberT -= dt;
    if (this._emberT <= 0 && this._lavaSurface.length) {
      this._emberT = 0.05;
      const s = this._lavaSurface[(Math.random() * this._lavaSurface.length) | 0];
      this.particles.ember(s.x, s.y);
    }

    for (const b of this.bones) b.update(dt, this.level, this.time);
    for (const f of this.fireballs) f.update(dt, this.level);
    for (const e of this.enemies) e.update(dt, this.level);
    for (const pr of this.projectiles) pr.update(dt, this.level);
    if (this.goal) this.goal.update(dt);
    this.particles.update(dt);
    this.shootCd = Math.max(0, this.shootCd - dt);

    if (this.state === "won") {
      this.timer -= dt;
      if (this.timer <= 0 && this.hooks.onComplete) { this.hooks.onComplete(); this.state = "done"; }
      return;
    }
    if (this.state === "dying") {
      this.timer -= dt;
      if (this.timer <= 0) this._respawn();
      return;
    }
    if (this.state !== "play") return;

    this.player.update(dt, input, this.level);

    // Camera follows the player center with lookahead from its horizontal velocity.
    this.camera.follow({ x: this.player.cx, y: this.player.cy }, this.player.body.vx, dt, this.level);

    // Crumbling platforms: arm the one underfoot, collapse timed-out ones.
    this._updateCrumbles(dt);

    // --- Collisions ---------------------------------------------------------
    const pb = this.player.body;
    for (const b of this.bones) {
      if (!b.collected && aabb(pb.x, pb.y, pb.w, pb.h, b.x, b.y, b.w, b.h)) {
        b.collected = true;
        this.bonesLeft--;
        this.particles.boneBurst(b.cx, b.cy);
        this.audio.bone();
        this._reportHud();
      }
    }
    this.bones = this.bones.filter((b) => !b.collected);
    if (this.goal) this.goal.active = this.bonesLeft <= 0;

    for (const f of this.fireballs) {
      if (aabb(pb.x, pb.y, pb.w, pb.h, f.body.x, f.body.y, f.w, f.h)) { this._die(); return; }
    }

    // --- Combat: T-Rex fires on Enter; shooters fire back at the T-Rex --------
    if (input.justPressed("shoot") && this.shootCd <= 0) {
      const dir = this.player.facing;
      const mx = this.player.cx + dir * 16;
      const my = this.player.body.y + 8; // roughly at the snout
      this.projectiles.push(new Projectile(mx, my, dir, "player"));
      this.shootCd = SHOOT_COOLDOWN;
      this.particles.jump(mx, my); // little muzzle spark
      this.audio.shoot();
    }
    for (const e of this.enemies) {
      if (e.kind !== "shooter") continue;
      e.shootTimer -= dt;
      const dx = this.player.cx - e.cx;
      if (e.shootTimer <= 0 && Math.abs(dx) < SHOOT_RANGE) {
        e.shootTimer = SHOOT_INTERVAL;
        const dir = dx >= 0 ? 1 : -1;
        e.dir = dir; // turn to face the T-Rex as it fires
        this.projectiles.push(new Projectile(e.cx + dir * 12, e.cy - 4, dir, "enemy"));
        this.audio.enemyShoot();
      }
    }

    // Projectiles: the T-Rex's kill enemies; enemies' kill the T-Rex.
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      if (pr.owner === "player") {
        for (const e of this.enemies) {
          if (e.alive && aabb(pr.x, pr.y, pr.w, pr.h, e.body.x, e.body.y, e.w, e.h)) {
            e.alive = false;
            pr.dead = true;
            this.particles.death(e.cx, e.cy);
            this.audio.enemyHit();
            if (this.hooks.onKill) this.hooks.onKill();
            break;
          }
        }
      } else if (aabb(pr.x, pr.y, pr.w, pr.h, pb.x, pb.y, pb.w, pb.h)) {
        this._die();
        return;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.enemies = this.enemies.filter((e) => e.alive);

    // Bumping into an enemy is lethal too.
    for (const e of this.enemies) {
      if (aabb(pb.x, pb.y, pb.w, pb.h, e.body.x, e.body.y, e.w, e.h)) { this._die(); return; }
    }

    if (overlapsTile(pb, this.level, T.LAVA)) { this._die(); return; }
    if (pb.y > this.level.height + 80) { this._die(); return; } // fell off the map

    if (this.goal && this.goal.active &&
        aabb(pb.x, pb.y, pb.w, pb.h, this.goal.x, this.goal.y, this.goal.w, this.goal.h)) {
      this._win();
    }
  }

  _die() {
    if (this.state !== "play") return;
    this.state = "dying";
    this.timer = RESPAWN_DELAY;
    this.player.dead = true;
    this.particles.death(this.player.cx, this.player.cy);
    this.audio.death();
    // lives handled by the host; wrap like the original game (0 -> back to 3).
    if (this.hooks.onLives) this.hooks.onLives(-1);
  }

  _respawn() {
    this.player.reset();
    this._spawnBones();   // collected bones come back on death
    this._spawnEnemies(); // killed enemies and stray fireballs reset too
    this._resetCrumbles(); // collapsed platforms are rebuilt
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.camera._clamp(this.level);
    this.state = "play";
  }

  _win() {
    this.state = "won";
    this.timer = WIN_DELAY;
    this.player.dead = true;
    this.particles.boneBurst(this.goal.cx, this.goal.cy);
    this.audio.win();
  }

  // ---------------------------------------------------------------- rendering
  draw(r, alpha) {
    r.clear();
    this.background.draw(r, this.camera, this.time);

    r.beginWorld(this.camera);
    this._drawTiles(r);
    this._drawCrumbles(r);
    for (const b of this.bones) b.draw(r, alpha, this.time);
    if (this.goal) this.goal.draw(r, alpha, this.time);
    for (const f of this.fireballs) f.draw(r, alpha, this.time);
    for (const e of this.enemies) e.draw(r, alpha, this.time);
    if (!this.player.dead) drawTrex(r, this.player, alpha, this.time);
    for (const pr of this.projectiles) pr.draw(r, alpha, this.time);
    this.particles.draw(r);
  }

  // Crumbling platforms are drawn here (not in the batched tile pass) so each can carry
  // its own shake offset and warning colour. Idle ones look identical to a one-way '='.
  _drawCrumbles(r) {
    if (!this.crumbles.length) return;
    const ctx = r.ctx;
    for (const c of this.crumbles) {
      if (c.state === "gone") continue;
      const x = c.col * TILE, y = c.row * TILE;
      let color = "#8fe9ff", glow = "#37f2ff", dx = 0, dy = 0;
      if (c.state === "shaking") {
        const progress = 1 - c.timer / CRUMBLE_DELAY; // 0 -> 1 as it nears collapse
        const amp = 0.6 + progress * 2.6;
        dx = Math.sin(this.time * 42) * amp;
        dy = Math.cos(this.time * 37) * amp * 0.5;
        if (progress > 0.55) {
          // about to go: flashing hot red/orange
          color = Math.sin(this.time * 30) > 0 ? "#ff4d5a" : "#ffb03d";
          glow = "#ff466e";
        } else {
          color = "#ffd23d";
          glow = "#ffa83d";
        }
      }
      ctx.save();
      ctx.translate(dx, dy);
      ctx.lineCap = "round";
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 4);
      ctx.lineTo(x + TILE - 3, y + 4);
      ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 6; i < TILE; i += 8) {
        ctx.moveTo(x + i, y + 6);
        ctx.lineTo(x + i - 3, y + 12);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Tiles are drawn in batched passes so the expensive glow (shadowBlur) neon edges are
  // stroked once for the whole screen instead of once per tile. Everything with the same
  // style is accumulated into a Path2D, then filled/stroked in a single call.
  _drawTiles(r) {
    const ctx = r.ctx;
    const lvl = this.level;
    // Only iterate tiles within the camera view (+1 margin).
    const c0 = clamp(Math.floor(this.camera.left / TILE) - 1, 0, lvl.cols - 1);
    const c1 = clamp(Math.ceil((this.camera.left + this.camera.vw) / TILE) + 1, 0, lvl.cols - 1);
    const r0 = clamp(Math.floor(this.camera.top / TILE) - 1, 0, lvl.rows - 1);
    const r1 = clamp(Math.ceil((this.camera.top + this.camera.vh) / TILE) + 1, 0, lvl.rows - 1);

    const solidFill = new Path2D();   // dark block bodies
    const gridPath = new Path2D();    // faint inner grid
    const edgePath = new Path2D();    // bright neon edges (glow)
    const onewayBar = new Path2D();   // one-way platform tops (glow)
    const onewayDash = new Path2D();  // one-way support dashes
    const lavaSurface = new Path2D(); // glowing wavy lava tops
    let hasSolid = false, hasOneway = false, hasLavaSurf = false;
    const lavaGrads = new Map();      // row-y -> cached vertical gradient

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const t = lvl.grid[row][col];
        if (t === T.EMPTY) continue;
        const x = col * TILE, y = row * TILE;
        if (t === T.SOLID) {
          hasSolid = true;
          solidFill.rect(x, y, TILE, TILE);
          gridPath.rect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          // neon edge only on exposed faces
          if (lvl.tileAt(col, row - 1) !== T.SOLID) { edgePath.moveTo(x, y); edgePath.lineTo(x + TILE, y); }
          if (lvl.tileAt(col, row + 1) !== T.SOLID) { edgePath.moveTo(x, y + TILE); edgePath.lineTo(x + TILE, y + TILE); }
          if (lvl.tileAt(col - 1, row) !== T.SOLID) { edgePath.moveTo(x, y); edgePath.lineTo(x, y + TILE); }
          if (lvl.tileAt(col + 1, row) !== T.SOLID) { edgePath.moveTo(x + TILE, y); edgePath.lineTo(x + TILE, y + TILE); }
        } else if (t === T.ONEWAY) {
          hasOneway = true;
          onewayBar.moveTo(x + 3, y + 4);
          onewayBar.lineTo(x + TILE - 3, y + 4);
          for (let i = 6; i < TILE; i += 8) {
            onewayDash.moveTo(x + i, y + 6);
            onewayDash.lineTo(x + i - 3, y + 12);
          }
        } else if (t === T.LAVA) {
          // lava body: per-row vertical gradient (cached), no shadow -> cheap.
          let grad = lavaGrads.get(y);
          if (!grad) {
            grad = ctx.createLinearGradient(0, y, 0, y + TILE);
            grad.addColorStop(0, "#ff9a3d");
            grad.addColorStop(1, "#8a1030");
            lavaGrads.set(y, grad);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, TILE, TILE);
          if (this.level.tileAt(col, row - 1) !== T.LAVA) {
            hasLavaSurf = true;
            for (let i = 0; i <= TILE; i += 4) {
              const wy = y + 2 + Math.sin((x + i) * 0.15 + this.time * 4) * 2;
              if (i === 0) lavaSurface.moveTo(x + i, wy);
              else lavaSurface.lineTo(x + i, wy);
            }
          }
        }
      }
    }

    // --- Solid blocks -------------------------------------------------------
    if (hasSolid) {
      ctx.fillStyle = "rgba(16,22,52,0.94)";
      ctx.fill(solidFill);
      ctx.strokeStyle = "rgba(55,242,255,0.10)";
      ctx.lineWidth = 1;
      ctx.stroke(gridPath);
    }
    // --- Glow passes (one shadowed stroke each) ------------------------------
    if (hasSolid) {
      ctx.save();
      ctx.shadowColor = "#37f2ff";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#37f2ff";
      ctx.lineWidth = 2;
      ctx.stroke(edgePath);
      ctx.restore();
    }
    if (hasOneway) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = "#37f2ff";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#8fe9ff";
      ctx.lineWidth = 3;
      ctx.stroke(onewayBar);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.stroke(onewayDash);
      ctx.restore();
    }
    if (hasLavaSurf) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#ff6a3d";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "#ffd08a";
      ctx.lineWidth = 2.5;
      ctx.stroke(lavaSurface);
      ctx.restore();
    }
  }
}
