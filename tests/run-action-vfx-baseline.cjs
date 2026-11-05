'use strict';

// Re-run the unchanged v1 and Task4 CPU suites with an explicitly selected,
// already installed dependency directory. No package acquisition or source edit.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--modules', '--output'].includes(key) || !process.argv[i + 1] || options[key])
    throw Error('Use --modules EXISTING_ABSOLUTE_NODE_MODULES --output NEW_ABSOLUTE_DIRECTORY.');
  options[key] = process.argv[i + 1];
}
if (!options['--modules'] || !options['--output'] || Object.values(options).some(value => !path.isAbsolute(value)))
  throw Error('Explicit absolute existing module and new output directories are required.');
const modules = path.resolve(options['--modules']), output = path.resolve(options['--output']);
const expected = {three: '0.182.0', 'three.quarks': '0.17.1', 'quarks.core': '0.17.1', postprocessing: '6.39.5'};
for (const [name, version] of Object.entries(expected))
  if (JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8')).version !== version)
    throw Error('Existing module version differs from reviewed exact baseline: ' + name);
if (fs.existsSync(output)) throw Error('Retain prior output; choose a new evidence directory.');
fs.mkdirSync(output, {recursive: true});
const sourceFile = path.join(ROOT, 'tests/test-model-action-engine.cjs');
const source = fs.readFileSync(sourceFile, 'utf8');
const from = "const DEPENDENCIES = path.join(ROOT, '.hephaera/.cache/tasks/model-to-animation-design/dependency-audit/browser-fixture/node_modules');";
const to = 'const DEPENDENCIES = ' + JSON.stringify(modules) + ';';
if (source.split(from).length !== 2) throw Error('Expected one unchanged v1 dependency declaration.');
const adapted = source.replace(from, to);
fs.writeFileSync(path.join(output, 'v1-dependency-only.cjs'), adapted, {flag: 'wx'});
const harness = `const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
const original=${JSON.stringify(sourceFile)};
const test=new Module(original);test.filename=original;test.paths=Module._nodeModulePaths(path.dirname(original));
require.main=test;process.mainModule=test;
process.argv=[process.execPath,original,'--output',${JSON.stringify(path.join(output, 'v1-result.json'))}];
test._compile(fs.readFileSync(${JSON.stringify(path.join(output, 'v1-dependency-only.cjs'))},'utf8'),original);`;
const env = {...process.env, HEPHAERA_VFX_NODE_MODULES: modules};
const runs = [];
for (const [name, args] of [['v1', ['-e', harness]], ['vfx-cpu', ['tests/test-vfx-threejs-runtime.mjs']]]) {
  const result = cp.spawnSync(process.execPath, args, {cwd: ROOT, env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(output, name + '.stdout.log'), result.stdout || '', {flag: 'wx'});
  fs.writeFileSync(path.join(output, name + '.stderr.log'), result.stderr || '', {flag: 'wx'});
  runs.push({name, exitCode: result.status, signal: result.signal, error: result.error?.message || null});
}
const sourceUnchanged = fs.readFileSync(sourceFile, 'utf8') === source;
const result = {runs, sourceUnchanged, modules, versions: expected,
  adaptation: {original: sourceFile, sourceSha256: sha(source), adaptedSha256: sha(adapted), from, to,
    execution: 'Compiled with original filename to preserve source ROOT/ADAPTER; dependency literal is the sole change.'},
  scope: 'Existing real-library CPU suites; no renderer, visual quality, performance, MAUI/device, human acceptance or promotion evidence.'};
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
if (!sourceUnchanged || runs.some(run => run.exitCode !== 0 || run.error)) throw Error('CPU regression failed; retained evidence: ' + output);
console.log(JSON.stringify({output, runs, sourceUnchanged}));
