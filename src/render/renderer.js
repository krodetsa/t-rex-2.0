// Neon rendering toolkit + canvas/viewport management.
//
// The renderer owns the canvas, handles DPR + resize, sets up the camera transform, and
// exposes a small set of "glow" primitives. The look is: bright stroke + fill + a blurry
// glow (shadowBlur), with hot elements drawn additively for a cheap bloom.

import { TILE } from "../game/level.js";

const VIEW_TILES_Y = 15; // how many tiles are visible vertically (constant framing)

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.cssW = 0;
    this.cssH = 0;
    this.zoom = 1;
    this.vw = 0; // viewport size in world px
    this.vh = 0;
    this._glowCache = new Map(); // color -> pre-blurred glow sprite (canvas)
    this.resize();
  }

  // Return (and cache) a soft radial "glow dot" sprite for a color. Baking the blur
  // into a sprite once lets us draw thousands of glowing dots per frame with cheap
  // drawImage calls instead of per-dot ctx.shadowBlur (which is ~10-20x costlier and
  // scales with device pixels). SPRITE is the sprite's half-size in its own pixels.
  glowSprite(color) {
    let spr = this._glowCache.get(color);
    if (spr) return spr;
    const S = 64; // sprite is SxS; the dot sits centered with a soft falloff
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0.0, color);
    grad.addColorStop(0.22, color);        // solid-ish hot core
    grad.addColorStop(0.5, hexToRgba(color, 0.45));
    grad.addColorStop(1.0, hexToRgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    spr = { canvas: c, half: S / 2 };
    this._glowCache.set(color, spr);
    return spr;
  }

  // Draw a glowing dot of visual core-radius `r` at (x,y). Uses a baked sprite; the
  // sprite includes the halo, so we scale it to ~2.6x the core radius. Call inside a
  // ctx.save() where globalCompositeOperation/globalAlpha are already set as desired.
  glowDot(x, y, r, color) {
    const spr = this.glowSprite(color);
    const d = r * 5.2; // sprite footprint (core ~1x, halo out to edge)
    this.ctx.drawImage(spr.canvas, x - d / 2, y - d / 2, d, d);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cssW = parent.clientWidth || window.innerWidth;
    const cssH = parent.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.zoom = cssH / (VIEW_TILES_Y * TILE);
    this.vw = cssW / this.zoom;
    this.vh = cssH / this.zoom;
  }

  // Reset transform to raw device pixels (for full-screen backgrounds / letterbox fills).
  beginScreen() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Set the world->screen transform for a given camera.
  beginWorld(camera) {
    const { ctx, dpr, zoom } = this;
    const s = zoom * dpr;
    ctx.setTransform(s, 0, 0, s, -camera.left * s, -camera.top * s);
  }

  clear(color = "#05060f") {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // --- Glow primitives (call inside a beginWorld/beginScreen transform) --------

  fillGlowRect(x, y, w, h, color, blur = 10) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  strokeGlowRect(x, y, w, h, color, width = 2, blur = 12) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  glowLine(x1, y1, x2, y2, color, width = 2, blur = 10) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  glowCircle(x, y, r, color, { blur = 12, fill = true, width = 2, additive = false } = {}) {
    const { ctx } = this;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw a path via a callback with glow. opts: { stroke, fill, width, blur, additive, close }
  neonPath(build, { stroke, fill, width = 2, blur = 12, additive = false, close = false } = {}) {
    const { ctx } = this;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    build(ctx);
    if (close) ctx.closePath();
    if (fill) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = blur;
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = blur;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Parse "#rgb", "#rrggbb", or "rgb()/rgba()" and return an rgba() string at `alpha`.
// Used to build gradient stops for baked glow sprites.
function hexToRgba(color, alpha) {
  if (color[0] === "#") {
    let h = color.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",");
    return `rgba(${(+r) | 0},${(+g) | 0},${(+b) | 0},${alpha})`;
  }
  return color;
}

export { VIEW_TILES_Y };
