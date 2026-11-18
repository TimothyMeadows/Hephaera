'use strict';

// Trusted inert native ports and owned bytes only. Nothing here executes Bubo,
// imports models, probes a GPU, renders an image or supplies real human approval.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const runtime = require('../commands/lib/bubo-runtime.cjs');
const lifecycle = require('../commands/lib/image-to-splat-state.cjs');
const BASE = path.resolve(__dirname, '..');
const cache = path.join(BASE, '.hephaera/.cache/tasks/hephaera-image-to-splat/evidence/lifecycle-fixtures');
fs.mkdirSync(cache, { recursive: true });
let checks = 0;
const check = (value, reason) => { assert(value, reason); checks++; console.log('PASS: ' + reason); };
const rejects = (action, pattern, reason) => { assert.throws(action, pattern); checks++; console.log('PASS: ' + reason); };
async function rejected(action, pattern, reason) { await assert.rejects(action, pattern); checks++; console.log('PASS: ' + reason); }
const clone = value => JSON.parse(JSON.stringify(value));
const SHA = data => crypto.createHash('sha256').update(data).digest('hex');
const CANONICAL = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const media = '# MEDIA.md\nGenerated from Hephaera media pipeline templates:\n- CLOUD\n- LOCAL\n---\n'
  + ['Pipeline Availability', 'Capability Matrix', 'Destinations And Budgets', 'Rights, Consent, And Provenance', 'Review And Promotion'].map(x => '## ' + x + '\n').join('\n')
  + 'Image, music, sound-effect SFX and voice are separately declared. Require the user to choose a provider. Never switch or fall back between providers silently.\n';
function fixture() {
  const root = fs.mkdtempSync(path.join(cache, 'owned-')), task = 'splat-fixture', workspace = '.hephaera/.cache/splat-workspace', mediaState = '.hephaera/.cache/shared-state';
  const write = (name, value) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); return name;
  };
  const ref = name => lifecycle.identity(root, name);
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  write('STYLE.md', fs.readFileSync(path.join(BASE, 'STYLE.md'))); write('MEDIA.md', media);
  write(`${'.hephaera/.cache/tasks/' + task}/TASK.md`, '# Synthetic lifecycle fixture; no production permission\n');
  write('inputs/source.png', 'OWNED SYNTHETIC nonimage input; no native image decoding');
  write('inputs/rights.json', { schemaVersion: 'bubo-splat-source-rights/v1', sourceSha256: ref('inputs/source.png').sha256,
    scope: 'local-generation', rightsBasis: 'owned', approvedBy: 'SYNTHETIC fixture only' });
  write('inputs/approval.json', { schemaVersion: 'bubo-splat-generation-approval/v1', task,
    ledgerRoot: mediaState + '/image-to-splat/ledger', sourceSha256: ref('inputs/source.png').sha256, styleSha256: ref('STYLE.md').sha256,
    catalogSha256: 'c'.repeat(64), maximumCandidates: 1, maximumRevisions: 1, generationApproved: true, gpuAvailabilityConfirmed: true,
    approvedBy: 'SYNTHETIC fixture only', sourceRights: ref('inputs/rights.json') });
  write('inputs/component-license-source.txt', 'SYNTHETIC component-licence source evidence; no actual acceptance');
  write('inputs/component-license.json', { fixture: 'SYNTHETIC nested licence metadata', evidence: [ref('inputs/component-license-source.txt')] });
  write('inputs/component-decision.txt', 'SYNTHETIC component-review decision; no actual commercial clearance');
  write('inputs/component-review.json', { fixture: 'SYNTHETIC component-review metadata', evidence: [ref('inputs/component-decision.txt')] });
  write('inputs/retained-ledger-decision.txt', 'SYNTHETIC retained first-use ledger decision, omitted from current init options');
  write('inputs/retained-ledger-registration.json', { fixture: 'SYNTHETIC retained registration', decisionEvidence: ref('inputs/retained-ledger-decision.txt') });
  write('inputs/installation.json', { fixture: 'Owned nonexecutable installation metadata; no model bytes',
    registration: { licenses: [ref('inputs/component-license.json')], componentReview: ref('inputs/component-review.json') } });
  write(`.hephaera/.cache/tasks/${task}/selection.json`, { schemaVersion: 1, pipeline: 'LOCAL', selectionSource: 'prompt', styleContract: 'STYLE.md', styleSha256: ref('STYLE.md').sha256, fallbackPolicy: 'stop' });
  const selection = `.hephaera/.cache/tasks/${task}/selection.json`;
  const budgets = { maxGaussians: 131072, maxInputBytes: 33554432, maxDecodedBytes: 33554432, maxHeaderBytes: 65536, timeoutSeconds: 60, maxLogBytes: 1048576, maxProcessMemoryBytes: 2147483648 };
  const request = { schemaVersion: 'bubo-splat-generation/v1', task, runId: 'owned-run', attemptKind: 'candidate',
    request: { schemaVersion: 'bubo-splat-request/v1', backend: 'triposplat', styleSha256: ref('STYLE.md').sha256, input: ref('inputs/source.png'), gaussianCounts: [32768, 131072], seed: 42, budgets },
    installation: ref('inputs/installation.json'), authorization: ref('inputs/approval.json'), settings: { steps: 20, guidance: 3, shift: 3, erodeRadius: 1 },
    limits: { maxInputPixels: 1048576, maxInputEdge: 1024, maxAspectRatio: 1, maxOutputBytes: 33554432, maxGpuAllocatedBytes: 2147483648, minGpuFreeBytes: 1073741824 } };
  write('inputs/generation.json', request);
  const resourceBytes = JSON.stringify({ schemaVersion: 'synthetic-resources/v1', files: {} }, null, 2) + '\n';
  const catalogBytes = JSON.stringify({ schemaVersion: 'synthetic-splat-catalog/v1', noModels: true }, null, 2) + '\n';
  const info = { pinned: { revision: 'a'.repeat(40), resourceCatalogSha256: SHA(resourceBytes) }, capability: { build: { cliSha256: 'd'.repeat(64), resourceCatalogSha256: SHA(resourceBytes), assemblies: {}, launch: {} } } };
  let mode = 'normal', calls = 0, policyRefs = [], packageRef = null, forwarded = null, extraReferences = [];
  function packageFor(selected, requestPath) {
    const output = `${workspace}/staging/image-to-splat/${task}/${selected.runId}`;
    const claimPath = `${mediaState}/image-to-splat/ledger/${selected.request.input.sha256}/${selected.attemptKind}.json`;
    if (fs.existsSync(path.join(root, claimPath))) throw new Error('SYNTHETIC native source candidate already claimed; no new allowance');
    const source = write(output + '/source.img', fs.readFileSync(path.join(root, selected.request.input.path)));
    const retained = write(output + '/request.json', fs.readFileSync(path.join(root, requestPath)));
    const worker = write(output + '/worker-result.json', { fixture: 'SYNTHETIC; no real worker or Gaussian data' });
    const claim = write(claimPath, { fixture: 'SYNTHETIC claim, not a native attempt', task, runId: selected.runId });
    const variants = selected.request.gaussianCounts.map(count => {
      const payload = write(output + '/gaussian-' + count + '.ply', 'SYNTHETIC nonPLY payload ' + count);
      const artifact = write(output + '/artifact-' + count + '.json', { schemaVersion: 'bubo-splat-artifact/v1', payload: ref(payload), input: ref(source), gaussianCount: count,
        ancestry: { requestSha256: ref(requestPath).sha256, runtimeBuildSha256: 'f'.repeat(64), resourceCatalogSha256: info.pinned.resourceCatalogSha256 }, styleSha256: selected.request.styleSha256 });
      return { artifact: ref(artifact), payload: ref(payload), inspection: { fixture: 'SYNTHETIC only' } };
    });
    if (mode === 'partial') variants.pop();
    const pkg = { schemaVersion: 'bubo-splat-package/v1', task, runId: selected.runId, catalogSha256: SHA(catalogBytes), runtimeBuildSha256: 'f'.repeat(64),
      resourceCatalogSha256: info.pinned.resourceCatalogSha256, installation: selected.installation, environmentSha256: 'e'.repeat(64), request: ref(retained), source: ref(source),
      workerResult: ref(worker), claim: ref(claim), candidateClaimSha256: null, variants, humanReview: 'pending', promotion: false };
    packageRef = ref(write(output + '/package.json', pkg)); return { ref: packageRef, value: pkg };
  }
  const adapter = { async invoke(operation, options, controls) {
    calls++; policyRefs = controls.policyReferences; forwarded = new Map(options);
    check(controls.emit === false && (operation === 'generate' ? controls.policyReferences.some(value => value.path.endsWith('/manifest.json')) : controls.policyReferences.length === 0),
      operation === 'generate' ? 'native generation receives exact queued lifecycle policy references' : 'pure native operation uses adapter references without generation-only policy overrides');
    const folder = `.hephaera/.cache/tasks/${task}/bubo-splats/dispatch/${crypto.randomUUID()}/bubo-host/${crypto.randomUUID()}`;
    const admitted = new Map();
    function admit(name, kind) { const value = typeof name === 'string' ? ref(name) : name; admitted.set(value.path, { ...value, kind }); }
    admit(options.get('request'), 'input'); admit('inputs/source.png', 'input'); admit('inputs/installation.json', 'input');
    for (const name of ['rights.json', 'approval.json', 'component-license.json', 'component-license-source.txt', 'component-review.json', 'component-decision.txt']) admit('inputs/' + name, 'rights');
    for (const name of ['STYLE.md', 'MEDIA.md', selection, 'inputs/retained-ledger-registration.json', 'inputs/retained-ledger-decision.txt']) admit(name, 'policy');
    for (const value of controls.policyReferences) if (!admitted.has(value.path)) admit(value, 'policy');
    for (const value of extraReferences) admit(value, value.kind);
    const context = write(folder + '/host-context.json', { schemaVersion: 'bubo-host-context/v1', projectRoot: root, task,
      policy: { pipeline: 'LOCAL', styleSha256: request.request.styleSha256 }, references: [...admitted.values()] });
    if (operation === 'generate') {
      if (mode === 'before-launch-failure') throw new Error('SYNTHETIC blocked before native launch');
      controls.lifecycle.beforeLaunch({ contextFile: context });
      controls.lifecycle.spawned({ pid: 123, launchState: mode === 'uncertain' ? 'unknown' : 'started' });
      controls.lifecycle.closed({ pid: 123, status: mode === 'uncertain' ? null : mode === 'cancelled' ? 1 : 0, signal: mode === 'cancelled' ? 'SIGINT' : null, launchState: mode === 'uncertain' ? 'unknown' : 'started' });
      if (mode === 'cancelled' || mode === 'uncertain') throw new Error('SYNTHETIC interrupted native run');
      if (mode === 'claimed-failure') {
        const selected = read(options.get('request'));
        write(`${mediaState}/image-to-splat/ledger/${selected.request.input.sha256}/candidate.json`, { fixture: 'SYNTHETIC previously spent native claim', runId: selected.runId });
        throw new Error('SYNTHETIC failure after native claim');
      }
      if (mode === 'queue-mutation') write('inputs/rights.json', { fixture: 'changed while queued' });
    }
    let resultData;
    if (operation === 'generate') {
      const selected = read(options.get('request')), generated = packageFor(selected, options.get('request'));
      resultData = { schemaVersion: 'bubo-splat-generation-result/v1', status: 'generated-staged', manifest: generated.ref,
        requestSha256: ref(options.get('request')).sha256, outputs: generated.value.variants.length, technicalOnly: true, humanReview: 'pending', runtimeAcceptance: false, promotion: false };
    } else if (operation === 'verify-package') resultData = { schemaVersion: 'bubo-splat-package-verification/v1', valid: true, technicalOnly: true,
      constructionRecordsVerified: mode !== 'structural-only', variants: read(packageRef.path).variants.length, humanReview: 'pending', runtimeAcceptance: false, promotion: false, gpuUsed: false };
    else resultData = { schemaVersion: 'bubo-splat-request-validation/v1', valid: true, gpuUsed: false, inputDecodingVerified: false };
    const result = { schemaVersion: 'bubo-execution-result/v1', apiVersion: 2, workflow: 'image-to-splat', operation, status: 'succeeded',
      hostContextSha256: ref(context).sha256, data: resultData };
    const resultFile = write(folder + '/result.json', result), timing = write(folder + '/timing.json', { fixture: 'SYNTHETIC counters, no production timing' });
    const producerBuild = clone(info.capability.build);
    if (mode === 'changed-build-snapshot') producerBuild.cliSha256 = '8'.repeat(64);
    const build = write(folder + '/runtime-build.json', { schemaVersion: 'bubo-build/v1', sourceRevision: info.pinned.revision, sourceDirty: false, capabilities: { build: producerBuild } });
    const resources = write(folder + '/runtime-resources.json', resourceBytes), catalog = write(folder + '/splat-catalog.json', catalogBytes);
    return { ...result, hostSplatDispatch: { directory: folder, hostContext: ref(context), result: ref(resultFile), timing: ref(timing), buildReceipt: ref(build), resourceCatalog: ref(resources), catalog: ref(catalog) } };
  } };
  const service = lifecycle.createService(adapter, { nativeIdentity: () => clone(info) });
  const init = extra => service.init({ root, task, asset: 'owned-prop', version: 'v1', creator: 'creator', request: 'inputs/generation.json', selection, media: 'MEDIA.md', workspace, mediaState, ...extra });
  const owner = asset => ({ root, manifest: asset.manifest });
  function packet(asset, suffix = 'complete', modify = value => value) {
    const pkg = read(packageRef.path), views = [];
    for (const angle of CANONICAL) views.push({ id: angle, kind: 'canonical', angle });
    for (let yaw = 0; yaw < 360; yaw += 45) views.push({ id: 'orbit-' + yaw, kind: 'orbit', angle: yaw });
    const variants = pkg.variants.map((variant, index) => ({ artifact: variant.artifact, payload: variant.payload, views: views.map(view => {
      const camera = write(`review/${suffix}/camera-${view.id}.json`, { fixture: 'SYNTHETIC camera', view: view.id, angle: view.angle, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
      const image = write(`review/${suffix}/density-${index}/${view.id}.png`, 'OWNED SYNTHETIC nonimage bytes ' + suffix + ' ' + view.id);
      return { ...view, image: ref(image), camera: ref(camera) };
    }) }));
    const value = modify({ schemaVersion: 'hephaera-splat-review-packet/v1', package: packageRef, original: pkg.source, variants,
      coverage: 'SYNTHETIC six canonical and eight45-degree orbit declarations; no rendered quality claim', caveats: ['SYNTHETIC only; raw frame uncalibrated'], calibratedFrame: false, displayRollDegrees: 180 });
    return write('review/' + suffix + '/packet.json', value);
  }
  function decision(subject, kind = 'independent', extra = {}, suffix = kind) {
    const evidence = write('review/' + suffix + '-source.txt', 'SYNTHETIC decision fixture; no actual human approval');
    return write('review/' + suffix + '-decision.json', { schemaVersion: 'hephaera-splat-review/v1', kind, subjectSha256: subject.subjectSha256,
      accepted: true, reviewer: kind === 'independent' ? 'independent-reviewer' : 'synthetic-operator', decisionEvidence: ref(evidence), notes: 'SYNTHETIC lifecycle plumbing only', ...extra });
  }
  return { root, task, workspace, mediaState, write, ref, read, request, service, init, owner, packet, decision, info,
    mode: value => { mode = value; }, extraReferences: value => { extraReferences = value; }, calls: () => calls, refs: () => policyRefs, options: () => forwarded, package: () => packageRef };
}
async function ready() { const f = fixture(), asset = f.init(); await f.service.generate(f.owner(asset)); await f.service.verifyPackage(f.owner(asset)); return { ...f, asset, selected: f.owner(asset) }; }
async function main() {
  const f = fixture(), a = f.init(), selected = f.owner(a);
  check(f.service.status(selected).stage === 'planned' && f.calls() === 0, 'initialization records planning without native execution');
  check(f.service.status(selected).runtimeAcceptance === false && f.service.status(selected).promotion === false, 'visual lifecycle grants no runtime acceptance or promotion');
  rejects(() => f.init(), /exists|EEXIST/i, 'same immutable version cannot be overwritten');
  for (const invalid of [{ root: f.root }, { ...selected, request: 'other.json' }, Object.create(selected)]) rejects(() => f.service.status(invalid), /fields|plain data|protected/, 'continuation requires exact separate owner');
  let accessed = false; const bad = Object.defineProperty({ root: f.root }, 'manifest', { get() { accessed = true; return a.manifest; } });
  rejects(() => f.service.status(bad), /protected/, 'owner accessors rejected'); check(!accessed, 'ownership rejection never invokes an accessor');
  const validated = await f.service.validate(selected); check(f.calls() === 1 && f.service.status(selected).technicalVerification === 'pending', 'request validation does not establish construction verification');
  check(!Object.hasOwn(validated.native, 'runtime') && !Object.hasOwn(f.read(validated.native.hostSplatDispatch.result.path), 'runtime'),
    'actual splat envelope shape without runtime is accepted and raw saved result stays unchanged');
  await f.service.generate(selected); check(f.service.status(selected).stage === 'staged', 'exact native-shaped result records complete staged package');
  check(f.refs().some(ref => ref.path === 'inputs/rights.json') && f.refs().some(ref => ref.path === 'inputs/generation.json'), 'request and original rights survive as queued policy references');
  check(f.service.load(selected).events.some(event => event.kind === 'native-closed' && event.data.launchState === 'started'), 'owned launch and native close evidence retained');
  await rejected(() => f.service.generate(selected), /already owns/, 'second dispatch cannot retry an immutable version');
  rejects(() => f.service.review(selected, { packet: 'absent.json' }), /construction verification/, 'review cannot precede actual package construction verification');
  f.mode('structural-only'); await rejected(() => f.service.verifyPackage(selected), /construction verification/, 'structural-only native result cannot count as verified construction');
  f.mode('normal'); await f.service.verifyPackage(selected); check(f.service.status(selected).technicalVerification === 'passed', 'explicit native construction result is retained separately');
  const originalHash = f.ref(f.package().path).sha256;
  const complete = f.packet(a), subject = f.service.review(selected, { packet: complete });
  check(subject.variants === 2 && subject.calibratedFrame === false && subject.rendererVerified === false, 'complete comparable two-density view packet binds declared coverage without calibration/render certification');
  check(f.service.status(selected).independent === 'pending' && f.service.status(selected).humanBackend === 'pending', 'review packet creates no automatic human or independent acceptance');
  rejects(() => f.service.record(selected, { evidence: f.decision(subject, 'human-backend') }), /independent acceptance/, 'human backend acceptance follows current independent acceptance');
  rejects(() => f.service.record(selected, { evidence: f.decision(subject, 'independent', { reviewer: 'Creator' }, 'self') }), /differ from/, 'creator case aliases cannot satisfy independent review');
  const independent = f.decision(subject); f.service.record(selected, { evidence: independent });
  const human = f.decision(subject, 'human-backend'); const recorded = f.service.record(selected, { evidence: human });
  check(recorded.humanAuthenticityVerifiedByCode === false && f.service.status(selected).humanBackend === true, 'separate recorded source evidence is explicit and not cryptographic human authentication');
  const next = f.service.review(selected, { packet: f.packet(a, 'new-review') });
  check(next.subjectSha256 !== subject.subjectSha256 && f.service.status(selected).independent === 'pending', 'new packet invalidates earlier current review decisions');
  rejects(() => f.service.record(selected, { evidence: independent }), /current review/, 'old-subject decision cannot accept a new review packet');
  check(f.ref(f.package().path).sha256 === originalHash, 'reviews never rewrite native technical package or humanReview field');
  for (const [name, modify, pattern] of [
    ['partial', v => ({ ...v, variants: v.variants.slice(0, 1) }), /every ordered density/],
    ['swapped', v => ({ ...v, variants: [...v.variants].reverse() }), /substitutes a density/],
    ['missing-canonical', v => { v.variants[0].views[0].angle = 'right'; return v; }, /Duplicate.*canonical/],
    ['missing-orbit', v => { v.variants[0].views = v.variants[0].views.filter(view => view.id !== 'orbit-45'); return v; }, /complete view coverage|full orbit/],
    ['gap-orbit', v => { v.variants[0].views[7].angle = 44; return v; }, /full orbit/],
    ['duplicate-image', v => { v.variants[0].views[1].image = v.variants[0].views[0].image; return v; }, /reuses an image/],
    ['ambiguous-camera', v => { v.variants[0].views[1].camera = v.variants[0].views[0].camera; return v; }, /ambiguous camera/],
    ['duplicate-yaw', v => { v.variants[0].views[7].angle = 0; return v; }, /Duplicate.*orbit/],
    ['calibration', v => ({ ...v, calibratedFrame: true }), /calibration claim/],
    ['wrong-original', v => ({ ...v, original: f.ref('inputs/rights.json') }), /original/]
  ]) rejects(() => f.service.review(selected, { packet: f.packet(a, name, modify) }), pattern, 'review rejects ' + name);
  const symmetricPacket = f.packet(a, 'symmetric', value => {
    for (const [index, variant] of value.variants.entries()) {
      const copied = f.write('review/symmetric/density-' + index + '/equal-pixels-distinct-view.png', fs.readFileSync(path.join(f.root, variant.views[0].image.path)));
      variant.views[1].image = f.ref(copied);
    }
    value.caveats = ['Owned symmetric fixture: distinct declared camera records, no actual rendering claim']; return value;
  });
  const symmetric = f.service.review(selected, { packet: symmetricPacket }), symmetricState = f.service.load(selected);
  const symmetricEvent = symmetricState.events.at(-1), verification = [...symmetricState.events].reverse().find(event => event.kind === 'verification-returned');
  check(symmetric.duplicateImageGroups.length === 2 && symmetric.duplicateImageGroups.every(group => group.views.length === 2 && group.views[0].image.path !== group.views[1].image.path
    && JSON.stringify(group.views[0].camera) !== JSON.stringify(group.views[1].camera)), 'symmetric equal pixels in distinct view files and cameras pass with explicit per-density duplicate groups');
  check(symmetric.warnings.length === 1 && symmetric.rendererVerified === false && JSON.stringify(symmetricEvent.data.duplicateImageGroups) === JSON.stringify(symmetric.duplicateImageGroups)
    && JSON.stringify(f.service.status(selected).duplicateImageGroups) === JSON.stringify(symmetric.duplicateImageGroups), 'computed duplicate-image disclosure is retained in event, output and status without claiming rendered coverage');
  const binding = { manifest: symmetricState.identity, policySha256: symmetricState.asset.policy.fingerprint, package: f.package(), verification: verification.identity,
    packet: f.ref(symmetricPacket), references: symmetricEvent.data.references, duplicateImageGroups: symmetric.duplicateImageGroups };
  const subjectDigest = value => SHA(Buffer.from(JSON.stringify(runtime.canonical(value))));
  check(subjectDigest(binding) === symmetric.subjectSha256 && subjectDigest({ ...binding, duplicateImageGroups: [] }) !== symmetric.subjectSha256,
    'computed duplicate-image groups are explicitly bound into the exact review subject hash');
  check(f.service.status(selected).independent === 'pending' && f.service.status(selected).humanBackend === 'pending', 'symmetric warnings do not auto-accept either independent or human backend review');
  f.info.capability.build.cliSha256 = '9'.repeat(64);
  check(f.service.status(selected).staleCurrentNative.includes('current-native-build-changed'), 'current native build drift is distinct from retained historical input state');
  await rejected(() => f.service.verifyPackage(selected), /stale/, 'old-producer package cannot be relabeled or verified through a changed current build');
  check(f.ref(f.package().path).sha256 === originalHash, 'native build drift preserves original package bytes');
  const m = await ready(); const state = m.service.status(m.selected);
  m.write('inputs/rights.json', { fixture: 'modified source-rights assertion' });
  check(m.service.status(m.selected).staleInputs.length > 0, 'source rights mutation invalidates current evidence');
  await rejected(() => m.service.verifyPackage(m.selected), /stale/, 'stale source-rights block continuation');
  for (const name of ['component-license.json', 'component-license-source.txt', 'component-decision.txt', 'retained-ledger-decision.txt']) {
    const closure = await ready(), packet = closure.packet(closure.asset, 'admitted-closure'), subject = closure.service.review(closure.selected, { packet });
    const record = closure.decision(subject), returned = [...closure.service.load(closure.selected).events].reverse().find(event => event.kind === 'verification-returned');
    const saved = returned.data.contextReferences.find(ref => ref.path === 'inputs/' + name);
    check(saved && ['rights', 'policy'].includes(saved.kind) && saved.observedBytes === fs.statSync(path.join(closure.root, saved.path)).size,
      'actual admitted ' + name + ' preserves kind, observed byte size and exact hash');
    check(!closure.service.load(closure.selected).asset.references.some(ref => ref.path === 'inputs/' + name),
      name + ' freshness is captured from actual admission even when absent from init references');
    closure.write('inputs/' + name, name.endsWith('.json') ? { fixture: 'changed nested admitted evidence' } : 'changed nested admitted evidence');
    check(closure.service.status(closure.selected).staleInputs.length > 0, name + ' mutation makes status stale');
    rejects(() => closure.service.review(closure.selected, { packet }), /stale/, name + ' mutation blocks current review');
    rejects(() => closure.service.record(closure.selected, { evidence: record }), /stale/, name + ' mutation blocks current decision record');
  }
  const grown = await ready(), grownPacket = grown.packet(grown.asset, 'grown-policy'), grownSubject = grown.service.review(grown.selected, { packet: grownPacket });
  const grownDecision = grown.decision(grownSubject), grownPath = 'inputs/component-license.json';
  grown.write(grownPath, Buffer.alloc(9 * 1024 * 1024, 32));
  const beforeGrowthHash = runtime.hash;
  try {
    runtime.hash = file => {
      assert.notEqual(path.resolve(file), path.join(grown.root, grownPath), 'Grown admitted metadata must reject by observed size before hashing');
      return beforeGrowthHash(file);
    };
    check(grown.service.status(grown.selected).staleInputs.length > 0, 'oversized growth of admitted small metadata is stale before a larger read');
    rejects(() => grown.service.review(grown.selected, { packet: grownPacket }), /stale/, 'oversized admitted policy blocks review without scanning its grown content');
    rejects(() => grown.service.record(grown.selected, { evidence: grownDecision }), /stale/, 'oversized admitted policy blocks record without scanning its grown content');
  } finally { runtime.hash = beforeGrowthHash; }
  const largeReceipt = fixture(); largeReceipt.write('inputs/installation.json', JSON.stringify({ fixture: 'SYNTHETIC large metadata inventory; no model files' }) + ' '.repeat(9 * 1024 * 1024));
  largeReceipt.request.installation = largeReceipt.ref('inputs/installation.json'); largeReceipt.write('inputs/generation.json', largeReceipt.request);
  const largeAsset = largeReceipt.init();
  check(largeReceipt.service.status(largeReceipt.owner(largeAsset)).stage === 'planned', 'already admitted installation metadata retains its32MiB allowance rather than a generic8MiB policy cap');
  const noScan = fixture(), noScanAsset = noScan.init(); noScan.write('inputs/inert-model.safetensors', 'SYNTHETIC binary marker; not a model');
  const inertIdentity = noScan.ref('inputs/inert-model.safetensors'); noScan.extraReferences([{ ...inertIdentity, kind: 'input' }]);
  const originalHashFunction = runtime.hash;
  try {
    runtime.hash = file => {
      assert.notEqual(path.resolve(file), path.join(noScan.root, inertIdentity.path), 'Lifecycle must not open declared model/native binary inputs');
      return originalHashFunction(file);
    };
    await noScan.service.generate(noScan.owner(noScanAsset));
    check(noScan.service.status(noScan.owner(noScanAsset)).nativeDependenciesReverifiedByStatus === false,
      'admitted metadata closure does not claim automatic model/native-binary verification');
  } finally { runtime.hash = originalHashFunction; }
  const source = await ready(); source.write('inputs/source.png', 'changed source bytes'); check(source.service.status(source.selected).staleInputs.length > 0, 'source relocation/content changes do not inherit existing evidence');
  const moved = fixture(), movedAsset = moved.init(); moved.write('inputs/relocated.png', fs.readFileSync(path.join(moved.root, 'inputs/source.png')));
  moved.request.request.input = moved.ref('inputs/relocated.png'); moved.write('inputs/generation.json', moved.request);
  check(moved.service.status(moved.owner(movedAsset)).staleInputs.length > 0, 'same source bytes at another path require a new explicit version and do not refresh prior evidence');
  const settings = fixture(), settingsAsset = settings.init(); settings.request.settings.steps = 10; settings.write('inputs/generation.json', settings.request);
  check(settings.service.status(settings.owner(settingsAsset)).staleInputs.length > 0, 'settings/request change invalidates immutable current version');
  const style = fixture(), styleAsset = style.init(); style.write('STYLE.md', fs.readFileSync(path.join(style.root, 'STYLE.md'), 'utf8') + '\nStyle revision\n');
  check(style.service.status(style.owner(styleAsset)).staleInputs.length > 0, 'STYLE revision invalidates existing selection and evidence');
  const mediaChange = fixture(), mediaAsset = mediaChange.init(); mediaChange.write('MEDIA.md', media + '\nChanged policy\n');
  check(mediaChange.service.status(mediaChange.owner(mediaAsset)).staleInputs.length > 0, 'MEDIA policy changes invalidate the selected visual version');
  const engine = fixture(), engineAsset = engine.init(); engine.write('ENGINE.md', '# Invalid changed engine contract\n');
  check(engine.service.status(engine.owner(engineAsset)).staleInputs.length > 0, 'invalid changed engine contract cannot silently retain old selection');
  const queue = fixture(), queued = queue.init(); queue.mode('queue-mutation');
  await rejected(() => queue.service.generate(queue.owner(queued)), /stale/, 'queued rights mutation cannot produce accepted host evidence');
  check(queue.service.status(queue.owner(queued)).generationIntentRetained, 'queued failure preserves dispatch intent');
  for (const mode of ['before-launch-failure', 'uncertain', 'cancelled', 'partial']) {
    const broken = fixture(), asset = broken.init(); broken.mode(mode);
    await rejected(() => broken.service.generate(broken.owner(asset)), /SYNTHETIC|package|inventory|density/, 'retains ' + mode + ' failure');
    check(broken.service.status(broken.owner(asset)).recoveryRequired, mode + ' requires explicit retained-state review');
    await rejected(() => broken.service.generate(broken.owner(asset)), /already owns/, mode + ' cannot automatically retry');
  }
  const revision = fixture(), first = revision.init(); revision.request.attemptKind = 'revision'; revision.request.runId = 'revised-run'; revision.write('inputs/revised.json', revision.request);
  const second = revision.init({ version: 'v2', request: 'inputs/revised.json', parentManifest: first.manifest });
  check(revision.service.load(revision.owner(second)).asset.authorization.sha256 === first.asset.authorization.sha256, 'new host revision retains original native authorization and candidate ancestry');
  revision.write('inputs/new-approval.json', { fixture: 'different allowance must not reset native budget' }); revision.request.authorization = revision.ref('inputs/new-approval.json'); revision.request.runId = 'another-run'; revision.write('inputs/changed-approval-request.json', revision.request);
  rejects(() => revision.init({ version: 'v3', request: 'inputs/changed-approval-request.json', parentManifest: first.manifest }), /original candidate/, 'revision cannot replace original approval to reset attempts');
  rejects(() => revision.init({ version: 'no-parent', request: 'inputs/revised.json' }), /retained candidate/, 'revision cannot discard candidate ancestry');
  const registration = fixture(); registration.write('inputs/ledger-decision.txt', 'SYNTHETIC first-use decision fixture; no actual human authorization');
  registration.write('inputs/ledger-history.json', { fixture: 'SYNTHETIC explicit first-use ledger declaration, not actual human approval', decisionEvidence: registration.ref('inputs/ledger-decision.txt') });
  const registered = registration.init({ ledgerRegistration: 'inputs/ledger-history.json' });
  await registration.service.validate(registration.owner(registered));
  await registration.service.generate(registration.owner(registered));
  check(registration.options().get('ledger-registration') === 'inputs/ledger-history.json' && registration.refs().some(ref => ref.path === 'inputs/ledger-history.json') && registration.refs().some(ref => ref.path === 'inputs/ledger-decision.txt'), 'exact first-use ledger registration and separate source decision remain queued policy identities');
  registration.write('inputs/ledger-decision.txt', 'changed decision evidence');
  check(registration.service.status(registration.owner(registered)).staleInputs.length > 0, 'separate ledger decision source changes invalidate current evidence');
  registration.write('inputs/ledger-decision.txt', 'SYNTHETIC first-use decision fixture; no actual human authorization');
  registration.write('inputs/ledger-history.json', { fixture: 'changed history declaration' });
  check(registration.service.status(registration.owner(registered)).staleInputs.length > 0, 'ledger history declaration changes invalidate current evidence');
  for (const mode of ['before-launch-failure', 'claimed-failure']) {
    const retry = fixture(), first = retry.init(); retry.mode(mode);
    await rejected(() => retry.service.generate(retry.owner(first)), /SYNTHETIC/, 'original ' + mode + ' remains retained');
    const prior = retry.service.load(retry.owner(first)), original = prior.events.map(event => event.identity.sha256);
    retry.request.runId = 'explicit-new-run'; retry.write('inputs/retried-request.json', retry.request);
    const next = retry.init({ version: 'v2', request: 'inputs/retried-request.json', parentManifest: first.manifest });
    check(next.asset.authorization.sha256 === first.asset.authorization.sha256 && next.asset.source.sha256 === first.asset.source.sha256 && next.asset.parent.sha256 === retry.ref(first.manifest).sha256,
      mode + ' new version retains original native task/source/approval and parent');
    retry.mode('normal');
    if (mode === 'before-launch-failure') {
      await retry.service.generate(retry.owner(next));
      check(retry.service.status(retry.owner(next)).stage === 'staged', 'explicit new-version continuation can succeed when native candidate was never claimed');
      retry.request.runId = 'forbidden-third-candidate'; retry.write('inputs/third-candidate.json', retry.request);
      rejects(() => retry.init({ version: 'v3', request: 'inputs/third-candidate.json', parentManifest: next.manifest }), /successful same-source/, 'successful candidate cannot be parented into another candidate');
    } else {
      await rejected(() => retry.service.generate(retry.owner(next)), /already claimed/, 'native claim rejection prevents a new-version metadata change from adding an allowance');
      check(retry.service.status(retry.owner(next)).recoveryRequired, 'native rejection leaves new continuation intent retained without reset');
    }
    check(JSON.stringify(retry.service.load(retry.owner(first)).events.map(event => event.identity.sha256)) === JSON.stringify(original), mode + ' continuation never edits original failed history');
    await rejected(() => retry.service.generate(retry.owner(first)), /already owns/, 'explicit continuation still cannot rerun the old immutable version');
  }
  const newSource = await ready();
  newSource.write('inputs/new-source.png', 'OWNED different SYNTHETIC source; needs new source-bound rights');
  const changed = clone(newSource.request); changed.runId = 'changed-source-run'; changed.request.input = newSource.ref('inputs/new-source.png');
  changed.authorization = newSource.ref(newSource.write('inputs/new-source-approval.json', { fixture: 'SYNTHETIC different source-bound approval; actual approval remains native validation responsibility', sourceSha256: changed.request.input.sha256 }));
  newSource.write('inputs/new-source-request.json', changed);
  const changedAsset = newSource.init({ version: 'v2', request: 'inputs/new-source-request.json', parentManifest: newSource.asset.manifest });
  check(changedAsset.asset.source.sha256 !== newSource.asset.asset.source.sha256 && changedAsset.asset.parent.sha256 === newSource.ref(newSource.asset.manifest).sha256,
    'genuinely changed source can begin a separately authorized candidate while retaining prior version ancestry');
  changed.authorization = clone(newSource.request.authorization); changed.runId = 'changed-source-old-approval'; newSource.write('inputs/new-source-old-approval.json', changed);
  rejects(() => newSource.init({ version: 'v3', request: 'inputs/new-source-old-approval.json', parentManifest: newSource.asset.manifest }), /separate explicit source-bound/, 'changed source cannot carry its previous source authorization forward');
  const alias = fixture(); rejects(() => alias.init({ request: '../outside.json' }), /relative|Traversal|portable/i, 'lifecycle rejects escaped request path before state mutation');
  alias.write('inputs/duplicate.json', '{"schemaVersion":"bubo-splat-generation/v1","schemaVersion":"changed"}');
  rejects(() => alias.init({ request: 'inputs/duplicate.json' }), /Duplicate/, 'duplicate JSON policy fields rejected before native entry');
  const badProducer = fixture(), producerAsset = badProducer.init(); badProducer.mode('changed-build-snapshot');
  await rejected(() => badProducer.service.validate(badProducer.owner(producerAsset)), /build\/catalog ancestry/, 'changed producer build snapshot cannot replace the current verified build');
  check(badProducer.service.load(badProducer.owner(producerAsset)).events.some(event => event.kind === 'validation-failed'),
    'build snapshot rejection retains its original failed validation intent and result');
  console.log(JSON.stringify({ status: 'pass', checks, scope: 'owned CPU fixtures with trusted fake native port only', nativeExecution: false, modelsLoaded: false, gpuUsed: false, humanAcceptance: false, promotion: false }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
