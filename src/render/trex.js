// Procedural neon T-Rex, drawn from primitives so it can animate:
//   - run cycle drives the two legs and a bit of body bob
//   - squash/stretch (from the player controller) scales the whole body about the feet
//   - the tail and tiny arm sway; the eye pulses
// Origin is placed at the feet; +x is "forward" (facing is applied as a flip).

const CYAN = "#37f2ff";
const MAG = "#ff3df0";
const BODY_FILL = "rgba(9,20,44,0.72)";

export function drawTrex(r, p, alpha, time) {
  const ctx = r.ctx;
  const pos = p.renderPos(alpha);
  const feetX = pos.x + p.w / 2;
  const feetY = pos.y + p.h;

  const grounded = p.grounded;
  const speed = Math.abs(p.body.vx);
  const running = grounded && speed > 12;
  const phase = p.runPhase;
  const bob = running ? Math.sin(phase * 2) * 1.2 : Math.sin(time * 2) * 0.6;

  ctx.save();
  ctx.translate(feetX, feetY);
  ctx.scale(p.facing, 1); // face left/right
  ctx.scale(p.scaleX, p.scaleY); // squash & stretch about the feet
  ctx.translate(0, bob);

  // --- Legs (behind body) ---
  drawLeg(r, -3, running, phase, grounded, 0.0);
  // --- Tail (behind body) ---
  drawTail(r, time);

  // --- Body ---
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 14;
  ctx.fillStyle = BODY_FILL;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-1, -20, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // --- Back spikes ---
  drawSpikes(r);

  // --- Head + snout ---
  drawHead(r, time);

  // --- Tiny arm (in front) ---
  drawArm(r, running, phase);

  // --- Front leg (in front of body) ---
  drawLeg(r, 4, running, phase, grounded, Math.PI);

  ctx.restore();
}

function drawLeg(r, hipX, running, phase, grounded, offset) {
  const ctx = r.ctx;
  const hipY = -13;
  let footX, footY, kneeBend;
  if (!grounded) {
    // tucked while airborne
    footX = hipX + 3;
    footY = -7;
    kneeBend = 4;
  } else if (running) {
    const s = Math.sin(phase + offset);
    const lift = Math.max(0, Math.cos(phase + offset));
    footX = hipX + s * 7;
    footY = -1 - lift * 5;
    kneeBend = 5;
  } else {
    footX = hipX;
    footY = -1;
    kneeBend = 3;
  }
  const kneeX = (hipX + footX) / 2 + kneeBend;
  const kneeY = (hipY + footY) / 2;

  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.lineTo(footX + 3, footY); // little foot
  ctx.stroke();
  ctx.restore();
}

function drawTail(r, time) {
  const ctx = r.ctx;
  const sway = Math.sin(time * 3) * 3;
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 12;
  ctx.fillStyle = BODY_FILL;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -24);
  ctx.quadraticCurveTo(-22, -20 + sway, -32, -8 + sway);
  ctx.quadraticCurveTo(-22, -12, -8, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSpikes(r) {
  const ctx = r.ctx;
  ctx.save();
  ctx.shadowColor = MAG;
  ctx.shadowBlur = 8;
  ctx.fillStyle = MAG;
  const spikes = [
    [-7, -27], [-2, -31], [3, -31], [8, -29],
  ];
  for (const [x, y] of spikes) {
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y + 3);
    ctx.lineTo(x, y - 3);
    ctx.lineTo(x + 2.5, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(r, time) {
  const ctx = r.ctx;
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 12;
  ctx.fillStyle = BODY_FILL;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  // head + snout as one path
  ctx.beginPath();
  ctx.moveTo(6, -34);
  ctx.quadraticCurveTo(16, -35, 21, -30); // top of snout
  ctx.lineTo(22, -26); // snout tip
  ctx.lineTo(15, -25); // under jaw front
  ctx.quadraticCurveTo(9, -24, 6, -27); // jaw back
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // jaw line
  ctx.save();
  ctx.strokeStyle = "rgba(55,242,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(9, -28);
  ctx.lineTo(21, -27.5);
  ctx.stroke();
  ctx.restore();

  // eye (pulsing magenta)
  const eye = 1.4 + Math.sin(time * 4) * 0.25;
  ctx.save();
  ctx.shadowColor = MAG;
  ctx.shadowBlur = 10;
  ctx.fillStyle = MAG;
  ctx.beginPath();
  ctx.arc(13, -31, eye, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArm(r, running, phase) {
  const ctx = r.ctx;
  const s = running ? Math.sin(phase + 1) * 2 : 0;
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(6, -21);
  ctx.lineTo(11, -18 + s);
  ctx.lineTo(13, -19 + s);
  ctx.stroke();
  ctx.restore();
}
