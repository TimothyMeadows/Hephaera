'use strict';
const crypto = require('node:crypto');
const GOAL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validId = value => typeof value === 'string' && value.length <= 120 && GOAL_ID.test(value);
const reference = goal => '.hephaera/.cache/goals/' + goal + '/GOAL.md';
const unavailable = goal => ({ schemaVersion: 1, goalId: goal, reference: reference(goal), available: false });

// Counts only: no task names, descriptions, links or other Goal sections leave
// this bounded, descriptor-validated read. A snapshot attributes no file edits.
function capture(root, goal, { readText }) {
  if (!validId(goal)) return undefined;
  try {
    const text = readText(root, reference(goal), 131072);
    let fence, inQueue = false, sections = 0, total = 0, completed = 0;
    const identities = new Set();
    for (const line of text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/)) {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length && /^ {0,3}(?:`+|~+)[ \t]*$/.test(line)) fence = undefined; continue; }
      if (fence) continue;
      if (/^#{1,2}\s/.test(line)) {
        inQueue = /^##[ \t]+Task Queue(?:[ \t]+#+)?[ \t]*$/i.test(line);
        if (inQueue) sections++;
        continue;
      }
      if (!inQueue || !/^(?:\d+[.)]|[-*+])[ \t]+/.test(line)) continue;
      const item = /^(?:\d+[.)]|[-*+])[ \t]+\[([ xX])\][ \t]+(.+)$/.exec(line);
      if (!item || /<task-name>|TODO task name/.test(item[2])) return unavailable(goal);
      const task = /\.hephaera\/\.cache\/tasks\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})\/TASK\.md/.exec(item[2]);
      const identity = task ? 'task:' + task[1] : 'row:' + item[2].trim();
      if (identities.has(identity) || ++total > 2000) return unavailable(goal);
      identities.add(identity); if (item[1].toLowerCase() === 'x') completed++;
    }
    if (sections !== 1) return unavailable(goal);
    return { ...unavailable(goal), available: true, total, completed, sha256: crypto.createHash('sha256').update(text).digest('hex') };
  } catch { return unavailable(goal); }
}

const signature = value => value?.available ? value.completed + '/' + value.total : 'unavailable';
function createMonitor(root, store) {
  const sessions = new Map();
  const monitor = {
    observe(sessionId, event) {
      if (!sessions.has(sessionId)) { if (sessions.size >= 32) sessions.delete(sessions.keys().next().value); sessions.set(sessionId, { goals: new Map(), polledAt: 0, through: 0 }); }
      const state = sessions.get(sessionId);
      if (event.sequence === state.through + 1) state.through = event.sequence;
      if (!event.goal) {
        if (event.category !== 'goal') return;
        const existing = [...state.goals.values()].find(goal => goal.report?.activityId === event.activityId);
        if (!existing || event.category !== 'goal') return;
        const hasSnapshot = Object.hasOwn(event, 'goalProgress');
        event = { ...existing.report, ...event, goal: existing.report.goal };
        if (!hasSnapshot) delete event.goalProgress;
      }
      let goal = state.goals.get(event.goal);
      if (!goal) {
        if (event.category !== 'goal') return;
        if (state.goals.size >= 16) {
          const retired = [...state.goals].find(([, value]) => !['running','waiting','blocked','unknown'].includes(value.report?.status) || value.report?.mode !== 'goal');
          if (retired) state.goals.delete(retired[0]);
        }
        if (state.goals.size >= 16) return;
        goal = { sequence: 0, snapshotSequence: 0 }; state.goals.set(event.goal, goal);
      }
      if (event.category === 'goal' && event.sequence > goal.sequence) { goal.report = event; goal.sequence = event.sequence; }
      if (event.goalProgress && event.sequence > goal.snapshotSequence) { goal.signature = signature(event.goalProgress); goal.snapshotSequence = event.sequence; }
    },
    restore(sessionId, cursor) {
      // Stream reconnection may resume after the original Goal declaration.
      // Rebuild only from this session's retained events, never a global Goal.
      let through = sessions.get(sessionId)?.through || 0;
      while (through < cursor) {
        const page = store.page(root, sessionId, through, Math.min(500, cursor - through));
        for (const event of page.events) monitor.observe(sessionId, event);
        if (!page.events.length) break;
        through = page.events.at(-1).sequence;
      }
    },
    poll(sessionId) {
      const state = sessions.get(sessionId);
      if (!state || Date.now() - state.polledAt < 500) return;
      state.polledAt = Date.now();
      for (const goal of state.goals.values()) {
        const report = goal.report;
        if (!report || report.mode !== 'goal' || !['running','waiting','blocked','unknown'].includes(report.status)) continue;
        try {
          const snapshot = store.goalProgress(root, report.goal);
          if (signature(snapshot) === goal.signature) continue;
          const bytes = crypto.createHash('sha256').update(sessionId + ':' + report.activityId + ':goal-progress').digest().subarray(0,16);
          bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
          const hex = bytes.toString('hex'), activityId = [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
          const result = store.emit(root, sessionId, { goal: report.goal, goalProgress: snapshot, activityId, parentId: report.activityId,
            phase: report.phase, category: 'artifact', action: 'updated', status: snapshot.available ? 'succeeded' : 'unknown', source: 'command-observed',
            owner: 'Hephaera viewer', label: snapshot.available ? 'Goal task queue snapshot' : 'Goal progress unavailable', operation: 'Observe Goal task queue' });
          if (result.recorded) { goal.signature = signature(snapshot); goal.snapshotSequence = result.event.sequence; }
        } catch { /* Passive state observation never changes Goal execution. */ }
      }
    }
  };
  return monitor;
}
module.exports = { capture, createMonitor, validId, reference, unavailable };
