'use strict';
// Candidate absolute measurements only: parent445 has no v2 action scheduler.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {withEdgeReview} = require('./lib/edge-review.cjs');
const {writeBrowserArtifact} = require('./fixtures/action-vfx/webm-evidence.cjs');
const ROOT = path.resolve(__dirname, '..'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2); if (args.length !== 4 || args.some(value => !path.isAbsolute(value))) throw Error('Use explicit EDGE_EXE EXISTING_MODULES ASSETS_DIRECTORY NEW_OUTPUT_DIRECTORY absolute paths.');
const [edge, modules, assets, output] = args.map(value => path.resolve(value)), fixture = JSON.parse(fs.readFileSync(path.join(assets, 'fixture.json'), 'utf8'));
const names = ['tests/run-action-vfx-model-performance.cjs', 'tests/fixtures/action-vfx/scene.mjs', 'tests/fixtures/action-vfx/index.html', 'tests/lib/edge-review.cjs',
  '.engine/threejs/actions/action-package.mjs', '.engine/threejs/actions/action-scene.mjs', '.engine/threejs/actions/action-v2.mjs',
  '.engine/threejs/particles/three-quarks-runtime.mjs', '.engine/threejs/particles/three-vfx-runtime.mjs', '.engine/threejs/particles/vfx-package.mjs'];
names.push('.engine/threejs/postprocessing/postprocessing-runtime.mjs');
names.push('tests/fixtures/action-vfx/advance.mjs');
names.push('tests/fixtures/action-vfx/capture.mjs', 'tests/fixtures/action-vfx/pose-oracle.mjs', 'tests/fixtures/action-vfx/webm-evidence.cjs');
const sourceHashes = Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(ROOT, name)))]));
const versions = Object.fromEntries(['three', 'three.quarks', 'quarks.core', 'postprocessing'].map(name => [name, JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version]));
if (JSON.stringify(versions) !== JSON.stringify({three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1', postprocessing: '6.39.5'})) throw Error('Explicit installed dependency versions differ');
const profiles = new Set(), selected = fixture.performanceCases || fixture.cases.filter(item => {
  if (path.isAbsolute(item.package) || item.package.split('/').some(part => part === '..' || part === '.')) throw Error('Explicit local package reference required');
  const profile = JSON.parse(fs.readFileSync(path.join(assets, item.package), 'utf8')).profile; if (!['skinned', 'rigid'].includes(profile) || profiles.has(profile)) return false; profiles.add(profile); return true;
}).map(item => item.id);
if (!Array.isArray(selected) || !selected.length || selected.length > 16) throw Error('Bounded original performance case selection required');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
withEdgeReview({edge, source: ROOT, modules, fixture: path.join(ROOT, 'tests/fixtures/action-vfx'), assets, output}, async browser => {
  await browser.navigate('index.html'); const deadline = Date.now() + 45000;
  while (Date.now() < deadline) { const value = await browser.evaluate('({ready:window.__actionVfxReady,error:window.__reviewError||null})'); if (value.error) throw Error(value.error); if (value.ready) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  if (!await browser.evaluate('window.__actionVfxReady === true')) throw Error('Actual original-model benchmark unavailable');
  const driver = await browser.evaluate('window.__actionVfxReview.driver'), warmup = [], runs = [];
  for (const id of selected) { const value = await browser.evaluate(`window.__actionVfxReview.benchmark(${JSON.stringify(id)})`); warmup.push(value); await browser.evaluate(`window.__actionVfxReview.artifactRelease(${JSON.stringify(value.peakCapture.id)})`); }
  for (let index = 0; index < 5; index++) for (const id of selected) {
    const result = await browser.evaluate(`window.__actionVfxReview.benchmark(${JSON.stringify(id)})`);
    if (!result.ambientAvailable || result.cleanup.activeEffects || result.cleanup.systems) throw Error('Actual model benchmark lacks ambient or leaked owned effects');
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw Error('Bounded performance case file identity required');
    const imageName = 'run-' + (index + 1) + '-' + id + '-two-actors-ambient.png', captured = await writeBrowserArtifact({browser, artifactId: result.peakCapture.id, path: path.join(output, imageName), maxBytes: 8388608});
    const run = {index: index + 1, ...result, peakCapture: {...result.peakCapture, artifact: {path: imageName, sha256: captured.sha256, bytes: captured.bytes}}}; runs.push(run); fs.writeFileSync(path.join(output, 'run-' + (index + 1) + '-' + id + '.json'), JSON.stringify(run, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({run: index + 1, id, steadySystems: result.steady.maxSystems, peakSystems: result.peak.maxSystems, peakParticles: result.peak.maxParticles}));
  }
  const cleanup = await browser.evaluate('window.__actionVfxReview.dispose()'); if (!cleanup.borrowedResourcesPreserved || cleanup.finalSystems) throw Error('Actual model benchmark disposed caller resources or retained systems');
  const after = Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(ROOT, name)))])); if (JSON.stringify(after) !== JSON.stringify(sourceHashes)) throw Error('Candidate source changed during absolute model runs');
  const average = (run, phase, key) => run[phase].samples.reduce((sum, sample) => sum + sample[key], 0) / run[phase].samples.length;
  const metrics = {admissionCpuMs: run => run.stages.resourceAdmission.cpuMs, actorConstructionCpuMs: run => run.stages.actorConstruction.cpuMs,
    firstCompileRenderFinishWallMs: run => run.stages.firstCompileRender.finishWallMs, steadyUpdateCpuMs: run => average(run, 'steady', 'updateCpuMs'), steadyRenderSubmitCpuMs: run => average(run, 'steady', 'renderSubmitCpuMs'), steadyFinishWallMs: run => run.steady.perFrameWallMs,
    peakActorConstructionCpuMs: run => run.stages.peakActors.cpuMs, peakAmbientAdmissionAcquireCpuMs: run => run.stages.peakAmbient.cpuMs, peakCompileRenderFinishWallMs: run => run.stages.peakCompileRender.finishWallMs,
    peakUpdateCpuMs: run => average(run, 'peak', 'updateCpuMs'), peakRenderSubmitCpuMs: run => average(run, 'peak', 'renderSubmitCpuMs'), peakFinishWallMs: run => run.peak.perFrameWallMs};
  const cases = selected.map(id => ({id, loadOnce: runs.find(run => run.id === id).load, runtimeConstructionOnceMs: runs.find(run => run.id === id).runtimeConstructionMs,
    metrics: Object.fromEntries(Object.entries(metrics).map(([name, get]) => { const values = runs.filter(run => run.id === id).map(get); return [name, {values, median: median(values), range: [Math.min(...values), Math.max(...values)]}]; })),
    observedMaxPeakSystems: Math.max(...runs.filter(run => run.id === id).map(run => run.peak.maxSystems)), observedMaxPeakParticles: Math.max(...runs.filter(run => run.id === id).map(run => run.peak.maxParticles))}));
  const result = {schemaVersion: 'hephaera-action-vfx-model-performance/v1', status: 'measured', sourceHashes, fixtureSha256: sha(fs.readFileSync(path.join(assets, 'fixture.json'))), versions, driver, runsPerCase: 5, selected, warmup, cases,
    methodology: 'One warmup per selected original skinned/rigid case, then five interleaved candidate absolute runs. Raw/model decode load is recorded once; each run separately repeats exact-byte/resource admission, one actor construction and first compile/render, 32 steady frames, two actors plus sprite ambient at explicit representative peak time, and 32 peak frames. No pixel readbacks are inside timed frame samples.',
    timingScope: 'performance.now CPU submission and gl.finish synchronized wall time, not pure GPU time; selected desktop Edge host only.',
    limits: 'Parent445 had no v2 action scheduler, so these costs are absolute and no before/after scheduler ratio is claimed. Representative finite scene workload is not all-game/MAUI/device performance, visual quality, human acceptance or promotion.'};
  fs.writeFileSync(path.join(output, 'model-performance-report.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'}); return result;
}).then(result => console.log(JSON.stringify({output, cases: result.cases.map(value => ({id: value.id, peakSystems: value.observedMaxPeakSystems, peakParticles: value.observedMaxPeakParticles,
  steadyUpdateCpuMedianMs: value.metrics.steadyUpdateCpuMs.median, peakUpdateCpuMedianMs: value.metrics.peakUpdateCpuMs.median, peakFinishWallMedianMs: value.metrics.peakFinishWallMs.median})), report: 'model-performance-report.json'}))).catch(error => { console.error(error); process.exitCode = 1; });
