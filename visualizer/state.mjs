export const phases = ['context', 'planning', 'work', 'verification', 'review'];
export function emptyState() { return { cursor: 0, activities: new Map(), transitions: [], owners: new Map(), counts: Object.fromEntries(phases.map(p => [p, 0])) }; }
export function applyEvent(state, event) {
  if (!event || !Number.isInteger(event.sequence) || event.sequence <= state.cursor) return state;
  if (event.sequence !== state.cursor + 1) throw new Error('A recording gap must be resolved before displaying later events.');
  const previous = state.activities.get(event.activityId);
  const owner = event.owner || 'Hephaera';
  if (!previous) {
    const last = state.owners.get(owner);
    if (event.parentId) state.transitions.push({ from: event.parentId, to: event.activityId, kind: 'parent' });
    else if (last && last !== event.activityId) state.transitions.push({ from: last, to: event.activityId, kind: 'progression' });
    state.counts[event.phase] = (state.counts[event.phase] || 0) + 1;
  }
  state.activities.set(event.activityId, { ...previous, ...event, startedAt: previous?.startedAt || (event.action === 'started' ? event.at : null), updatedAt: event.at,
    history: [...(previous?.history || []).slice(-19), { at: event.at, status: event.status, sequence: event.sequence }] });
  state.owners.set(owner, event.activityId); state.cursor = event.sequence;
  return state;
}
export function replay(events, count = events.length) {
  const state = emptyState();
  for (const event of events.slice(0, count)) applyEvent(state, event);
  return state;
}

// A mode belongs to an explicit report or its recorded parent, never to an
// inferred project-wide current workflow. Memoization bounds long ancestry.
export function modeGroups(state, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw new Error('Invalid structure page.');
  const modes = ['brainstorm', 'task', 'goal', 'gauntlet'], cache = new Map();
  const groups = new Map(modes.map(mode => [mode, []]));
  for (const activity of state.activities.values()) {
    let current = activity, mode = null; const path = [], seen = new Set();
    while (current) {
      if (cache.has(current.activityId)) { mode = cache.get(current.activityId); break; }
      if (modes.includes(current.mode)) { mode = current.mode; break; }
      if (seen.has(current.activityId)) break;
      seen.add(current.activityId); path.push(current.activityId);
      current = state.activities.get(current.parentId);
    }
    for (const id of path) cache.set(id, mode);
    cache.set(activity.activityId, mode);
    if (mode) groups.get(mode).push(activity);
  }
  return modes.filter(mode => groups.get(mode).length).map(mode => ({ mode, total: groups.get(mode).length, activities: groups.get(mode).slice(-limit) }));
}
