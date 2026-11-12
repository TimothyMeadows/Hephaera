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
  state.activities.set(event.activityId, { ...previous, ...event, blocker: event.blocker ?? (['waiting','blocked'].includes(event.status) ? previous?.blocker : undefined), startedAt: previous?.startedAt || (event.action === 'started' ? event.at : null), updatedAt: event.at,
    history: [...(previous?.history || []).slice(-19), { at: event.at, status: event.status, sequence: event.sequence }] });
  state.owners.set(owner, event.activityId); state.cursor = event.sequence;
  return state;
}
export function replay(events, count = events.length) {
  const state = emptyState();
  for (const event of events.slice(0, count)) applyEvent(state, event);
  return state;
}

export function activityText(activity) {
  const context = activity.taskContext?.taskId === activity.task ? activity.taskContext : undefined;
  return { title: context?.title || activity.label, summary: context?.summary, operation: activity.operation || activity.label, context };
}

// Status describes an observed activity. A successful checkpoint/command never
// establishes task completion; only an explicit task report can describe that.
export function currentWork(state, limit = 3) {
  const groups = new Map(), active = new Set(['running','waiting','blocked']);
  for (const activity of state.activities.values()) {
    if (!activity.task) continue;
    if (!groups.has(activity.task)) groups.set(activity.task, []);
    groups.get(activity.task).push(activity);
  }
  return [...groups.entries()].map(([task, activities]) => {
    activities.sort((a,b) => b.sequence - a.sequence);
    const latest = activities[0], current = activities.find(a => a.category === 'task') || activities.find(a => active.has(a.status)) || latest;
    const snapshot = activities.find(a => activityText(a).context), text = activityText(snapshot || latest);
    return { task, latest, current, title: text.context?.title || task, summary: text.summary, recordedContext: !!text.context };
  }).sort((a,b) => Number(active.has(b.current.status)) - Number(active.has(a.current.status)) || b.latest.sequence - a.latest.sequence).slice(0, limit);
}

// Whole-Goal state comes only from explicit Goal reports. Queue snapshots are
// observations of declared checkbox state, never inferred command completion.
export function goalProgress(state) {
  const reports = new Map(), snapshots = new Map();
  for (const activity of state.activities.values()) {
    if (activity.category === 'goal' && activity.mode === 'goal') {
      const key = activity.goal || activity.activityId;
      if (!reports.has(key) || reports.get(key).sequence < activity.sequence) reports.set(key, activity);
    }
    if (activity.goalProgress && (!snapshots.has(activity.goal) || snapshots.get(activity.goal).sequence < activity.sequence)) snapshots.set(activity.goal, activity);
  }
  return [...reports.values()].filter(report => ['running','waiting','blocked','unknown'].includes(report.status)).map(report => {
    const snapshot = snapshots.get(report.goal), progress = snapshot?.goalProgress;
    return { report, snapshot, available: !!progress?.available, ...(progress?.available ? {
      completed: progress.completed, total: progress.total, remaining: progress.total - progress.completed,
      percent: progress.total ? Math.floor(progress.completed / progress.total * 100) : 0
    } : {}) };
  });
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
