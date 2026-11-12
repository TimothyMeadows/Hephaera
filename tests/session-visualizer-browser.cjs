'use strict';
// Existing Chromium only; raw DevTools protocol needs no npm package or download.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('../commands/lib/session-events.cjs');
const service = require('../commands/lib/session-visualizer-server.cjs');
async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--structure-fixtures') { options.structures = true; continue; }
    if (!['--root','--session'].includes(args[i]) || !args[i + 1]) throw new Error('Use --root PROJECT --session UUID [--structure-fixtures].'); options[args[i].slice(2)] = args[++i];
  }
  const root = store.rootPath(options.root); store.session(root, options.session);
  const running = service.runtime(root); assert.ok(await service.probe(running), 'Start the local viewer first.');
  assert.match(running.url,/^http:\/\/my\.hephaera\.com:\d+$/);
  const executable = service.browserExecutable(root); assert.ok(executable, 'An existing Chromium browser is required; nothing was installed.');
  const base = '.hephaera/.cache/tasks/session-visualizer/evidence/browser-' + crypto.randomUUID();
  store.privateCache(root);
  const profile = store.directory(root, store.CACHE + '/private/qa-browser/' + crypto.randomUUID()), output = store.directory(root, base);
  const bootstrap = store.safe(root, store.CACHE + '/private/qa-open-' + crypto.randomUUID() + '.html', 'file');
  const child = cp.spawn(executable, ['--headless=new','--remote-debugging-pipe','--user-data-dir=' + profile,
    '--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',...service.BROWSER_NETWORK_ARGS,'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe','pipe','pipe'] });
  let startupDiagnostics = ''; child.stderr.on('data', bytes => { startupDiagnostics = (startupDiagnostics + bytes).slice(-8192); });
  let socket, pageSession, pipeError, sequence = 0, passed = false, listPagingChecked = false; const pending = new Map(), external = [], errors = [], fixtures = [], peers = new Set();
  try {
    const rejectPipe = () => { pipeError = new Error('Chromium private debugging pipe is unavailable.' + (!pageSession && startupDiagnostics ? '\n' + startupDiagnostics : '')); for (const task of pending.values()) { clearTimeout(task.timer); task.reject(pipeError); } pending.clear(); };
    child.once('error', rejectPipe); child.once('exit', rejectPipe); child.stdio[3].on('error', rejectPipe); child.stdio[4].on('error', rejectPipe);
    socket = { send(value) { if (pageSession && !/^(Browser|Target)\./.test(value.method)) value.sessionId = pageSession; child.stdio[3].write(JSON.stringify(value) + '\0'); }, close() { child.stdio[3].end(); } };
    const receive = value => {
      if (value.id) { const task = pending.get(value.id); if (!task) return; clearTimeout(task.timer); pending.delete(value.id); value.error ? task.reject(new Error(value.error.message)) : task.resolve(value.result); }
      else if (value.method === 'Network.requestWillBeSent') { const url = value.params.request.url; if (/^https?:/.test(url) && new URL(url).origin !== running.url) external.push(new URL(url).origin); }
      else if (value.method === 'Network.responseReceived') { const response=value.params.response;if(response.url.startsWith(running.url+'/')&&response.remoteIPAddress)peers.add(response.remoteIPAddress); }
      else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text);
    };
    const decoder = new TextDecoder(); let wire = '';
    child.stdio[4].on('data', bytes => {
      wire += decoder.decode(bytes, { stream: true }); if (wire.length > 16 * 1024 * 1024) { rejectPipe(); return; }
      let boundary; while ((boundary = wire.indexOf('\0')) !== -1) { const message = wire.slice(0, boundary); wire = wire.slice(boundary + 1); try { receive(JSON.parse(message)); } catch { rejectPipe(); } }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => { if (pipeError) return reject(pipeError); const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('DevTools deadline: ' + method + (!pageSession && startupDiagnostics ? '\n' + startupDiagnostics : ''))); }, pageSession ? 10000 : 30000); pending.set(id, { resolve, reject, timer }); socket.send({ id, method, params }); });
    let tab;
    for (let attempt = 0; attempt < 100 && !tab; attempt++) { tab = (await call('Target.getTargets')).targetInfos.find(target => target.type === 'page'); if (!tab) await delay(100); }
    assert.ok(tab, 'Chromium page did not become ready.');
    pageSession = (await call('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId;
    const launch = await call('Browser.getBrowserCommandLine');
    assert.ok(launch.arguments.includes('--remote-debugging-pipe')); assert.equal(launch.arguments.some(argument => argument.startsWith('--remote-debugging-port')), false);
    const insecureFlags=/^--(?:ignore-certificate-errors(?:-spki-list)?|allow-insecure-localhost|disable-web-security|unsafely-treat-insecure-origin-as-secure|no-sandbox)(?:=|$)/;
    assert.equal(launch.arguments.some(argument=>insecureFlags.test(argument)),false);
    const evaluate = async expression => { const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw new Error('Browser evaluation failed.'); return value.result.value; };
    const waitFor = async (expression, attempts = 100) => { for (let attempt = 0; attempt < attempts; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      const observation = await evaluate(`({connection:document.getElementById('connection')?.textContent,notice:document.getElementById('notice')?.textContent,ready:document.readyState,protocol:location.protocol})`);
      observation.securityOverrideFlags = launch.arguments.some(argument=>insecureFlags.test(argument));
      fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ observation, errors, external }, null, 2));
      const failed = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(failed.data, 'base64'));
      console.error(JSON.stringify({ observation, errors, evidence: base })); throw new Error('Browser condition was not satisfied: ' + expression); };
    const click = async selector => {
      const point = await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',inline:'nearest'});const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    const destination = running.url + '/#session=' + options.session + '&token=' + running.token;
    fs.writeFileSync(bootstrap,'<!doctype html><meta http-equiv="refresh" content="0;url=' + destination.replaceAll('&','&amp;') + '">',{flag:'wx',mode:0o600});
    await call('Page.navigate', { url: pathToFileURL(bootstrap).href });
    await waitFor(`document.getElementById('connection')?.textContent.includes('Live')`, 600);
    assert.equal(await evaluate(`location.protocol==='http:'&&location.hostname==='my.hephaera.com'`),true);
    assert.equal(await evaluate('isSecureContext'),false);
    assert.deepEqual([...peers],['127.0.0.1']);
    const launchArgs=(await call('Browser.getBrowserCommandLine')).arguments;
    assert.ok(launchArgs.includes('--host-resolver-rules=MAP my.hephaera.com 127.0.0.1,MAP * ~NOTFOUND'));
    // An open SSE connection can still be catching up retained history. Start
    // interaction and fresh-update timing only after the initial backlog loads.
    const initialTotal = store.page(root, options.session, 0, 1).total;
    await waitFor(`Number(document.getElementById('scrubber').max)>=${initialTotal}`, 600);
    assert.equal(await evaluate(`location.hash.includes('token=')`), false);
    assert.ok(await evaluate(`Number(document.getElementById('activity-count').textContent)>0`));
    // Explicitly labelled QA reports exercise branching and a verification ->
    // revision loop without presenting synthetic work as real development.
    const reportFixture = (label, phase, parentId = null, status = 'running', category = 'task', mode, extra = {}) => {
      const fields = { label: 'QA fixture: ' + label, phase, parentId, status, action: status === 'running' ? 'started' : 'finished', category, source: 'agent-reported', owner: 'Browser QA fixture', ...(mode ? { mode } : {}), ...extra };
      const event = store.emit(root, options.session, fields).event;
      if (status === 'running') fixtures.push({ ...fields, activityId: event.activityId });
      return event.activityId;
    };
    const plan = reportFixture('branch plan', 'planning', null, 'succeeded', 'goal', 'goal');
    const branch = reportFixture('parallel work A', 'work', plan, 'running', 'agent');
    reportFixture('parallel work B', 'work', plan, 'running', 'agent');
    const verify = reportFixture('verification cycle', 'verification', branch);
    const revision = reportFixture('revision cycle', 'work', verify);
    if (options.structures) {
      const brainstorm = reportFixture('Brainstorm branch', 'planning', null, 'succeeded', 'branch', 'brainstorm');
      reportFixture('Brainstorm idea', 'planning', brainstorm, 'succeeded', 'idea');
      const gauntlet = reportFixture('Gauntlet', 'review', null, 'succeeded', 'gauntlet', 'gauntlet');
      const unit = reportFixture('Gauntlet work unit', 'review', gauntlet, 'succeeded', 'work-unit');
      reportFixture('Gauntlet critic round', 'review', unit, 'succeeded', 'round');
    }
    await waitFor(`document.querySelector('[data-activity="${revision}"]')!==null && document.querySelectorAll('.edge.parent').length>=4`);
    assert.ok(await evaluate(`document.querySelectorAll('.activity-card.running').length>=2`));
    await call('Page.reload', { ignoreCache: true }); await delay(200);
    await waitFor(`document.readyState==='complete' && document.getElementById('connection')?.textContent.includes('Live') && document.querySelector('[data-activity="${revision}"]')!==null`, 600);
    assert.equal(await evaluate(`document.querySelectorAll('[data-activity="${revision}"]').length`), 1);
    assert.equal(await evaluate(`location.hash.includes('token=')`), false);
    await waitFor(`document.querySelector('[data-mode="goal"] [data-structure-activity="${plan}"] [data-structure-activity="${branch}"]')!==null`);
    await click('[data-mode="goal"] summary'); assert.equal(await evaluate(`document.querySelector('[data-mode="goal"]').open`), false);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`document.querySelector('[data-mode="goal"]').open`);
    if (options.structures) assert.deepEqual(await evaluate(`[...document.querySelectorAll('.mode-structure')].map(node=>node.dataset.mode)`), ['brainstorm','goal','gauntlet']);
    const structureScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, 'structure.png'), Buffer.from(structureScreenshot.data, 'base64'));
    await evaluate('scrollTo(0,0)');
    const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
    await click('#zoom-in'); assert.equal(await evaluate(`document.getElementById('zoom-label').textContent`),'120%');
    await click('#zoom-out'); assert.equal(await evaluate(`document.getElementById('zoom-label').textContent`),'100%');
    await click('#canvas .stage-toggle'); assert.equal(await evaluate(`document.querySelector('#canvas .stage-toggle').getAttribute('aria-expanded')`), 'false');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await evaluate(`document.querySelector('#canvas .stage-toggle').getAttribute('aria-expanded')`), 'true');
    assert.equal(await evaluate(`document.activeElement.getAttribute('role')`), 'button');
    const liveUpdateStarted = performance.now();
    const focusFixture = store.emit(root, options.session, { label: 'QA fixture: live keyboard focus', phase: 'context', category: 'review', action: 'finished', status: 'succeeded', source: 'agent-reported', owner: 'Browser QA fixture' }).event;
    await waitFor(`Number(document.getElementById('scrubber').max)>=${focusFixture.sequence}`);
    const liveUpdateMs = performance.now() - liveUpdateStarted;
    if (focusFixture.sequence > 10000) assert.ok(liveUpdateMs < 1000, 'New activity must appear within one second after 10000 recorded events.');
    assert.equal(await evaluate(`document.activeElement.classList.contains('stage-toggle')`), true, 'Live updates must retain keyboard focus.');
    await click('#list-toggle'); assert.equal(await evaluate(`document.getElementById('list-view').hidden`), false);
    assert.ok(await evaluate(`document.querySelectorAll('#list-view tbody tr').length>0`));
    if (await evaluate(`document.querySelector('[data-focus-key="more-list"]')!==null`)) {
      const count = await evaluate(`document.querySelectorAll('#list-view tbody tr').length`);
      await click('[data-focus-key="more-list"]');
      assert.ok(await evaluate(`document.querySelectorAll('#list-view tbody tr').length>${count}`));
      assert.equal(await evaluate(`(()=>{const keys=[...document.querySelectorAll('#list-view [data-focus-key^="list-"]')].map(node=>node.dataset.focusKey);return new Set(keys).size===keys.length})()`), true);
      listPagingChecked = true;
    }
    await click('#list-toggle');
    await evaluate(`(()=>{const slider=document.getElementById('scrubber');slider.value='1';slider.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await waitFor(`document.getElementById('replay-mode').textContent==='SESSION REPLAY'`);
    assert.equal(await evaluate(`document.getElementById('activity-count').textContent`), '1');
    await click('#go-live'); await waitFor(`document.getElementById('replay-mode').textContent==='LIVE VIEW'`);
    const label = 'Label escaping fixture <img src=x onerror=window.hephaeraXss=1>';
    const fixture = store.emit(root, options.session, { label, phase: 'verification', category: 'command', action: 'started', source: 'command-observed', owner: 'Browser QA' }).event;
    await waitFor(`document.querySelector('[data-activity="${fixture.activityId}"]')!==null`);
    await evaluate(`document.querySelector('[data-activity="${fixture.activityId}"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('#details .detail-title').textContent`), label);
    assert.equal(await evaluate(`document.querySelector('#details img')!==null || window.hephaeraXss===1`), false);
    store.emit(root, options.session, { label, phase: 'verification', category: 'command', activityId: fixture.activityId, action: 'finished', status: 'succeeded', source: 'command-observed', owner: 'Browser QA' });
    // Real task-file metadata capture, using explicitly synthetic task records.
    const taskId='qa-context-'+crypto.randomUUID(), completedTask='qa-finished-'+crypto.randomUUID();
    const taskDirectory=store.directory(root,'.hephaera/.cache/tasks/'+taskId), taskFile=path.join(taskDirectory,'TASK.md');
    const taskMarkdown='# Improve controller reconnection\n\n## Goal\n\nKeep movement responsive when a controller reconnects.\n';fs.writeFileSync(taskFile,taskMarkdown,{flag:'wx'});
    const completedDirectory=store.directory(root,'.hephaera/.cache/tasks/'+completedTask);fs.writeFileSync(path.join(completedDirectory,'TASK.md'),'# Add journal quest markers\n\n## Goal\n\nShow the current objective beside the journal.\n',{flag:'wx'});
    const currentTask=reportFixture('Task running','work',null,'running','task','task',{task:taskId,operation:'Implement controller recovery'});
    const checkpoint=reportFixture('Task checkpoint','review',currentTask,'succeeded','command','task',{task:taskId,operation:'Record task checkpoint'});
    reportFixture('Task completed','verification',null,'succeeded','task','task',{task:completedTask,operation:'Finish quest marker verification'});
    await waitFor(`document.querySelector('[data-task="${taskId}"]')?.textContent.includes('Improve controller reconnection') && document.querySelector('[data-task="${completedTask}"]')?.textContent.includes('Task completed')`);
    assert.ok(await evaluate(`document.querySelector('[data-task="${taskId}"]').textContent.includes('Task in progress')`));
    assert.ok(await evaluate(`document.querySelector('[data-task="${taskId}"]').textContent.includes('Keep movement responsive when a controller reconnects.')`));
    assert.ok(await evaluate(`document.querySelector('[data-activity="${checkpoint}"]').getAttribute('aria-label').includes('Improve controller reconnection')`));
    assert.equal(await evaluate(`document.querySelector('[data-activity="${checkpoint}"] .activity-operation').textContent`),'Record task checkpoint');
    assert.ok(await evaluate(`document.getElementById('timeline').textContent.includes('Improve controller reconnection') && document.getElementById('timeline').textContent.includes('Record task checkpoint')`));
    await click('[data-task="'+taskId+'"]');
    assert.equal(await evaluate(`document.querySelector('#details .detail-title').textContent`),'Improve controller reconnection');
    assert.equal(await evaluate(`document.querySelector('#details .task-purpose').textContent`),'Keep movement responsive when a controller reconnects.');
    assert.ok(await evaluate(`document.getElementById('details').textContent.includes('.hephaera/.cache/tasks/${taskId}/TASK.md')`));
    const detailScreenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,'task-details.png'),Buffer.from(detailScreenshot.data,'base64'));
    await click('#list-toggle');assert.ok(await evaluate(`document.getElementById('list-view').textContent.includes('Improve controller reconnection') && document.getElementById('list-view').textContent.includes('Keep movement responsive')`));await click('#list-toggle');
    fs.writeFileSync(taskFile,'# Unrecorded rewrite\n\n## Goal\n\nThis must not replace recorded metadata.\n');
    await call('Page.reload',{ignoreCache:true});await waitFor(`document.getElementById('connection')?.textContent.includes('Live') && document.querySelector('[data-task="${taskId}"]')?.textContent.includes('Improve controller reconnection')`,600);
    assert.equal(await evaluate(`document.getElementById('current-work').textContent.includes('Unrecorded rewrite')`),false);fs.writeFileSync(taskFile,taskMarkdown);
    await evaluate(`(()=>{const slider=document.getElementById('scrubber');slider.value='1';slider.dispatchEvent(new Event('input',{bubbles:true}))})()`);await waitFor(`document.getElementById('current-work-panel').hidden`);
    await click('#go-live');await waitFor(`document.querySelector('[data-task="${taskId}"]')!==null`);
    await evaluate(`document.querySelector('[data-task="${taskId}"]').focus()`);assert.equal(await evaluate(`document.activeElement.dataset.task`),taskId);
    await evaluate('scrollTo(0,0)');await delay(150);const contextualDesktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,'desktop.png'),Buffer.from(contextualDesktop.data,'base64'));
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
    assert.equal(await evaluate(`(()=>{const n=document.querySelector('.edge.active');return !n||getComputedStyle(n).animationName==='none'})()`), true);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('scrollTo(0,0)');
    await delay(250);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true);
    const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', platform: process.platform, transport: 'native browser HTTP on my.hephaera.com bound to 127.0.0.1',
      checks: ['task title and purpose at a glance','checkpoint success preserves running task report','task context on canvas timeline list and details','task source rewrite cannot change recorded context','task context replay and keyboard focus','IPv4 loopback HTTP','no certificate or security exception flags','ordinary HTTP hostname context','offline browser resolver mapping','actual browser peer127.0.0.1','live session','private DevTools pipe','fragment capability removal','parallel branches','verification revision loop','browser refresh and resumed stream','recorded Goal parent hierarchy','mode expansion by keyboard',...(options.structures ? ['recorded Brainstorm and Gauntlet hierarchies'] : []),'stage expansion','keyboard activation and focus','keyboard focus during live updates','list view',...(listPagingChecked ? ['list pagination'] : []),'replay','live return','label escaping','reduced motion','mobile layout','no external page requests','no uncaught browser errors'],
      metrics: { recordedEventsBeforeUpdate: focusFixture.sequence - 1, liveUpdateMs, largeHistoryCheck: focusFixture.sequence > 10000 },
      screenshots: ['desktop.png','mobile.png','structure.png','task-details.png'], limits: 'Existing Chromium on this host only; no Linux/macOS or other coding-host acceptance inferred.' }, null, 2));
    passed = true;
    console.log(JSON.stringify({ status: 'passed', transport: 'native-browser-http-loopback', evidence: base, screenshots: [base + '/desktop.png', base + '/mobile.png'] }));
  } finally {
    for (const fixture of fixtures) try { store.emit(root, options.session, { ...fixture, action: 'finished', status: passed ? 'succeeded' : 'failed' }); } catch {}
    socket?.close(); for (const task of pending.values()) clearTimeout(task.timer);
    // Only the process handle spawned above is retired, never a discovered PID.
    child.kill();
    if (fs.existsSync(bootstrap)) fs.unlinkSync(bootstrap);
  }
}
main().catch(error => { console.error('Visualizer browser verification failed: ' + error.message); process.exitCode = 1; });
