'use strict';
// Existing Chromium only; raw DevTools protocol needs no npm package or download.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const https = require('node:https');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const store = require('../commands/lib/session-events.cjs');
const service = require('../commands/lib/session-visualizer-server.cjs');
async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verified-relay') { options.relay = true; continue; }
    if (args[i] === '--structure-fixtures') { options.structures = true; continue; }
    if (!['--root','--session'].includes(args[i]) || !args[i + 1]) throw new Error('Use --root PROJECT --session UUID [--verified-relay].'); options[args[i].slice(2)] = args[++i];
  }
  const root = store.rootPath(options.root); store.session(root, options.session);
  const running = service.runtime(root); assert.ok(await service.probe(running), 'Start the local viewer first.');
  const executable = service.browserExecutable(root); assert.ok(executable, 'An existing Chromium browser is required; nothing was installed.');
  const base = '.hephaera/.cache/tasks/session-visualizer/evidence/browser-' + crypto.randomUUID();
  store.privateCache(root);
  const profile = store.directory(root, store.CACHE + '/private/qa-browser/' + crypto.randomUUID()), output = store.directory(root, base);
  const bootstrap = store.safe(root, store.CACHE + '/private/qa-open-' + crypto.randomUUID() + '.html', 'file');
  const child = cp.spawn(executable, ['--headless=new','--remote-debugging-pipe','--user-data-dir=' + profile,'--ignore-certificate-errors-spki-list=' + running.spki,
    '--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server','about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe','pipe','pipe'] });
  let startupDiagnostics = ''; child.stderr.on('data', bytes => { startupDiagnostics = (startupDiagnostics + bytes).slice(-8192); });
  let socket, pageSession, pipeError, sequence = 0, browserSecurity, passed = false, listPagingChecked = false; const pending = new Map(), external = [], errors = [], relayed = new Map(), fixtures = [];
  try {
    const rejectPipe = () => { pipeError = new Error('Chromium private debugging pipe is unavailable.' + (!pageSession && startupDiagnostics ? '\n' + startupDiagnostics : '')); for (const task of pending.values()) { clearTimeout(task.timer); task.reject(pipeError); } pending.clear(); };
    child.once('error', rejectPipe); child.stdio[3].on('error', rejectPipe); child.stdio[4].on('error', rejectPipe);
    socket = { send(value) { if (pageSession && !/^(Browser|Target)\./.test(value.method)) value.sessionId = pageSession; child.stdio[3].write(JSON.stringify(value) + '\0'); }, close() { child.stdio[3].end(); } };
    const receive = value => {
      if (value.id) { const task = pending.get(value.id); if (!task) return; clearTimeout(task.timer); pending.delete(value.id); value.error ? task.reject(new Error(value.error.message)) : task.resolve(value.result); }
      else if (value.method === 'Network.requestWillBeSent') { const url = value.params.request.url; if (/^https?:/.test(url) && new URL(url).origin !== running.url) external.push(new URL(url).origin); }
      else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text);
      else if (value.method === 'Security.visibleSecurityStateChanged') {
        const certs = value.params.visibleSecurityState.certificateSecurityState?.certificate || [];
        browserSecurity = { state: value.params.visibleSecurityState.securityState, certificates: certs.map(bytes => { const cert = new crypto.X509Certificate(Buffer.from(bytes, 'base64')); return { issuer: cert.issuer, subject: cert.subject, pinMatches: crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64') === running.spki, matchesStoredCertificate: cert.fingerprint256 === new crypto.X509Certificate(running.certificate).fingerprint256 }; }) };
      }
      else if (options.relay && value.method === 'Fetch.requestPaused') {
        const request = value.params.request, url = new URL(request.url);
        if (url.origin !== running.url) { call('Fetch.failRequest', { requestId: value.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); return; }
        // Test-only relay: the real service certificate is validated by Node.
        // No browser certificate error is ignored and production has no relay.
        const relay = https.get(request.url, { ca: running.certificate, agent: false, headers: request.headers }, response => {
          const chunks = []; let bytes = 0;
          response.on('data', chunk => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) relay.destroy(); else chunks.push(chunk); });
          response.on('end', () => call('Fetch.fulfillRequest', { requestId: value.params.requestId, responseCode: response.statusCode,
            responseHeaders: Object.entries(response.headers).filter(([name]) => !['connection','transfer-encoding','content-length'].includes(name)).map(([name, v]) => ({ name, value: String(v) })), body: Buffer.concat(chunks).toString('base64') }).catch(() => {}));
        }); relay.on('error', () => call('Fetch.failRequest', { requestId: value.params.requestId, errorReason: 'ConnectionFailed' }).catch(() => {}));
      }
      else if (options.relay && value.method === 'Runtime.bindingCalled' && value.params.name === 'hephaeraVerifiedRelay') {
        const request = JSON.parse(value.params.payload);
        if (request.close) { relayed.get(request.close)?.destroy(); relayed.delete(request.close); return; }
        const url = new URL(request.url, running.url);
        if (url.origin !== running.url || !/^\/api\/sessions\/[a-f0-9-]+\/events$/.test(url.pathname)) return;
        const relay = https.get(url, { ca: running.certificate, agent: false, headers: request.headers }, response => {
          if (response.statusCode !== 200) { relay.destroy(); return; }
          response.on('data', bytes => call('Runtime.evaluate', { expression: `window.hephaeraRelayChunk(${request.id},${JSON.stringify(bytes.toString('base64'))})` }).catch(() => relay.destroy()));
        }); relay.on('error', () => {}); relayed.set(request.id, relay);
      }
    };
    const decoder = new TextDecoder(); let wire = '';
    child.stdio[4].on('data', bytes => {
      wire += decoder.decode(bytes, { stream: true }); if (wire.length > 16 * 1024 * 1024) { rejectPipe(); return; }
      let boundary; while ((boundary = wire.indexOf('\0')) !== -1) { const message = wire.slice(0, boundary); wire = wire.slice(boundary + 1); try { receive(JSON.parse(message)); } catch { rejectPipe(); } }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => { if (pipeError) return reject(pipeError); const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('DevTools deadline: ' + method)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send({ id, method, params }); });
    let tab;
    for (let attempt = 0; attempt < 100 && !tab; attempt++) { tab = (await call('Target.getTargets')).targetInfos.find(target => target.type === 'page'); if (!tab) await delay(100); }
    assert.ok(tab, 'Chromium page did not become ready.');
    pageSession = (await call('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId;
    const launch = await call('Browser.getBrowserCommandLine');
    assert.ok(launch.arguments.includes('--remote-debugging-pipe')); assert.equal(launch.arguments.some(argument => argument.startsWith('--remote-debugging-port')), false);
    const evaluate = async expression => { const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw new Error('Browser evaluation failed.'); return value.result.value; };
    const waitFor = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      const observation = await evaluate(`({connection:document.getElementById('connection')?.textContent,notice:document.getElementById('notice')?.textContent,ready:document.readyState,protocol:location.protocol})`);
      const launched = await call('Browser.getBrowserCommandLine');
      observation.pinArgumentMatches = launched.arguments.includes('--ignore-certificate-errors-spki-list=' + running.spki);
      const cert = new crypto.X509Certificate(running.certificate);
      observation.pinMatchesStoredCertificate = crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64') === running.spki;
      try { const chain = await call('Network.getCertificate', { origin: running.url });
        observation.browserChainPinsMatch = chain.tableNames.map(bytes => crypto.createHash('sha256').update(new crypto.X509Certificate(Buffer.from(bytes, 'base64')).publicKey.export({type:'spki',format:'der'})).digest('base64') === running.spki);
      } catch { observation.browserCertificateUnavailable = true; }
      observation.browserSecurity = browserSecurity;
      fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ observation, errors, external }, null, 2));
      const failed = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(failed.data, 'base64'));
      console.error(JSON.stringify({ observation, errors, evidence: base })); throw new Error('Browser condition was not satisfied: ' + expression); };
    const click = async selector => {
      const point = await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',inline:'nearest'});const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable'); await call('Security.enable');
    if (options.relay) {
      await call('Runtime.addBinding', { name: 'hephaeraVerifiedRelay' });
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const original=fetch.bind(window),streams=new Map();let next=0;
        window.hephaeraRelayChunk=(id,data)=>streams.get(id)?.enqueue(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
        window.fetch=(input,options={})=>{const url=new URL(input,location.href);if(!url.pathname.endsWith('/events'))return original(input,options);
          const id=++next;const body=new ReadableStream({start(controller){streams.set(id,controller);hephaeraVerifiedRelay(JSON.stringify({id,url:url.href,headers:options.headers}));},cancel(){streams.delete(id);hephaeraVerifiedRelay(JSON.stringify({close:id}));}});
          options.signal?.addEventListener('abort',()=>{streams.get(id)?.error(new DOMException('Aborted','AbortError'));streams.delete(id);hephaeraVerifiedRelay(JSON.stringify({close:id}));},{once:true});
          return Promise.resolve(new Response(body,{headers:{'Content-Type':'text/event-stream'}}));};})()` });
      await call('Fetch.enable', { patterns: [{ urlPattern: running.url + '/*', requestStage: 'Request' }] });
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    const destination = running.url + '/#session=' + options.session + '&token=' + running.token;
    fs.writeFileSync(bootstrap,'<!doctype html><meta http-equiv="refresh" content="0;url=' + destination.replaceAll('&','&amp;') + '">',{flag:'wx',mode:0o600});
    await call('Page.navigate', { url: pathToFileURL(bootstrap).href });
    await waitFor(`document.getElementById('connection')?.textContent.includes('Live')`);
    assert.equal(await evaluate(`location.hash.includes('token=')`), false);
    assert.ok(await evaluate(`Number(document.getElementById('activity-count').textContent)>0`));
    // Explicitly labelled QA reports exercise branching and a verification ->
    // revision loop without presenting synthetic work as real development.
    const reportFixture = (label, phase, parentId = null, status = 'running', category = 'task', mode) => {
      const fields = { label: 'QA fixture: ' + label, phase, parentId, status, action: status === 'running' ? 'started' : 'finished', category, source: 'agent-reported', owner: 'Browser QA fixture', ...(mode ? { mode } : {}) };
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
    await waitFor(`document.readyState==='complete' && document.getElementById('connection')?.textContent.includes('Live') && document.querySelector('[data-activity="${revision}"]')!==null`);
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
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
    assert.equal(await evaluate(`(()=>{const n=document.querySelector('.edge.active');return !n||getComputedStyle(n).animationName==='none'})()`), true);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('scrollTo(0,0)');
    await delay(250);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true);
    const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', platform: process.platform, transport: options.relay ? 'test-only Node certificate-verified HTTPS relay; native browser TLS unavailable' : 'native browser HTTPS',
      checks: ['live session','private DevTools pipe','fragment capability removal','parallel branches','verification revision loop','browser refresh and resumed stream','recorded Goal parent hierarchy','mode expansion by keyboard',...(options.structures ? ['recorded Brainstorm and Gauntlet hierarchies'] : []),'stage expansion','keyboard activation and focus','keyboard focus during live updates','list view',...(listPagingChecked ? ['list pagination'] : []),'replay','live return','label escaping','reduced motion','mobile layout','no external page requests','no uncaught browser errors'],
      metrics: { recordedEventsBeforeUpdate: focusFixture.sequence - 1, liveUpdateMs, largeHistoryCheck: focusFixture.sequence > 10000 },
      screenshots: ['desktop.png','mobile.png','structure.png'], limits: 'Existing Chromium on this host only; no Linux/macOS or other coding-host acceptance inferred.' }, null, 2));
    passed = true;
    console.log(JSON.stringify({ status: 'passed', transport: options.relay ? 'verified-test-relay' : 'native-browser', evidence: base, screenshots: [base + '/desktop.png', base + '/mobile.png'] }));
  } finally {
    for (const fixture of fixtures) try { store.emit(root, options.session, { ...fixture, action: 'finished', status: passed ? 'succeeded' : 'failed' }); } catch {}
    socket?.close(); for (const task of pending.values()) clearTimeout(task.timer);
    for (const relay of relayed.values()) relay.destroy();
    // Only the process handle spawned above is retired, never a discovered PID.
    child.kill();
    if (fs.existsSync(bootstrap)) fs.unlinkSync(bootstrap);
  }
}
main().catch(error => { console.error('Visualizer browser verification failed: ' + error.message); process.exitCode = 1; });
