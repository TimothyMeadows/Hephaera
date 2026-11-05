'use strict';
// Exact Task4 parent source versus current production VFX, with a matched
// workload. There is no historical v2 action scheduler to compare against.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const {withEdgeReview} = require('./lib/edge-review.cjs');
const ROOT = path.resolve(__dirname, '..'), REVISION = '445f88c523c8e418241e22a6de172659cb9d43d6';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const options = {}; for (let index = 2; index < process.argv.length; index += 2) { const key = process.argv[index]; if (!['--edge', '--modules', '--assets', '--output'].includes(key) || options[key] || !path.isAbsolute(process.argv[index + 1] || '')) throw Error('Use explicit absolute --edge --modules --assets --output paths'); options[key] = path.resolve(process.argv[index + 1]); }
if (Object.keys(options).length !== 4) throw Error('All four explicit paths are required');
const edge = options['--edge'], modules = options['--modules'], originalAssets = options['--assets'], output = options['--output'], assets = output + '-inputs';
if (fs.existsSync(output) || fs.existsSync(assets)) throw Error('Retain prior performance evidence; choose a new output path');
fs.mkdirSync(path.join(assets, 'baseline'), {recursive: true});
const nativeFiles = ['perf-package.json', 'perf-profile.json', 'swatch-correspondence.json', 'swatch.png', 'swatch.rgba', 'fixture.json'];
for (const name of nativeFiles) fs.copyFileSync(path.join(originalAssets, name), path.join(assets, name), fs.constants.COPYFILE_EXCL);
const baseline = {}, baselinePaths = ['three-quarks-runtime.mjs', 'three-vfx-runtime.mjs', 'vfx-package.mjs'];
for (const name of baselinePaths) {
  const sourcePath = '.engine/threejs/particles/' + name, result = cp.spawnSync('git', ['show', REVISION + ':' + sourcePath], {cwd: ROOT, windowsHide: true, maxBuffer: 8 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout?.length) throw Error('Exact read-only parent source unavailable: ' + sourcePath);
  baseline[sourcePath] = sha(result.stdout); fs.writeFileSync(path.join(assets, 'baseline', name), result.stdout, {flag: 'wx'});
}
const sourceFiles = ['tests/run-action-vfx-performance.cjs', 'tests/fixtures/action-vfx/performance.html', 'tests/fixtures/action-vfx/performance.mjs', 'tests/lib/edge-review.cjs', ...baselinePaths.map(name => '.engine/threejs/particles/' + name)];
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, sha(fs.readFileSync(path.join(ROOT, name)))])), inputHashes = Object.fromEntries(nativeFiles.map(name => [name, sha(fs.readFileSync(path.join(assets, name)))]));
const versions = Object.fromEntries(['three', 'three.quarks', 'quarks.core', 'postprocessing'].map(name => [name, JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version]));
if (JSON.stringify(versions) !== JSON.stringify({three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1', postprocessing: '6.39.5'})) throw Error('Installed reviewed dependency versions differ');
withEdgeReview({edge, source: ROOT, modules, fixture: path.join(ROOT, 'tests/fixtures/action-vfx'), assets, output}, async browser => {
  await browser.navigate('performance.html'); const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const value = await browser.evaluate('({ready:window.__actionPerformanceReady,error:window.__performanceError||null})'); if (value.error) throw Error(value.error); if (value.ready) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  if (!await browser.evaluate('window.__actionPerformanceReady === true')) throw Error('Actual common-workload performance fixture unavailable');
  const identity = await browser.evaluate('({driver:window.__actionPerformance.driver,inputHashes:window.__actionPerformance.inputHashes,inputLoadMs:window.__actionPerformance.inputLoadMs,clockQuantumMs:window.__actionPerformance.clockQuantumMs})');
  if (JSON.stringify(identity.inputHashes) !== JSON.stringify(inputHashes)) throw Error('Browser workload bytes differ from exact staged inputs');
  const invoke = async (variant, id) => { const result = await browser.evaluate(`window.__actionPerformance.run(${JSON.stringify({variant, id})})`); fs.writeFileSync(path.join(output, id + '-' + variant + '.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'}); return result; };
  const warmup = []; for (const variant of ['baseline', 'candidate']) warmup.push(await invoke(variant, 'warmup'));
  const pairs = []; for (let index = 0; index < 5; index++) { const order = index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'], pair = {index: index + 1, order};
    for (const variant of order) { pair[variant] = await invoke(variant, 'pair-' + (index + 1)); pair[variant].capture = await browser.capture('pair-' + (index + 1) + '-' + variant + '.png'); }
    for (const phase of ['steady', 'peak']) if (pair.baseline.signatures[phase] !== pair.candidate.signatures[phase]) throw Error('Matched particle workload differs: pair ' + pair.index + ' ' + phase);
    pairs.push(pair); console.log(JSON.stringify({pair: index + 1, order, signaturesMatch: true})); }
  await browser.evaluate('window.__actionPerformance.dispose()');
  const current = Object.fromEntries(sourceFiles.map(name => [name, sha(fs.readFileSync(path.join(ROOT, name)))])); if (JSON.stringify(current) !== JSON.stringify(sourceHashes)) throw Error('Candidate source changed during measured pairs');
  const inputHashesAfter = Object.fromEntries(nativeFiles.map(name => [name, sha(fs.readFileSync(path.join(assets, name)))])); if (JSON.stringify(inputHashesAfter) !== JSON.stringify(inputHashes)) throw Error('Common fixture input changed during measured pairs');
  const average = (run, phase, key) => run[phase].samples.reduce((sum, value) => sum + value[key], 0) / run[phase].samples.length;
  const metrics = {
    'runtime construction CPU ms': run => run.stages.runtimeConstruction.cpuMs, 'exact byte/resource admission CPU ms': run => run.stages.resourceAdmission.cpuMs,
    'first acquire CPU ms': run => run.stages.firstAcquire.cpuMs, 'first compile/render finish wall ms': run => run.stages.firstCompileRender.finishWallMs,
    'steady per-frame update CPU ms': run => average(run, 'steady', 'updateCpuMs'), 'steady per-frame render submit CPU ms': run => average(run, 'steady', 'renderSubmitCpuMs'), 'steady per-frame finish wall ms': run => run.steady.perFrameWallMs,
    'peak acquire CPU ms': run => run.stages.peakAcquire.cpuMs, 'peak first compile/render finish wall ms': run => run.stages.peakCompileRender.finishWallMs,
    'peak per-frame update CPU ms': run => average(run, 'peak', 'updateCpuMs'), 'peak per-frame render submit CPU ms': run => average(run, 'peak', 'renderSubmitCpuMs'), 'peak per-frame finish wall ms': run => run.peak.perFrameWallMs,
    'peak draw submissions': run => run.peak.inventory.draws.calls, 'peak batch typed-array bytes': run => run.peak.inventory.typedArrayBytes};
  const comparisons = Object.entries(metrics).map(([name, get]) => { const baselineValues = pairs.map(pair => get(pair.baseline)), candidateValues = pairs.map(pair => get(pair.candidate)), baselineMedian = median(baselineValues), candidateMedian = median(candidateValues);
    return {name, baseline: baselineValues, candidate: candidateValues, baselineMedian, candidateMedian, delta: candidateMedian - baselineMedian, percentDelta: baselineMedian ? (candidateMedian / baselineMedian - 1) * 100 : null,
      aboveTenPercent: baselineMedian ? candidateMedian > baselineMedian * 1.1 : candidateMedian > 0, positivePairs: candidateValues.filter((value, index) => value > baselineValues[index]).length, pairedDeltas: candidateValues.map((value, index) => value - baselineValues[index])}; });
  const report = {schemaVersion: 'hephaera-action-vfx-common-performance/v1', status: 'measured', baselineRevision: REVISION, baselineSourceHashes: baseline, sourceHashes, inputHashes, versions, identity, pairs: 5, warmup,
    methodology: 'Same production VFX APIs, one owner, fixed authored 32-particle steady and 96-particle two-owner-plus-ambient peak, exact input bytes, seeds, state hashes, camera, 960x540 renderer, 1/120 delta, 32 frames/phase. One warmup each then five alternating pairs.',
    timingScope: 'performance.now CPU submission and gl.finish synchronized wall time; includes CPU/driver/GPU waits and is not pure GPU time. Load and first compile are separate from steady/peak frame costs.',
    limits: 'Exact parent445 VFX owner versus candidate VFX owner only. No historical v2 action scheduler existed; new scheduler/model costs require separate candidate absolute measurements. Desktop Edge/device scope only, no MAUI/device/human acceptance.',
    comparisons, investigationsRequired: comparisons.filter(value => value.aboveTenPercent).map(value => value.name)};
  fs.writeFileSync(path.join(output, 'performance-report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'}); return report;
}).then(report => console.log(JSON.stringify({output, pairs: report.pairs, investigationsRequired: report.investigationsRequired, comparisons: report.comparisons}))).catch(error => { console.error(error); process.exitCode = 1; });
