// Fixed-timestep game loop with an accumulator and render interpolation.
//
//   update(dt)   -- called 0..N times per frame at a constant dt (default 1/60 s)
//   render(alpha) -- called once per frame; alpha in [0,1] is how far we are between
//                    the previous and current simulation steps, for smooth interpolation
//                    on high-refresh displays.

export const STEP = 1 / 60; // seconds per fixed simulation step

export function createLoop({ update, render }) {
  let running = false;
  let last = 0;
  let acc = 0;
  let rafId = 0;

  function frame(now) {
    if (!running) return;
    // ms -> s, clamp large gaps (tab switch / breakpoint) to avoid spiral of death.
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    let steps = 0;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
      // Safety valve: never run away with more than a handful of catch-up steps.
      if (++steps > 5) { acc = 0; break; }
    }

    render(acc / STEP);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    get running() { return running; },
  };
}
