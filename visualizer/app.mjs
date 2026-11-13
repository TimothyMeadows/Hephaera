import { emptyState, applyEvent, replay, phases, modeGroups, activityText, currentWork, goalProgress } from './state.mjs';
const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
let sessionId = fragment.get('session'), token = fragment.get('token') || sessionStorage.getItem('hephaera-viewer-token');
if (token) sessionStorage.setItem('hephaera-viewer-token', token);
history.replaceState(null, '', sessionId ? '#session=' + encodeURIComponent(sessionId) : '/');
let events = [], liveState = emptyState(), state = liveState, metadata, selected, controller, playback, zoom = 1, list = false, visibleEvents = 60, visibleActivities = 25, historyOffset = 0;
let following = true, generation = 0, connected = false;
let streaming = false, retryTimer, retryDelay = 2000;
const expanded = new Set(phases), shown = Object.fromEntries(phases.map(p => [p, 5]));
const structureOpen = new Map(); let structureLimit = 25;
const headers = () => ({ Authorization: 'Bearer ' + token });
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
function svg(tag, attributes = {}, text) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; }
const time = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not reported';
const shorten = (value, length = 28) => value.length > length ? value.slice(0, length - 1) + '…' : value;
function notice(message) { if ($('notice').textContent !== message) $('notice').textContent = message; if ($('notice').hidden !== !message) $('notice').hidden = !message; }
function connection(text, style = '') { if ($('connection').textContent !== text) $('connection').textContent = text; const name = 'badge ' + style; if ($('connection').className !== name) $('connection').className = name; }
async function get(route) { const response = await fetch(route, { headers: headers(), cache: 'no-store' }); if (!response.ok) throw new Error(response.status === 401 ? 'Open this viewer through Hephaera startup to authorize the local connection.' : 'Session metadata is unavailable.'); return response.json(); }
async function sessions(append = false) {
  const result = await get('/api/sessions?offset=' + (append ? historyOffset : 0));
  if (!append) { $('sessions').replaceChildren(); historyOffset = 0; }
  for (const item of result.sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const button = element('button', 'session' + (item.id === sessionId ? ' active' : ''));
    button.dataset.session = item.id; button.setAttribute('aria-current', item.id === sessionId ? 'true' : 'false');
    button.append(element('b', '', item.label), element('small', '', item.host.toUpperCase() + ' · ' + new Date(item.createdAt).toLocaleDateString() + ' · ' + (item.ended ? 'Ended' : 'Open')));
    button.addEventListener('click', () => selectSession(item.id)); $('sessions').append(button);
  }
  historyOffset += result.sessions.length; $('more-sessions').hidden = historyOffset >= result.total;
  if (!sessionId && result.sessions[0]) await selectSession(result.sessions[0].id);
}
async function selectSession(id) {
  generation++; const ownGeneration = generation; controller?.abort(); clearInterval(playback); playback = null; $('play').textContent = '▶';
  clearTimeout(retryTimer); retryTimer = null; retryDelay = 2000; streaming = false;
  sessionId = id; events = []; liveState = emptyState(); state = liveState; selected = null; metadata = null; following = true; connected = false; visibleActivities = 25; visibleEvents = 60;
  history.replaceState(null, '', '#session=' + id);
  for (const button of $('sessions').children) { button.classList.toggle('active', button.dataset.session === id); button.setAttribute('aria-current', button.dataset.session === id ? 'true' : 'false'); }
  render(); connection('Connecting');
  try {
    const initial = await get('/api/sessions/' + id + '/snapshot');
    if (ownGeneration !== generation) return;
    metadata = initial; $('session-title').textContent = initial.session.label;
    for (const event of initial.events) { events.push(event); applyEvent(liveState, event); }
    render(); stream(ownGeneration);
  } catch (error) { notice(error.message); connection('Unavailable', 'offline'); }
}
async function stream(ownGeneration) {
  if (ownGeneration !== generation || streaming) return;
  streaming = true;
  const ownController = new AbortController(); controller = ownController;
  try {
    const response = await fetch('/api/sessions/' + sessionId + '/events?after=' + liveState.cursor, { headers: headers(), signal: ownController.signal, cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error('Activity stream unavailable.');
    connected = true; updateMode();
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    while (ownGeneration === generation) {
      const { value, done } = await reader.read(); if (done) throw new Error('Viewer disconnected; recorded session status is unchanged.');
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error('Activity stream exceeded its bound.');
      let boundary;
      let changed = false;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const kind = block.split('\n').find(line => line.startsWith('event: '))?.slice(7);
        const data = block.split('\n').find(line => line.startsWith('data: '))?.slice(6);
        if (!data) continue;
        const payload = JSON.parse(data);
        if (kind === 'activity' && payload.sequence > liveState.cursor) { applyEvent(liveState, payload); events.push(payload); changed = true; }
        else if (kind === 'metadata') { metadata = payload; changed = true; }
        else if (kind === 'unavailable') throw new Error(payload.error);
      }
      if (following) state = liveState;
      if (changed) { retryDelay = 2000; scheduleRender(); }
    }
  } catch (error) {
    ownController.abort();
    if (ownGeneration !== generation || error.name === 'AbortError') return;
    connected = false; updateMode(); notice(error.message + ' Reconnecting without marking work complete.');
    if (!document.hidden) { const delay = retryDelay; retryDelay = Math.min(30000,retryDelay * 2); retryTimer = setTimeout(() => { retryTimer = null; stream(ownGeneration); }, delay); }
  } finally { if (controller === ownController) streaming = false; }
}
let renderPending = false, renderTimer, lastRenderAt = 0;
function scheduleRender() {
  renderPending = true;
  if (document.hidden || renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = -1; requestAnimationFrame(() => { renderTimer = null; if (document.hidden) return; renderPending = false; render(); }); }, Math.max(0,100 - (performance.now() - lastRenderAt)));
}
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('viewer-hidden', document.hidden);
  if (document.hidden) { clearTimeout(retryTimer); retryTimer = null; }
  if (document.hidden && playback) { clearInterval(playback); playback = null; $('play').textContent = '▶'; }
  if (!document.hidden && renderPending) { renderPending = false; scheduleRender(); }
  if (!document.hidden && !connected && sessionId && !retryTimer) stream(generation);
});
document.documentElement.classList.toggle('viewer-hidden', document.hidden);
function activate(node, action) { node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.addEventListener('click', action); node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } }); }
function workOverview() {
  const groups = currentWork(state), root = $('current-work'); root.replaceChildren(); $('current-work-panel').hidden = !groups.length;
  for (const group of groups) {
    const button = element('button', 'work-card'); button.dataset.task = group.task; button.dataset.focusKey = 'task-' + group.task;
    const taskStatus = { running:'Task in progress',waiting:'Task waiting',blocked:'Task blocked',succeeded:'Task completed',failed:'Task failed',cancelled:'Task cancelled',unknown:'Task status unknown' };
    const status = group.current.category === 'task' ? taskStatus[group.current.status] + ' · ' + group.current.source : 'Activity ' + group.current.status;
    button.append(element('span', 'work-status ' + group.current.status, status), element('strong', 'work-title', group.title));
    button.append(element('span', 'work-purpose', group.summary || (group.recordedContext ? 'No purpose in this recorded task snapshot.' : 'Task details were not recorded with this activity.')));
    button.append(element('span', 'work-operation', activityText(group.latest).operation + ' · ' + group.latest.status), element('small', 'muted', time(group.latest.updatedAt) + ' · ' + group.latest.source));
    button.addEventListener('click', () => { selected = group.latest.activityId; render(); $('details').scrollIntoView({ block: 'nearest' }); }); root.append(button);
  }
}
function goalOverview() {
  const groups = goalProgress(state), root = $('goal-progress'); root.replaceChildren(); $('goal-progress-panel').hidden = !groups.length;
  for (const group of groups) {
    const card = element('article', 'goal-progress-card'); card.dataset.goalActivity = group.report.activityId;
    const heading = element('button', 'goal-progress-title', group.report.label); heading.dataset.focusKey = 'goal-' + group.report.activityId;
    heading.addEventListener('click', () => { selected = group.report.activityId; render(); $('details').scrollIntoView({block:'nearest'}); });
    card.append(heading, element('span', 'goal-progress-status', group.report.status));
    if (group.available) {
      const text = group.completed + ' of ' + group.total + ' tasks completed';
      const counts = element('div', 'goal-progress-counts'); counts.append(element('strong', '', text), element('span', '', group.total ? group.percent + '%' : 'No tasks queued'));
      const progress = element('progress'); progress.max = group.total || 1; progress.value = group.completed;
      progress.setAttribute('aria-label', group.report.label); progress.setAttribute('aria-valuetext', text + '; ' + group.remaining + ' remaining');
      card.append(counts, progress, element('p', 'goal-progress-remaining', group.remaining + ' remaining / ' + group.total + ' total'));
      card.append(element('small', 'muted', 'Queue snapshot ' + time(group.snapshot.updatedAt) + (following ? '' : ' · replay')));
    } else card.append(element('p', 'goal-progress-unavailable', 'Progress unavailable'), element('small', 'muted', group.report.goal ? 'The linked Goal task queue could not be read.' : 'This Goal has no recorded queue link.'));
    root.append(card);
  }
}
function titleLines(value, width = 31) {
  const words = value.split(/\s+/), lines = [''];
  for (const word of words) { const index = lines.length - 1; if (lines[index] && (lines[index] + ' ' + word).length > width) lines.push(word); else lines[index] += (lines[index] ? ' ' : '') + word; }
  return lines.slice(0,2).map((line,index) => shorten(index === 1 ? lines.slice(1).join(' ') : line,width));
}
function canvas() {
  const root = $('canvas'); root.replaceChildren(); const positions = new Map(), nodes = [], byPhase = new Map(phases.map(p => [p, []]));
  for (const activity of state.activities.values()) byPhase.get(activity.phase)?.push(activity);
  let height = 265;
  for (const [index, phase] of phases.entries()) {
    const x = 22 + index * 274, activities = byPhase.get(phase), limit = expanded.has(phase) ? shown[phase] : 0;
    const visible = activities.slice(-limit || activities.length);
    const group = svg('g', { class: 'stage-toggle', 'data-focus-key': 'phase-' + phase, 'aria-label': phase + ', ' + activities.length + ' activities', 'aria-expanded': expanded.has(phase) });
    group.append(svg('rect', { x, y: 24, width: 250, height: 82, rx: 10, class: 'stage-head' + (activities.some(a => a.status === 'running') ? ' active' : '') }),
      svg('text', { x: x + 17, y: 45, class: 'stage-number' }, '0' + (index + 1)), svg('text', { x: x + 17, y: 70, class: 'stage-label' }, phase[0].toUpperCase() + phase.slice(1)),
      svg('text', { x: x + 17, y: 91, class: 'stage-count' }, activities.length + (activities.length === 1 ? ' activity · ' : ' activities · ') + (expanded.has(phase) ? 'collapse −' : 'expand +')));
    activate(group, () => { expanded.has(phase) ? expanded.delete(phase) : expanded.add(phase); canvas(); root.querySelectorAll('.stage-toggle')[index]?.focus(); }); nodes.push(group);
    let nextY = 136;
    if (expanded.has(phase)) for (const activity of visible) {
      const text = activityText(activity), cardHeight = text.context ? 113 : 72, y = nextY; nextY += cardHeight + 19;
      height = Math.max(height, nextY + 34); positions.set(activity.activityId, { x, y, height: cardHeight });
      const node = svg('g', { class: 'activity-node', 'data-activity': activity.activityId, 'data-focus-key': 'activity-' + activity.activityId, 'aria-label': text.title + ', ' + text.operation + ', ' + activity.status + ', ' + activity.source });
      node.append(svg('rect', { x, y, width: 250, height: cardHeight, rx: 9, class: 'activity-card ' + activity.status + (activity.activityId === selected ? ' selected' : '') }),
        svg('circle', { cx: x + 17, cy: y + 20, r: 3, class: 'status-dot ' + activity.status }),
        svg('title', {}, [text.title,text.operation,text.summary,activity.status,activity.source].filter(Boolean).join(' · ')));
      if (text.context) {
        for (const [lineIndex,line] of titleLines(text.title).entries()) node.append(svg('text', { x: x + 29, y: y + 24 + lineIndex * 16, class: 'activity-title' }, line));
        node.append(svg('text', { x: x + 16, y: y + 61, class: 'activity-operation' }, shorten(text.operation,36)),
          svg('text', { x: x + 16, y: y + 79, class: 'activity-subtitle' }, shorten(text.summary || activity.task,38)),
          svg('text', { x: x + 16, y: y + 99, class: 'activity-subtitle' }, activity.status + ' · ' + activity.source));
      } else node.append(svg('text', { x: x + 29, y: y + 24, class: 'activity-title' }, shorten(text.title,30)),
        svg('text', { x: x + 16, y: y + 44, class: 'activity-subtitle' }, shorten([activity.mode, activity.task || activity.owner || activity.category].filter(Boolean).join(' · '),37)),
        svg('text', { x: x + 16, y: y + 61, class: 'activity-subtitle' }, activity.status + ' · ' + activity.source));
      activate(node, () => { selected = activity.activityId; render(); root.querySelector('[data-activity="' + selected + '"]')?.focus(); }); nodes.push(node);
    }
    if (expanded.has(phase) && activities.length > limit) {
      const more = svg('text', { x: x + 16, y: nextY - 8, class: 'more-label', 'data-focus-key': 'more-' + phase }, 'Show ' + Math.min(10, activities.length - limit) + ' more activities');
      activate(more, () => { shown[phase] += 10; canvas(); (root.querySelector('[data-focus-key="more-' + phase + '"]') || root.querySelector('[data-focus-key="phase-' + phase + '"]'))?.focus(); }); nodes.push(more);
    }
    root.append(svg('line', { x1: x + 125, y1: 109, x2: x + 125, y2: height - 20, class: 'stage-guide' }));
  }
  for (const edge of state.transitions) {
    const from = positions.get(edge.from), to = positions.get(edge.to); if (!from || !to) continue;
    const same = from.x === to.x, sx = same ? from.x + 240 : from.x + 250, sy = from.y + from.height / 2, tx = same ? to.x + 240 : to.x, ty = to.y + to.height / 2;
    const bend = same ? 70 : Math.max(35, Math.abs(tx - sx) / 2);
    const path = svg('path', { d: `M ${sx} ${sy} C ${sx + bend} ${sy}, ${same ? tx + bend : tx - bend} ${ty}, ${tx} ${ty}`, class: 'edge ' + edge.kind + (state.activities.get(edge.to)?.status === 'running' && following && connected ? ' active' : '') });
    path.append(svg('title', {}, edge.kind === 'parent' ? 'Parent activity' : 'Activity progression; no dependency inferred')); root.append(path);
  }
  root.append(...nodes); root.setAttribute('viewBox', `0 0 1390 ${height}`); root.style.width = zoom * 100 + '%'; root.style.minWidth = Math.round(940 * zoom) + 'px'; root.style.maxHeight = 'none';
}
function details() {
  const target = $('details'), activity = state.activities.get(selected); target.replaceChildren();
  if (!activity) { target.append(element('p', 'muted', 'Select an activity to inspect its owner, status, and evidence.')); return; }
  const text = activityText(activity);
  target.append(element('h3', 'detail-title', text.title), element('span', 'detail-source', activity.source));
  if (text.context) { target.append(element('p', 'detail-operation', text.operation)); if (text.summary) target.append(element('p', 'task-purpose', text.summary)); }
  const dl = element('dl');
  const values = { Stage: activity.phase, Status: activity.status, Owner: activity.owner || 'Hephaera', Mode: activity.mode, Task: activity.task, Role: activity.role, Skill: activity.skill, Operation: activity.operation,
    Started: time(activity.startedAt), Updated: time(activity.updatedAt), Duration: activity.durationMs !== undefined ? (activity.durationMs / 1000).toFixed(2) + ' s' : 'Not reported', 'Exit code': activity.exitCode !== undefined ? String(activity.exitCode) : undefined, Blocker: activity.blocker,
    'Task record': text.context?.reference, 'Task description': activity.task && !text.context ? 'Not recorded with this activity' : undefined };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) dl.append(element('dt', '', key), element('dd', '', value));
  if (activity.parentId) {
    const parent = state.activities.get(activity.parentId), value = element('dd');
    if (parent) { const button = element('button', '', activityText(parent).title); button.addEventListener('click', () => { selected = parent.activityId; render(); }); value.append(button); }
    else value.textContent = 'Not present in the current recording or replay position';
    dl.append(element('dt', '', 'Recorded parent'), value);
  }
  if (activity.evidence?.length) { const dd = element('dd'); for (const ref of activity.evidence) dd.append(element('code', '', ref), element('br')); dl.append(element('dt', '', 'Evidence'), dd); }
  target.append(dl);
}
function timeline() {
  const root = $('timeline'); root.replaceChildren();
  const available = following ? events : events.slice(0, state.cursor);
  for (const event of available.slice(-visibleEvents).reverse()) {
    const li = element('li', 'timeline-item'), button = element('button'); button.dataset.focusKey = 'event-' + event.sequence;
    const text = activityText(event), name = element('span', 'event-text'); name.append(element('span','',text.title));
    if (text.context) name.append(element('small','event-operation',text.operation));
    button.append(element('time', '', time(event.at)), element('i', 'timeline-dot ' + event.source), name, element('span', 'event-state', event.status));
    button.addEventListener('click', () => { selected = event.activityId; render(); }); li.append(button); root.append(li);
  }
  $('more-events').hidden = available.length <= visibleEvents; $('timeline-count').textContent = available.length + ' recorded events';
}
function listView() {
  if (!list) return;
  const table = element('table'), head = element('tr'); for (const text of ['Activity','Stage','Owner','Status','Source']) head.append(element('th', '', text));
  const thead = element('thead'); thead.append(head); table.append(thead); const body = element('tbody');
  const activities = [...state.activities.values()];
  for (const activity of activities.slice(-visibleActivities).reverse()) {
    const text = activityText(activity), row = element('tr'), name = element('td'), button = element('button', '', text.title); button.dataset.focusKey = 'list-' + activity.activityId; button.addEventListener('click', () => { selected = activity.activityId; details(); }); name.append(button);
    if (text.context) { name.append(element('small','event-operation',text.operation)); if (text.summary) name.append(element('p','list-purpose',text.summary)); } row.append(name);
    for (const text of [activity.phase, activity.owner || 'Hephaera', activity.status, activity.source]) row.append(element('td', '', text)); body.append(row);
  }
  table.append(body); $('list-view').replaceChildren(element('p', 'muted', 'Showing ' + Math.min(visibleActivities, activities.length) + ' of ' + activities.length + ' activities'), table);
  if (visibleActivities < activities.length) {
    const more = element('button', 'quiet', 'Show older activities'); more.dataset.focusKey = 'more-list';
    more.addEventListener('click', () => { visibleActivities += 25; listView(); ($('list-view').querySelector('[data-focus-key="more-list"]') || $('list-toggle')).focus(); }); $('list-view').append(more);
  }
}
function updateMode() {
  $('replay-mode').textContent = following ? 'LIVE VIEW' : 'SESSION REPLAY';
  const catchingUp = connected && metadata && liveState.cursor < metadata.total;
  connection(!following ? 'Replay' : !connected ? 'Reconnecting' : catchingUp ? 'Loading session history' : metadata?.ended ? 'Session ended' : 'Live · session open', following && connected && !catchingUp && !metadata?.ended ? 'live' : 'offline');
}
function structures() {
  const groups = modeGroups(state, structureLimit), root = $('structure');
  $('structure-panel').hidden = !groups.length; root.replaceChildren();
  for (const group of groups) {
    const section = element('details', 'mode-structure'); section.dataset.mode = group.mode;
    section.open = structureOpen.get(group.mode) ?? true;
    section.addEventListener('toggle', () => structureOpen.set(group.mode, section.open));
    const summary = element('summary', '', group.mode[0].toUpperCase() + group.mode.slice(1) + ' · ' + group.total + ' recorded activities');
    summary.dataset.focusKey = 'mode-' + group.mode; section.append(summary);
    const list = element('ul', 'structure-tree'), visible = new Map(group.activities.map(activity => [activity.activityId, activity])), children = new Map(), visited = new Set();
    for (const activity of group.activities) {
      if (!children.has(activity.parentId)) children.set(activity.parentId, []);
      children.get(activity.parentId).push(activity);
    }
    const appendTree = (start, unresolved = false) => {
      const stack = [{ activity: start, target: list, unresolved }];
      while (stack.length) {
        const { activity, target, unresolved } = stack.pop(); if (visited.has(activity.activityId)) continue; visited.add(activity.activityId);
        const item = element('li', 'structure-item'), button = element('button', 'structure-activity', activityText(activity).title);
        item.dataset.structureActivity = activity.activityId; button.dataset.focusKey = 'structure-' + activity.activityId;
        button.addEventListener('click', () => { selected = activity.activityId; render(); }); item.append(button);
        item.append(element('small', '', [activity.category, activity.owner || 'Hephaera', activity.status, activity.source, activity.role, activity.skill, activity.task].filter(Boolean).join(' · ')));
        if (unresolved) item.append(element('small', 'muted', 'Parent relationship could not be rooted. Inspect the activity for its recorded parent.'));
        else if (activity.parentId && !visible.has(activity.parentId)) item.append(element('small', 'muted', 'Parent is outside this mode or page.'));
        target.append(item);
        const descendants = children.get(activity.activityId) || [];
        if (descendants.length) { const nested = element('ul'); item.append(nested); for (const child of [...descendants].reverse()) stack.push({ activity: child, target: nested, unresolved: false }); }
      }
    };
    for (const activity of group.activities) if (!visible.has(activity.parentId)) appendTree(activity);
    // Broken/cyclic producer reports stay visible without inventing a root.
    for (const activity of group.activities) if (!visited.has(activity.activityId)) appendTree(activity, true);
    section.append(list);
    if (group.total > group.activities.length) {
      const more = element('button', 'quiet', 'Show older structure'); more.dataset.focusKey = 'structure-more-' + group.mode;
      more.addEventListener('click', () => { structureLimit = Math.min(100000, structureLimit + 25); render(); }); section.append(more);
    }
    root.append(section);
  }
}
function render() {
  if (document.hidden) { renderPending = true; return; }
  lastRenderAt = performance.now();
  const focusKey = document.activeElement?.dataset.focusKey;
  const activities = [...state.activities.values()];
  $('activity-count').textContent = activities.length; $('running-count').textContent = activities.filter(a => a.status === 'running').length;
  $('attention-count').textContent = activities.filter(a => ['blocked','failed','unknown'].includes(a.status)).length;
  $('empty').hidden = activities.length > 0; $('scrubber').max = events.length; $('scrubber').value = following ? events.length : state.cursor;
  $('replay-position').textContent = (following ? events.length : state.cursor) + ' / ' + events.length + ' events';
  if (metadata?.capped) notice('Recording reached its session capacity. Work continues; the remaining activity is untracked.');
  else if (connected) notice('');
  updateMode(); goalOverview(); workOverview(); canvas(); details(); timeline(); listView(); structures();
  if (focusKey) document.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]')?.focus({ preventScroll: true });
}
$('scrubber').addEventListener('input', () => { following = false; state = replay(events, Number($('scrubber').value)); scheduleRender(); });
$('go-live').addEventListener('click', () => { clearInterval(playback); playback = null; $('play').textContent = '▶'; following = true; state = liveState; render(); });
$('play').addEventListener('click', () => {
  if (playback) { clearInterval(playback); playback = null; $('play').textContent = '▶'; return; }
  following = false; state = state.cursor >= events.length ? emptyState() : replay(events, state.cursor); $('play').textContent = 'Ⅱ';
  playback = setInterval(() => { const next = events[state.cursor]; if (next) applyEvent(state, next); else { clearInterval(playback); playback = null; $('play').textContent = '▶'; } render(); }, 250);
});
$('zoom-in').addEventListener('click', () => { zoom = Math.min(2, zoom + .2); $('zoom-label').textContent = Math.round(zoom * 100) + '%'; canvas(); });
$('zoom-out').addEventListener('click', () => { zoom = Math.max(.6, zoom - .2); $('zoom-label').textContent = Math.round(zoom * 100) + '%'; canvas(); });
$('list-toggle').addEventListener('click', () => { list = !list; $('list-view').hidden = !list; $('canvas-scroll').hidden = list; $('list-toggle').setAttribute('aria-pressed', String(list)); $('list-toggle').textContent = list ? 'Canvas view' : 'List view'; listView(); });
$('refresh').addEventListener('click', () => sessions().catch(error => notice(error.message)));
$('more-sessions').addEventListener('click', () => sessions(true).catch(error => notice(error.message)));
$('more-events').addEventListener('click', () => { visibleEvents += 60; timeline(); });
if (!token) { notice('Start the visualizer from Hephaera to open an authorized local viewer.'); connection('Authorization needed', 'offline'); render(); }
else { sessions().then(() => { if (sessionId && !metadata) return selectSession(sessionId); }).catch(error => { notice(error.message); connection('Unavailable', 'offline'); }); }
