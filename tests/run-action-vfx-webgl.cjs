'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {withEdgeReview} = require('./lib/edge-review.cjs');
const ROOT = path.resolve(__dirname, '..'), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2); if (args.length !== 4 || args.some(value => !path.isAbsolute(value))) throw Error('Use explicit EDGE_EXE EXISTING_MODULES ASSETS_DIRECTORY NEW_OUTPUT_DIRECTORY absolute paths.');
const [edge, modules, assets, output] = args.map(value => path.resolve(value));
const sourceNames = ['tests/run-action-vfx-webgl.cjs', 'tests/fixtures/action-vfx/index.html', 'tests/fixtures/action-vfx/scene.mjs', 'tests/lib/edge-review.cjs',
  '.engine/threejs/actions/action-package.mjs', '.engine/threejs/actions/action-scene.mjs', '.engine/threejs/actions/action-v2.mjs',
  '.engine/threejs/particles/three-quarks-runtime.mjs', '.engine/threejs/particles/three-vfx-runtime.mjs', '.engine/threejs/particles/vfx-package.mjs'];
sourceNames.push('.engine/threejs/postprocessing/postprocessing-runtime.mjs');
sourceNames.push('tests/fixtures/action-vfx/advance.mjs');
const before = Object.fromEntries(sourceNames.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name)))]));
const fixture = JSON.parse(fs.readFileSync(path.join(assets, 'fixture.json'), 'utf8'));
const exact = {three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1', postprocessing: '6.39.5'};
for (const [name, version] of Object.entries(exact)) if (JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version !== version) throw Error('Explicit installed module drift: ' + name);
let checks = 0; const check = (condition, why) => { if (!condition) throw Error(why); checks++; };
const summary = value => { const {events, ...rest} = value; return {...rest, events: events.length, families: [...new Set(events.filter(event => event.type === 'layer-start').map(event => event.family))]}; };
function relativeAsset(name) { if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(name)) throw Error('Explicit fixture-relative asset required'); const file = path.resolve(assets, name); if (!file.startsWith(assets + path.sep)) throw Error('Fixture escaped asset root'); return file; }
function boundaries(item) {
  const pkg = JSON.parse(fs.readFileSync(relativeAsset(item.package), 'utf8')), action = pkg.actions.find(value => value.id === item.action) || pkg.actions[0];
  const exact = new Set([0, action.duration, action.retireAt]); for (const marker of action.markers) exact.add(marker.at);
  for (const cue of action.cues) { exact.add(cue.start); exact.add(cue.end); exact.add(cue.retireAt); for (const layer of cue.layers) { exact.add(layer.start); exact.add(layer.stopAt); exact.add(layer.retireAt); } }
  const times = [...exact].sort((a, b) => a - b), samples = times.map(time => ({time, kind: 'semantic-boundary'}));
  for (let i = 0; i < times.length - 1; i++) if (times[i + 1] - times[i] > .002) samples.push({time: times[i] + Math.min(.02, (times[i + 1] - times[i]) / 2), kind: 'after-boundary'});
  return {pkg, action, samples: samples.sort((a, b) => a.time - b.time), expectedFamilies: [...new Set(action.cues.flatMap(cue => cue.layers.map(layer => layer.family)))]};
}
withEdgeReview({edge, source: ROOT, modules, fixture: path.join(ROOT, 'tests/fixtures/action-vfx'), assets, output}, async browser => {
  await browser.navigate('index.html'); const started = Date.now();
  while (Date.now() - started < 45000) { const state = await browser.evaluate('({ready:window.__actionVfxReady,error:window.__reviewError||null})'); if (state.error) throw Error(state.error); if (state.ready) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  check(await browser.evaluate('window.__actionVfxReady === true'), 'Actual original-model WebGL review did not become ready');
  const driver = await browser.evaluate('window.__actionVfxReview.driver'), cases = [], captures = [], observedFamilies = new Set();
  for (let caseIndex = 0; caseIndex < fixture.cases.length; caseIndex++) {
    const item = fixture.cases[caseIndex], plan = boundaries(item); check(plan.samples.length <= 256, 'Finite semantic capture budget exceeded');
    let peakEffectPixels = 0; const frames = [];
    let initial = await browser.evaluate(`window.__actionVfxReview.select(${JSON.stringify(item.id)})`);
    for (let index = 0; index < plan.samples.length; index++) {
      const sample = plan.samples[index];
      const frame = await browser.evaluate(`window.__actionVfxReview.advanceTo(${JSON.stringify(sample.time)})`);
      check(frame.absoluteClock.observedTime >= sample.time && frame.absoluteClock.roundoffSeconds <= 4 * frame.absoluteClock.maxClockTick, 'Capture labels a predecessor or excessive overshoot as an absolute boundary');
      check(frame.glError === 0 && frame.shaderErrors.length === 0, 'Actual action shader/GL failure: ' + item.id + ' at ' + sample.time);
      check(frame.occupiedPixels > 10, 'Actual model/action frame is blank: ' + item.id + ' at ' + sample.time);
      if (sample.kind === 'semantic-boundary') for (const actor of frame.actors) {
        const observed = frame.events.filter(event => event.actor === actor.id);
        for (const marker of plan.action.markers.filter(marker => marker.at === sample.time)) check(observed.some(event => event.type === 'marker' && event.markerId === marker.id && event.time === marker.at), 'Exact marker boundary was not delivered before capture');
        for (const cue of plan.action.cues) {
          if (cue.start === sample.time) check(observed.some(event => event.type === 'cue-start' && event.cue === cue.id && event.time === cue.start), 'Exact release boundary was not delivered before capture');
          if (cue.end === sample.time) check(observed.some(event => event.type === 'cue-end' && event.cue === cue.id && event.time === cue.end), 'Exact cue end was not delivered before capture');
          for (const layer of cue.layers.filter(layer => layer.start === sample.time)) check(observed.some(event => event.type === 'layer-start' && event.cue === cue.id && event.layer === layer.id && event.time === layer.start), 'Exact layer start was not delivered before capture');
        }
        if (sample.time >= plan.action.duration) check(actor.state.motionEnded, 'Motion-end boundary was not delivered before capture');
      }
      peakEffectPixels = Math.max(peakEffectPixels, frame.effectPixels); for (const event of frame.events) if (event.type === 'layer-start') observedFamilies.add(event.family);
      const capture = await browser.capture('case-' + caseIndex + '-frame-' + index + '.png'); captures.push(capture);
      frames.push({...sample, ...summary(frame), capture});
    }
    check(peakEffectPixels > 10, 'No actual VFX pixels differ from the same model-only scene: ' + item.id);
    for (const family of plan.expectedFamilies) check(observedFamilies.has(family), 'Actual action never constructed promised family: ' + family);
    const drained = await browser.evaluate('window.__actionVfxReview.advance(.3)');
    check(drained.state.activeEffects === 0, 'Actual action retained owned effects beyond authored retirement: ' + item.id);
    const normal = await browser.evaluate(`window.__actionVfxReview.normal(${JSON.stringify(item.id)})`);
    check(normal.frames > 3 && normal.elapsedSeconds >= plan.action.duration, 'Complete normal-speed actual playback was not observed');
    check(normal.final.state.activeEffects === 0, 'Normal-speed actual playback leaked bounded tails');
    const capture = await browser.capture('case-' + caseIndex + '-normal-drained.png'); captures.push(capture);
    cases.push({id: item.id, profile: plan.pkg.profile, action: plan.action.id, modelSha256: plan.pkg.model.sha256, packageSha256: hash(fs.readFileSync(relativeAsset(item.package))),
      expectedFamilies: plan.expectedFamilies, peakEffectPixels, frames, normal: {...normal, final: summary(normal.final)}, normalCapture: capture});
    console.log(JSON.stringify({case: item.id, semanticFrames: frames.length, normalFrames: normal.frames, peakEffectPixels}));
  }
  const required = fixture.requireFamilies || ['sprite', 'burst', 'ring', 'mesh', 'projectile', 'trail', 'impact', 'ground-indicator', 'beam'];
  for (const family of required) check(observedFamilies.has(family), 'Required family lacks actual candidate action evidence: ' + family);
  const cleanup = await browser.evaluate('window.__actionVfxReview.dispose()');
  check(cleanup.borrowedResourcesPreserved && cleanup.finalSystems === 0, 'Actual action cleanup disposed caller resources or retained systems');
  check(cleanup.composerPreserved && cleanup.composerSurvivesActionDisposal && cleanup.composerFirstDispose === true && cleanup.composerSecondDispose === false, 'Action teardown broke caller compositor ownership or idempotent disposal');
  const after = Object.fromEntries(sourceNames.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name)))])); check(JSON.stringify(before) === JSON.stringify(after), 'Candidate source changed during browser evidence');
  const result = {checks, driver, cases, observedFamilies: [...observedFamilies], captures, cleanup: {borrowedResourcesPreserved: cleanup.borrowedResourcesPreserved, finalSystems: cleanup.finalSystems, composerPreserved: cleanup.composerPreserved, composerSurvivesActionDisposal: cleanup.composerSurvivesActionDisposal, composer: cleanup.composer}, sourceHashes: before, fixtureSha256: hash(fs.readFileSync(path.join(assets, 'fixture.json'))), versions: exact,
    scope: 'Actual selected default desktop Edge WebGL2, original real GLB action playback and bounded VFX. Technical pixel/resource evidence does not grant game quality, MAUI/device, human acceptance or promotion.'};
  fs.writeFileSync(path.join(output, 'action-vfx-result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'}); return result;
}).then(result => console.log(JSON.stringify({output, checks: result.checks, captures: result.captures.length, driver: result.driver}))).catch(error => { console.error(error); process.exitCode = 1; });
