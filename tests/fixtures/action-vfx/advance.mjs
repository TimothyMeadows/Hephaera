// Test-only absolute capture clock. Actor time is observed after every step;
// nominal 1/60 subtraction must not leave a named boundary unprocessed.
function nextUp(value) {
  if (value === 0) return Number.MIN_VALUE;
  const bytes = new ArrayBuffer(8), view = new DataView(bytes); view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + 1n); return view.getFloat64(0);
}
export function advancePresentationTo({target, getActors, getSceneTime, sceneStart, step}) {
  if (!Number.isFinite(target) || target < 0 || target > 60) throw Error('Bounded absolute capture time required');
  const observe = () => {
    const states = getActors(); if (states.some(value => value.state === 'paused')) throw Error('Absolute capture cannot advance a paused actor');
    const active = states.filter(value => ['playing', 'draining'].includes(value.state));
    return active.length ? Math.min(...active.map(value => value.time)) : getSceneTime() - sceneStart;
  };
  let iterations = 0, maxClockTick = Number.MIN_VALUE;
  while (observe() < target) {
    if (++iterations > 4096) throw Error('Absolute capture step budget exceeded');
    const before = observe(), sceneTime = getSceneTime(), tick = nextUp(sceneTime) - sceneTime; maxClockTick = Math.max(maxClockTick, tick);
    // A local actor remainder can be smaller than its scene clock's ULP after
    // an earlier case. One explicit representable scene tick processes the
    // exact authored transition; report the resulting roundoff, never fire it
    // early through a runtime epsilon or silently label a predecessor exact.
    step(Math.max(Math.min(1 / 60, target - before), tick));
    if (observe() <= before) throw Error('Actual capture clock made no progress');
  }
  const observedTime = observe(), roundoffSeconds = observedTime - target;
  if (roundoffSeconds > 4 * maxClockTick) throw Error('Absolute capture overshot beyond representable clock roundoff');
  return {requestedTime: target, observedTime, roundoffSeconds, maxClockTick, steps: iterations};
}
