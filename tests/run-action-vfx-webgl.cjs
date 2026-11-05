'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {withEdgeReview} = require('./lib/edge-review.cjs');
const {buildCapturePlan, timeKey} = require('./fixtures/action-vfx/capture-plan.cjs');
const {writeBrowserArtifact} = require('./fixtures/action-vfx/webm-evidence.cjs');
const ROOT = path.resolve(__dirname, '..'), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2); if (args.length !== 4 || args.some(value => !path.isAbsolute(value))) throw Error('Use explicit EDGE_EXE EXISTING_MODULES ASSETS_DIRECTORY NEW_OUTPUT_DIRECTORY absolute paths.');
const [edge, modules, assets, output] = args.map(value => path.resolve(value));
const sourceNames = ['tests/run-action-vfx-webgl.cjs', 'tests/fixtures/action-vfx/index.html', 'tests/fixtures/action-vfx/scene.mjs', 'tests/lib/edge-review.cjs',
  'tests/fixtures/action-vfx/advance.mjs', 'tests/fixtures/action-vfx/capture.mjs', 'tests/fixtures/action-vfx/pose-oracle.mjs', 'tests/fixtures/action-vfx/camera-fit.mjs', 'tests/fixtures/action-vfx/capture-plan.cjs', 'tests/fixtures/action-vfx/webm-evidence.cjs',
  '.engine/threejs/actions/action-package.mjs', '.engine/threejs/actions/action-scene.mjs', '.engine/threejs/actions/action-v2.mjs',
  '.engine/threejs/particles/three-quarks-runtime.mjs', '.engine/threejs/particles/three-vfx-runtime.mjs', '.engine/threejs/particles/vfx-package.mjs', '.engine/threejs/postprocessing/postprocessing-runtime.mjs'];
const before = Object.fromEntries(sourceNames.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name)))]));
const fixtureBytes = fs.readFileSync(path.join(assets, 'fixture.json')), fixture = JSON.parse(fixtureBytes);
const exact = {three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1', postprocessing: '6.39.5'};
for (const [name, version] of Object.entries(exact)) if (JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version !== version) throw Error('Explicit installed module drift: ' + name);
const captureFps = fixture.captureSettings?.fps ?? 4; if (captureFps !== 4) throw Error('This explicit bounded receiving fixture selects 4fps PNG cadence');
let checks = 0, artifactBytes = 0; const artifacts = [];
const check = (condition, why) => { if (!condition) throw Error(why); checks++; };
const summary = value => { const {events, ...rest} = value; return {...rest, events: events.length, families: [...new Set(events.filter(event => event.type === 'layer-start').map(event => event.family))]}; };
function relativeAsset(name) { if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(name)) throw Error('Explicit fixture-relative asset required'); const file = path.resolve(assets, name); if (!file.startsWith(assets + path.sep)) throw Error('Fixture escaped asset root'); return file; }
function saveJson(name, value) { const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); if (artifactBytes + bytes.length > 67108864) throw Error('Whole receiving run exceeded 64MiB'); fs.writeFileSync(path.join(output, name), bytes, {flag: 'wx'}); artifactBytes += bytes.length; return {path: name, sha256: hash(bytes), bytes: bytes.length}; }
function assertFrame(frame, plan, sample) {
  check(frame.absoluteClock.observedTime >= sample.time && frame.absoluteClock.roundoffSeconds <= 4 * frame.absoluteClock.maxClockTick, 'Absolute capture labels a predecessor or excessive overshoot exact');
  check(frame.glError === 0 && frame.shaderErrors.length === 0, 'Actual action shader/GL failure'); check(frame.occupiedPixels > 10, 'Actual model/action frame is blank');
  check(frame.framing?.projection?.status === 'passed', 'Actual promised model/target/effect bounds lack projection evidence');
  check(frame.poseOracles.every(oracle => oracle.status === 'passed'), 'Independent second-GLB parse/mixer pose oracle was not exercised');
  const semantic = sample.tags.some(tag => tag !== 'after-boundary' && tag !== 'cadence');
  if (!semantic) return;
  for (const actor of frame.actors) {
    const observed = frame.events.filter(event => event.actor === actor.id);
    for (const step of plan.action.steps) {
      if (timeKey(step.start) === timeKey(sample.time)) check(observed.some(event => event.type === 'step-enter' && event.step === step.id && event.occurrence === step.occurrence && event.time === step.start), 'Exact step-start capture is missing its transition');
      if (timeKey(step.end) === timeKey(sample.time)) check(observed.some(event => event.type === 'step-exit' && event.step === step.id && event.occurrence === step.occurrence && event.time === step.end), 'Exact step-end capture is missing its transition');
    }
    for (const marker of plan.action.markers.filter(marker => timeKey(marker.at) === timeKey(sample.time))) check(observed.some(event => event.type === 'marker' && event.markerId === marker.id && event.time === marker.at), 'Exact marker was not delivered before capture');
    for (const cue of plan.action.cues) {
      if (timeKey(cue.start) === timeKey(sample.time)) check(observed.some(event => event.type === 'cue-start' && event.cue === cue.id && event.time === cue.start), 'Exact release was not delivered before capture');
      if (timeKey(cue.end) === timeKey(sample.time)) check(observed.some(event => event.type === 'cue-end' && event.cue === cue.id && event.time === cue.end), 'Exact cue end was not delivered before capture');
      for (const layer of cue.layers.filter(layer => timeKey(layer.start) === timeKey(sample.time))) check(observed.some(event => event.type === 'layer-start' && event.cue === cue.id && event.layer === layer.id && event.time === layer.start), 'Exact layer start was not delivered before capture');
    }
    if (sample.time >= plan.action.duration) check(actor.state.motionEnded && actor.rigLeases === 0, 'Motion-end capture retained pose writes');
  }
}
withEdgeReview({edge, source: ROOT, modules, fixture: path.join(ROOT, 'tests/fixtures/action-vfx'), assets, output}, async browser => {
  const binary = async (id, name) => {
    if (artifacts.length >= 512) throw Error('Receiving artifact file budget exceeded');
    const result = await writeBrowserArtifact({browser, artifactId: id, path: path.join(output, name), maxBytes: Math.min(16777216, 67108864 - artifactBytes)});
    const reference = {path: name, sha256: result.sha256, bytes: result.bytes}; artifactBytes += result.bytes; artifacts.push({...reference, mimeType: result.mimeType, webm: result.webm || result.inspection || null}); return {...result, ...reference};
  };
  const png = async name => { const info = await browser.evaluate('window.__actionVfxReview.capturePng()'); check(info.mimeType === 'image/png', 'Actual canvas PNG was not supplied'); const written = await binary(info.id, name); return {path: written.path, sha256: written.sha256, bytes: written.bytes}; };
  await browser.navigate('index.html'); const deadline = Date.now() + 45000;
  while (Date.now() < deadline) { const state = await browser.evaluate('({ready:window.__actionVfxReady,error:window.__reviewError||null})'); if (state.error) throw Error(state.error); if (state.ready) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  check(await browser.evaluate('window.__actionVfxReady === true'), 'Actual original-model review did not become ready');
  const driver = await browser.evaluate('window.__actionVfxReview.driver'), capabilities = await browser.evaluate('window.__actionVfxReview.captureCapabilities()'), cases = [], caseInputs = [], observedFamilies = new Set();
  check(capabilities.captureStream && capabilities.mediaRecorder && capabilities.selectedCodecSupported, 'Selected actual WebM capture capability unavailable');
  for (let caseIndex = 0; caseIndex < fixture.cases.length; caseIndex++) {
    const item = fixture.cases[caseIndex], packageBytes = fs.readFileSync(relativeAsset(item.package)), pkg = JSON.parse(packageBytes), nativeAdmission = typeof item.nativeAdmission === 'string' ? JSON.parse(fs.readFileSync(relativeAsset(item.nativeAdmission), 'utf8')) : item.nativeAdmission;
    check(!item.action || pkg.actions.length === 1, 'Receiving cannot omit other exported actions selected out of a package');
    const row = {id: item.id, profile: pkg.profile, modelSha256: pkg.model.sha256, packageSha256: hash(packageBytes), runtimeBuildSha256: nativeAdmission.runtimeBuildSha256,
      effectClosureSha256: pkg.effectClosureSha256, engineIdentity: pkg.engine, coverage: [], layerCoverage: [], actions: [], lifecycle: null, concurrency: null};
    for (let actionIndex = 0; actionIndex < pkg.actions.length; actionIndex++) {
      const action = pkg.actions[actionIndex], plan = buildCapturePlan(pkg, action.id, captureFps), prefix = 'case-' + caseIndex + '-action-' + actionIndex, frames = []; let peakEffectPixels = 0, lastEvents = [];
      await browser.evaluate(`window.__actionVfxReview.select(${JSON.stringify(item.id)},${JSON.stringify({actionId: action.id})})`);
      for (let index = 0; index < plan.samples.length; index++) {
        const sample = plan.samples[index], frame = await browser.evaluate(`window.__actionVfxReview.advanceTo(${JSON.stringify(sample.time)})`); assertFrame(frame, plan, sample);
        peakEffectPixels = Math.max(peakEffectPixels, frame.effectPixels); lastEvents = frame.events; for (const event of frame.events) if (event.type === 'layer-start') observedFamilies.add(event.family);
        const artifact = await png(prefix + '-combined-' + index + '.png'); frames.push({...sample, ...summary(frame), artifact});
      }
      check(peakEffectPixels > 10, 'No actual effect pixels differ from the same model-only scene: ' + item.id);
      check(frames.some(frame => frame.poseOracles.some(oracle => oracle.offGrid)), 'Actual composite interpolation lacks an off-grid GLB oracle sample');
      const normal = await browser.evaluate(`window.__actionVfxReview.normal(${JSON.stringify(item.id)},${JSON.stringify({actionId: action.id})})`);
      check(normal.frames > 3 && normal.presentationSeconds >= action.retireAt && Object.values(normal.cleanup).every(value => value === 0), 'Complete normal-speed playback and bounded drain were not observed');
      const movie = await binary(normal.video.id, prefix + '-normal-speed.webm'), inspection = movie.webm || movie.inspection;
      check(inspection && (inspection.videoFrames || inspection.frameCount) >= 3, 'Actual encoded WebM video frames were not independently verified');
      check(inspection.firstVideoSeconds >= 0 && inspection.firstVideoSeconds <= 1 / capabilities.frameRate && inspection.monotonicBlockTimestamps === true, 'Actual WebM omits its start or has nonmonotonic timestamps');
      check((inspection.lastVideoSeconds ?? inspection.lastTimestampSeconds) >= action.retireAt && inspection.frameSpanSeconds >= action.retireAt - 1 / capabilities.frameRate, 'Actual WebM span truncates authored action/drain');
      const replayPeaks = [normal.peak.activeEffects > Math.max(...frames.map(frame => frame.state.activeEffects)) ? normal.peak.time : null,
        normal.particlePeak.particles > Math.max(...frames.map(frame => frame.state.vfx.particles)) ? normal.particlePeak.time : null].filter(time => time !== null);
      for (const peakTime of [...new Set(replayPeaks)]) {
        check(peakTime <= action.retireAt, 'Observed normal peak lies outside authored envelope');
        await browser.evaluate(`window.__actionVfxReview.select(${JSON.stringify(item.id)},${JSON.stringify({actionId: action.id})})`);
        const frame = await browser.evaluate(`window.__actionVfxReview.advanceTo(${JSON.stringify(peakTime)})`), key = timeKey(peakTime);
        check(!frames.some(sample => timeKey(sample.time) === key), 'Peak replay would alias an existing lower-occupancy capture');
        frames.push({time: peakTime, tags: ['observed-normal-peak'], ...summary(frame), artifact: await png(prefix + '-normal-peak-' + frames.length + '.png')});
      }
      frames.sort((a, b) => a.time - b.time); const maximum = Math.max(...frames.map(frame => frame.state.activeEffects));
      check(maximum >= normal.peak.activeEffects, 'PNG schedule did not capture the observed normal-speed maximum occupancy');
      const maximumParticles = Math.max(...frames.map(frame => frame.state.vfx.particles)), maximumVisiblePixels = Math.max(...frames.map(frame => frame.effectPixels));
      check(maximumParticles >= normal.particlePeak.particles, 'PNG schedule did not capture observed normal-speed particle maximum');
      for (const frame of frames) frame.occupancyPeaks = [frame.state.activeEffects === maximum ? 'active-effects' : null, frame.state.vfx.particles === maximumParticles ? 'particles' : null,
        frame.effectPixels === maximumVisiblePixels ? 'visible-effect-pixels' : null].filter(Boolean);
      const peakObservations = {activeEffects: {maximum, times: frames.filter(frame => frame.state.activeEffects === maximum).map(frame => frame.time)},
        particles: {maximum: maximumParticles, times: frames.filter(frame => frame.state.vfx.particles === maximumParticles).map(frame => frame.time)},
        visibleEffectPixels: {maximum: maximumVisiblePixels, times: frames.filter(frame => frame.effectPixels === maximumVisiblePixels).map(frame => frame.time), scope: 'Maximum among declared cadence/semantic/after-boundary PNG samples, not every continuous video pixel'}};
      const coverage = {action: action.id, start: 0, end: action.retireAt, fps: plan.fps, normalSpeed: {path: movie.path, sha256: movie.sha256, bytes: movie.bytes},
        samples: frames.map(frame => ({time: frame.time, artifact: frame.artifact, maximumOccupancy: frame.occupancyPeaks.length > 0})), cleanup: normal.cleanup};
      row.coverage.push(coverage); row.actions.push({action: action.id, expectedFamilies: plan.expectedFamilies, peakEffectPixels, maximumObservedEffects: maximum, peakObservations, frames, transitionEvents: saveJson(prefix + '-transition-events.json', lastEvents),
        normal: {...normal, video: {...normal.video, artifact: coverage.normalSpeed, webm: inspection}, final: summary(normal.final)}});
      console.log(JSON.stringify({case: item.id, action: action.id, pngFrames: frames.length, normalFrames: normal.frames, videoBytes: movie.bytes, peakEffectPixels}));
    }
    let layerIndex = 0;
    for (const source of pkg.effectSources) {
      const paths = item.effects.find(effect => effect.id === source.id), profile = JSON.parse(fs.readFileSync(relativeAsset(paths.profile), 'utf8'));
      for (const layer of profile.layers.filter(layer => layer.effectId === source.effectId)) {
        const combined = row.actions.flatMap(action => action.frames.map(frame => ({action: pkg.actions.find(value => value.id === action.action), frame}))).find(({action, frame}) =>
          frame.effectPixels > 0 && frame.actors.some(actor => actor.state.effects.some(effect => effect.layer === layer.layerId && action.cues.some(cue => cue.id === effect.cue && cue.source === source.id))));
        check(combined, 'Selected native layer lacks an actual combined-action correspondence: ' + source.id + '/' + layer.layerId);
        const isolated = await browser.evaluate(`window.__actionVfxReview.isolate(${JSON.stringify(item.id)},${JSON.stringify(source.id)},${JSON.stringify(layer.layerId)})`);
        check(isolated.effectPixels > 5 && isolated.glError === 0 && isolated.shaderErrors.length === 0, 'Exact isolated native layer is blank or has shader errors: ' + layer.family);
        const prefix = 'case-' + caseIndex + '-layer-' + layerIndex++, views = {isolated: await png(prefix + '-isolated.png')}, viewMetrics = {isolated: summary(isolated)};
        for (const background of ['dark', 'light']) { const frame = await browser.evaluate(`window.__actionVfxReview.isolationBackground(${JSON.stringify(background)})`);
          check(frame.effectPixels > 5 && frame.glError === 0 && frame.shaderErrors.length === 0, 'Actual native layer failed contrasting background: ' + layer.family + '/' + background);
          views[background] = await png(prefix + '-' + background + '.png'); viewMetrics[background] = summary(frame); }
        row.layerCoverage.push({sourceId: source.id, effectId: source.effectId, layerId: layer.layerId, family: layer.family, ...views, combinedSha256: combined.frame.artifact.sha256, observations: viewMetrics});
      }
    }
    const concurrency = await browser.evaluate(`window.__actionVfxReview.concurrent(${JSON.stringify(item.id)})`);
    check(concurrency.concurrency.actors === 2 && concurrency.concurrency.ownerCount === 1 && concurrency.concurrency.ambient.time > 0 && concurrency.effectPixels > 10, 'Actual shared two-actor plus ambient frame failed');
    row.concurrency = {...summary(concurrency), artifact: await png('case-' + caseIndex + '-two-actors-ambient.png')};
    cases.push(row); caseInputs.push({item, pkg});
  }
  for (let index = 0; index < cases.length; index++) { cases[index].lifecycle = await browser.evaluate(`window.__actionVfxReview.lifecycle(${JSON.stringify(cases[index].id)})`);
    const restored = cases[index].lifecycle.tests.find(test => test.id === 'context-restoration')?.observation;
    if (restored?.artifact) { const actual = await binary(restored.artifact.id, 'case-' + index + '-context-restored.png'); restored.artifact = {path: actual.path, sha256: actual.sha256, bytes: actual.bytes}; }
    cases[index].cloneResetStability = await browser.evaluate(`window.__actionVfxReview.cloneResetStability(${JSON.stringify(cases[index].id)})`);
    check(cases[index].cloneResetStability.status === 'passed', 'Caller clone/reset GPU texture stability was not observed');
  }
  const required = fixture.requireFamilies || ['sprite', 'burst', 'ring', 'mesh', 'projectile', 'trail', 'impact', 'ground-indicator', 'beam'];
  for (const family of required) check(observedFamilies.has(family), 'Required native family lacks actual action evidence: ' + family);
  const cleanup = await browser.evaluate('window.__actionVfxReview.dispose()');
  check(cleanup.borrowedResourcesPreserved && cleanup.finalSystems === 0 && cleanup.composerPreserved && cleanup.composerSurvivesActionDisposal && cleanup.composerFirstDispose === true && cleanup.composerSecondDispose === false, 'Actual caller resources/compositor cleanup failed');
  for (const row of cases) {
    const observed = new Map(row.lifecycle.tests.map(test => [test.id, test]));
    for (const [id, observation] of [['exact-release', {actions: row.actions.length, exactBoundaryEvents: true, independentSecondGlbPoseAndAnchorOracle: true}],
      ['normal-drain', {videos: row.coverage.map(value => value.normalSpeed), cleanup: row.coverage.map(value => value.cleanup)}],
      ['aggregate-scene-ownership', row.concurrency.concurrency], ['concurrent-actors-and-ambient', {artifact: row.concurrency.artifact, ...row.concurrency.concurrency}],
      ['resource-disposal', {borrowedResourcesPreserved: cleanup.borrowedResourcesPreserved, compositorPreserved: cleanup.composerPreserved, finalSystems: cleanup.finalSystems, cloneResetStability: row.cloneResetStability}],
      ['isolated-layer-families', {layers: row.layerCoverage.map(value => ({source: value.sourceId, layer: value.layerId, family: value.family, artifact: value.isolated}))}],
      ['contrasting-backgrounds', {layers: row.layerCoverage.map(value => ({layer: value.layerId, dark: value.dark, light: value.light}))}]]) observed.set(id, {id, status: 'passed', observation});
    row.tests = [...observed.values()]; row.receivingTestsComplete = row.tests.every(test => test.status === 'passed');
  }
  const after = Object.fromEntries(sourceNames.map(name => [name, hash(fs.readFileSync(path.join(ROOT, name)))])); check(JSON.stringify(before) === JSON.stringify(after), 'Candidate source changed during evidence');
  check(hash(fs.readFileSync(path.join(assets, 'fixture.json'))) === hash(fixtureBytes), 'Native fixture changed during evidence');
  const libraryInventory = saveJson('library-inventory.json', {versions: exact, modules, requests: browser.requests.filter(request => request.path.startsWith('/deps/'))});
  const cameraIdentity = saveJson('camera.json', {cases: cases.map(row => ({id: row.id, actions: row.actions.map(action => ({action: action.action, frames: action.frames.map(frame => ({time: frame.time, captureEpoch: frame.captureEpoch, camera: frame.camera, framing: frame.framing}))})),
    isolated: row.layerCoverage.map(layer => ({source: layer.sourceId, layer: layer.layerId, camera: layer.observations.isolated.camera, framing: layer.observations.isolated.framing})), concurrent: {camera: row.concurrency.camera, framing: row.concurrency.framing}}))});
  const settingsIdentity = saveJson('capture-settings.json', {pngFps: captureFps, width: 960, height: 540, capabilities, artifactLimits: {bytes: 67108864, files: 512}, normalSpeedPaddingSeconds: .2,
    contrastBackgrounds: {neutral: '#344150', dark: '#070b10', light: '#f4f5f7'}, sourceHashes: before, clockPolicy: 'Observed absolute actor time, explicit representable scene ticks, no epsilon-early runtime transitions'});
  const deviceIdentity = saveJson('target-device.json', {browser: browser.version, driver, platform: process.platform, arch: process.arch, scope: 'Existing default desktop Edge on this host; no device class, MAUI or physical QA claim'});
  const runtimeTests = saveJson('runtime-test.json', {schemaVersion: 'hephaera-action-vfx-actual-tests/v1', status: cases.every(row => row.receivingTestsComplete) ? 'passed' : 'incomplete', sourceHashes: before,
    cases: cases.map(row => ({id: row.id, modelSha256: row.modelSha256, packageSha256: row.packageSha256, runtimeBuildSha256: row.runtimeBuildSha256, tests: row.tests})), cleanup,
    scope: 'Every passed row is tied to observed actual selected-engine operations/captures. Failed or unavailable rows remain explicit. No human acceptance or promotion.'});
  const captureIndex = saveJson('runtime-capture.json', {schemaVersion: 'hephaera-action-vfx-capture-index/v1', status: cases.every(row => row.receivingTestsComplete) ? 'captured' : 'incomplete', sourceHashes: before,
    cases: cases.map(row => ({id: row.id, engine: row.engineIdentity, modelSha256: row.modelSha256, packageSha256: row.packageSha256, runtimeBuildSha256: row.runtimeBuildSha256, effectClosureSha256: row.effectClosureSha256,
      coverage: row.coverage, layerCoverage: row.layerCoverage.map(({observations, ...value}) => value), concurrent: row.concurrency.artifact})),
    environment: {libraryInventory, camera: cameraIdentity, captureSettings: settingsIdentity, targetDevice: deviceIdentity}, artifacts,
    limits: 'Factual original-engineering capture index, not a native receiving approval or human verdict. Root must provide exact task-local references and actual performance evidence before native validation.'});
  const result = {checks, driver, capabilities, cases, observedFamilies: [...observedFamilies], artifacts, artifactBytes, cleanup, sourceHashes: before, fixtureSha256: hash(fixtureBytes), versions: exact,
    runtimeTests, captureIndex, receivingTestsComplete: cases.every(row => row.receivingTestsComplete),
    scope: 'Actual selected default desktop WebGL2, pinned Quarks and selected PMNDRS LDR/FXAA, independently checked original GLBs, real normal-speed WebM and bounded PNGs. No human quality/acceptance, MAUI/device or promotion claim.'};
  saveJson('action-vfx-result.json', result); return result;
}).then(result => { console.log(JSON.stringify({output, checks: result.checks, artifacts: result.artifacts.length, artifactBytes: result.artifactBytes, receivingTestsComplete: result.receivingTestsComplete, driver: result.driver})); if (!result.receivingTestsComplete) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
