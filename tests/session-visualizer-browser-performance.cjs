'use strict';
// Maintainer-source browser benchmark. Synthetic history stays separate from
// conversation recordings; no packages or browsers are installed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const store = require('../commands/lib/session-events.cjs');
const { startServer } = require('../commands/lib/session-visualizer-server.cjs');
const REPO = path.resolve(__dirname, '..');
async function main() {
  const runId = crypto.randomUUID(), relative = '.local/session-visualizer-browser-performance/' + runId;
  const root = store.directory(REPO, relative), session = store.createSession(root, { host: 'other', title: 'Synthetic 10000-event browser benchmark' });
  const base = store.CACHE + '/sessions/' + session.id;
  store.emit(root, session.id, { label: 'Synthetic legacy performance fixture', phase: 'work', category: 'task', action: 'finished', status: 'succeeded', source: 'agent-reported', owner: 'Performance fixture' });
  const taskDirectory=store.directory(root,'.hephaera/.cache/tasks/qa-performance-task');
  fs.writeFileSync(path.join(taskDirectory,'TASK.md'),'# Render detailed workflow history\n\n## Goal\n\nKeep task names and purpose responsive in a large recorded session.\n',{flag:'wx'});
  const template = store.emit(root, session.id, { label: 'Synthetic performance fixture', task:'qa-performance-task',operation:'Render recorded workflow metadata',phase: 'work', category: 'task', action: 'finished', status: 'succeeded', source: 'agent-reported', owner: 'Performance fixture' }).event;
  let bytes = fs.statSync(store.safe(root, base + '/events/000001.json', 'file')).size;
  bytes += fs.statSync(store.safe(root, base + '/events/000002.json', 'file')).size;
  for (let sequence = 3; sequence <= 10000; sequence++) {
    const event = { ...template, id: crypto.randomUUID(), activityId: crypto.randomUUID(), sequence, producerSequence: sequence };
    const encoded = JSON.stringify(event) + '\n';
    fs.writeFileSync(store.safe(root, base + '/events/' + String(sequence).padStart(6, '0') + '.json', 'file'), encoded, { flag: 'wx', mode: 0o600 }); bytes += Buffer.byteLength(encoded);
  }
  store.write(root, base + '/budget.json', { count: 10000, bytes, capped: false }, true);
  const service = await startServer({ root, openBrowser: false });
  try {
    const result = await new Promise((resolve, reject) => {
      const child = cp.spawn(process.execPath, [path.join(__dirname, 'session-visualizer-browser.cjs'), '--root', root, '--session', session.id, '--structure-fixtures'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16384); }); child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
      child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    const resultInfo = JSON.parse(result.stdout.trim().split('\n').at(-1));
    const report = store.read(root, resultInfo.evidence + '/report.json');
    assert.equal(report.transport, 'native browser HTTP on my.hephaera.com bound to 127.0.0.1'); assert.equal(report.metrics.largeHistoryCheck, true); assert.ok(report.metrics.liveUpdateMs < 1000);
    const evidence = '.hephaera/.cache/tasks/session-visualizer/evidence/performance-' + runId;
    store.directory(REPO, evidence);
    for (const name of ['report.json', 'desktop.png', 'mobile.png', 'structure.png', 'task-details.png']) fs.copyFileSync(store.safe(root, resultInfo.evidence + '/' + name, 'file'), store.safe(REPO, evidence + '/' + name, 'file'), fs.constants.COPYFILE_EXCL);
    console.log(JSON.stringify({ status: 'passed', metrics: report.metrics, evidence, fixture: relative }));
  } finally {
    await service.close(); store.end(root, session.id);
  }
}
main().catch(error => { console.error('Visualizer browser benchmark failed: ' + error.message); process.exitCode = 1; });
