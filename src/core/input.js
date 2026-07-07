// Keyboard input: continuous held-state plus one-shot "just pressed" edges.
//
// Held state is polled every step (isDown). Edge events (pressed) are consumed once
// and cleared at the end of each simulation step via `endStep()`.

const MAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "jump", KeyW: "jump", Space: "jump",
  Escape: "pause",
  KeyR: "restart",
  KeyM: "mute",
  KeyN: "musicMute",
};

export function createInput(onEdge) {
  const down = Object.create(null);
  const pressed = Object.create(null); // consumed this step
  const listeners = [];

  function on(type, fn) {
    window.addEventListener(type, fn);
    listeners.push([type, fn]);
  }

  on("keydown", (e) => {
    const action = MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!down[action]) {
      pressed[action] = true;
      if (onEdge) onEdge(action); // fire immediately for UI (pause/mute/restart)
    }
    down[action] = true;
  });

  on("keyup", (e) => {
    const action = MAP[e.code];
    if (!action) return;
    e.preventDefault();
    down[action] = false;
  });

  // Release everything if focus is lost, so the player doesn't "stick".
  on("blur", () => {
    for (const k in down) down[k] = false;
  });

  return {
    isDown: (a) => !!down[a],
    justPressed: (a) => !!pressed[a],
    endStep() {
      for (const k in pressed) pressed[k] = false;
    },
    dispose() {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn);
    },
  };
}
