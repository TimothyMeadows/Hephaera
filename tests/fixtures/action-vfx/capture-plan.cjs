'use strict';
// Independent receiving coverage index: cadence and every authored boundary,
// never a nearest-frame replacement. Native receiving compares 9-place times.
function timeKey(value) {
  const scaled = value * 1e9, lower = Math.floor(scaled), fraction = scaled - lower;
  return String(fraction === .5 ? lower + lower % 2 : Math.round(scaled));
}
function buildCapturePlan(pkg, actionId, fps = 4) {
  const action = pkg.actions.find(value => value.id === actionId);
  if (!action || fps !== 4 || !Number.isFinite(action.retireAt) || action.retireAt <= 0 || action.retireAt + .2 > 30) throw Error('Bounded declared 4fps action capture and <=30-second video required');
  const points = new Map();
  function add(time, tag) {
    if (!Number.isFinite(time) || time < 0 || time > action.retireAt) throw Error('Capture boundary exceeds authored action/drain');
    const key = timeKey(time), old = points.get(key);
    if (old) { old.time = Math.max(old.time, time); if (!old.tags.includes(tag)) old.tags.push(tag); }
    else points.set(key, {time, tags: [tag]});
  }
  add(0, 'action-start'); add(action.duration, 'motion-end'); add(action.retireAt, 'action-retire');
  for (let frame = 0; frame <= Math.ceil(action.retireAt * fps); frame++) add(Math.min(action.retireAt, frame / fps), 'cadence');
  for (const step of action.steps) { add(step.start, 'step-start'); add(step.end, 'step-end'); }
  for (const marker of action.markers) add(marker.at, 'marker');
  for (const cue of action.cues) { add(cue.start, 'cue-start'); add(cue.end, 'cue-end'); add(cue.retireAt, 'cue-retire');
    for (const layer of cue.layers) { add(layer.start, 'layer-start'); add(layer.stopAt, 'layer-stop'); add(layer.retireAt, 'layer-retire'); } }
  const required = [...points.values()].sort((a, b) => a.time - b.time), requiredTimes = required.map(value => value.time);
  for (let index = 0; index < required.length - 1; index++) if (required[index + 1].time - required[index].time > .002) add(required[index].time + Math.min(.02, (required[index + 1].time - required[index].time) / 2), 'after-boundary');
  const samples = [...points.values()].sort((a, b) => a.time - b.time);
  if (samples.length > Math.min(512, pkg.budgets.maxReviewFrames)) throw Error('Capture schedule exceeds finite review frame allowance');
  return {action, fps, requiredTimes, samples, expectedFamilies: [...new Set(action.cues.flatMap(cue => cue.layers.map(layer => layer.family)))]};
}
module.exports = {buildCapturePlan, timeKey};
