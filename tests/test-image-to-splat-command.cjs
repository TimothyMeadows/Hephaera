'use strict';

// Public routing and installed-wrapper checks use trusted synthetic ports.
// No native process, model, provisioning or GPU operation is performed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const BASE = path.resolve(__dirname, '..');
const command = require('../commands/lib/image-to-splat-command.cjs');
const native = require('../commands/lib/bubo-splat-adapter.cjs');
const parent = path.join(BASE, '.hephaera/.cache/tasks/tests/image-to-splat-command');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'host-'));
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const rejected = async (action, expression) => { await assert.rejects(action, expression); checks++; };
const calls = [];
const state = {
  init: value => { calls.push({ operation: 'init', value }); return { manifest: 'saved/manifest.json', syntheticPort: true }; },
  ...Object.fromEntries(['status', 'validate', 'generate', 'verifyPackage', 'review', 'record'].map(operation =>
    [operation, (owner, input) => { calls.push({ operation, owner, input }); return { operation, syntheticPort: true }; }]))
};
const parsedNativeCalls = [];
const port = {
  parse: native.parse,
  invoke: async (operation, options, settings) => {
    parsedNativeCalls.push({ operation, options: Object.fromEntries(options), settings });
    return { syntheticPort: true, operation, generation: false };
  },
  requireCapability: info => { assert(info.capability.splats); }
};
const metadata = {
  dependency: () => ({ pinned: { revision: 'a'.repeat(40), apiVersion: 2, resourceCatalogSha256: 'b'.repeat(64) } }),
  verified: () => ({ capability: { splats: { generationAvailable: true, nativeReadinessVerified: false } } })
};
const runner = command.createCommand({ state, native: port, metadata });
const ownerArgs = ['--root', root, '--manifest', 'saved/manifest.json'];
const initArgs = ['init', '--root', root, '--task', 'splat-task', '--asset', 'prop', '--version', 'v1', '--creator', 'author',
  '--request', 'input/generation.json', '--selection', 'input/selection.json', '--media', 'MEDIA.md',
  '--workspace', '.hephaera/.cache/splat-runtime', '--media-state', '.hephaera/.cache/shared-media',
  '--parent-manifest', 'saved/parent.json', '--platform-modules', 'input/modules.json', '--ledger-registration', 'input/ledger-registration.json'];

function cli(...args) {
  const result = cp.spawnSync(process.execPath, [path.join(BASE, 'commands/lib/image-to-splat-command.cjs'), ...args],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert(!result.error, result.error?.message);
  return result;
}
function writeFixture(relative, source) {
  const file = path.join(root, '.hephaera', relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source);
}
function shell(...args) {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const result = cp.spawnSync(bash, [path.join(root, '.hephaera/commands/image-to-splat.sh'), ...args],
    { cwd: root, env: { ...process.env, HEPHAERA_PROJECT_ROOT: root, HEPHAERA_SESSION_ID: '', HEPHAERA_VISUALIZER_WRAPPED: '1' },
      encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert(!result.error, result.error?.message);
  return result;
}

(async () => {
  for (const values of [[], ['help'], ['--help'], ['-h'], ['init', '--help']]) {
    check(command.parse(values).operation === 'help', 'Help requires no policy/runtime/asset operation.');
    check(typeof await runner.run(values) === 'string', 'Help returns only the instruction text.');
  }
  check(calls.length === 0 && parsedNativeCalls.length === 0, 'Help never enters state or native ports.');
  for (const values of [['unknown'], ['init', '--root', root, '--root', root], ['status', '--manifest'],
    ['generate', ...ownerArgs, '--seed', '4'], ['generate', ...ownerArgs, '--request', 'other.json'],
    ['generate', ...ownerArgs, '--workspace', 'another-cache'], ['generate', ...ownerArgs, '--ledger-registration', 'replacement-ledger.json'],
    ['record', ...ownerArgs, '--reviewer', 'fabricated'],
    ['doctor', '--root', root, '--load', 'true'], ['doctor', '--root', root, '--execute'],
    ['setup', '--root', root, '--load', 'true'], ['setup', '--root', root, '--execute', 'false']])
    await rejected(() => runner.run(values), /Unknown|Missing|--execute accepts|ledger-registration/);
  for (const operation of ['setup', 'provision'])
    await rejected(() => runner.run([operation, '--root', root, '--request', 'setup.json', '--ledger-registration', 'registration.json']),
      /immutable lifecycle init\/generation input/);
  for (const flag of ['host-context', 'api-version', 'baseline-root', 'state-root', 'staging-root', 'runtime-build-sha256', 'runtime-resource-catalog-sha256']) {
    await rejected(() => runner.run(['init', '--' + flag, 'not-admitted']), /protected/);
    await rejected(() => runner.run(['setup', '--' + flag, 'not-admitted']), /protected/);
  }
  check(calls.length === 0 && parsedNativeCalls.length === 0, 'Rejected controls cause no state/native call.');
  await rejected(() => runner.run(['status', '--root', root]), /--manifest/);
  await rejected(() => runner.run(['status', '--manifest', 'saved/manifest.json']), /--root/);
  await rejected(() => runner.run(['init', '--root', root]), /--task/);
  await runner.run(initArgs);
  assert.deepEqual(calls.at(-1).value, { root, task: 'splat-task', asset: 'prop', version: 'v1', creator: 'author', request: 'input/generation.json',
    selection: 'input/selection.json', media: 'MEDIA.md', workspace: '.hephaera/.cache/splat-runtime', mediaState: '.hephaera/.cache/shared-media',
    parentManifest: 'saved/parent.json', platformModules: 'input/modules.json', ledgerRegistration: 'input/ledger-registration.json' }); checks++;
  for (const [operation, method] of [['status', 'status'], ['validate', 'validate'], ['generate', 'generate'], ['verify-package', 'verifyPackage']]) {
    await runner.run([operation, ...ownerArgs]);
    assert.deepEqual(calls.at(-1), { operation: method, owner: { root, manifest: 'saved/manifest.json' }, input: undefined }); checks++;
  }
  await runner.run(['review', ...ownerArgs, '--packet', 'views/packet.json']);
  assert.deepEqual(calls.at(-1), { operation: 'review', owner: { root, manifest: 'saved/manifest.json' }, input: { packet: 'views/packet.json' } }); checks++;
  await runner.run(['record', ...ownerArgs, '--evidence', 'reviews/user.json']);
  assert.deepEqual(calls.at(-1), { operation: 'record', owner: { root, manifest: 'saved/manifest.json' }, input: { evidence: 'reviews/user.json' } }); checks++;
  await rejected(() => runner.run(['review', ...ownerArgs]), /--packet/);
  await rejected(() => runner.run(['record', ...ownerArgs]), /--evidence/);
  const beforeDoctor = calls.length;
  const doctor = await runner.run(['doctor', '--root', root]);
  check(doctor.runtime.verified && doctor.nativeReadiness === 'unverified' && doctor.gpuProbed === false && doctor.modelLoading === false
    && doctor.installation === false && doctor.generation === false && calls.length === beforeDoctor,
  'Doctor distinguishes verified runtime metadata from unverified native/model readiness without loading state.');
  await runner.run(['doctor', ...ownerArgs]);
  check(calls.at(-1).operation === 'status', 'Doctor reads an explicitly selected lifecycle manifest through its status owner.');
  const absent = command.createCommand({ state, native: port, metadata: { dependency: () => { throw Error('Not initialized'); } } });
  const missing = await absent.run(['doctor', '--root', root]);
  check(missing.runtime.verified === false && missing.runtime.reason === 'Not initialized' && missing.nativeReadiness === 'unverified',
    'Missing runtime is read-only discovery metadata, never an implicit initialization.');
  await runner.run(['setup', '--root', root, '--task', 'task']);
  check(parsedNativeCalls.at(-1).operation === 'setup' && !Object.hasOwn(parsedNativeCalls.at(-1).options, 'execute') && parsedNativeCalls.at(-1).settings.emit === false,
    'Metadata setup remains dry-run and its result is emitted by only the command boundary.');
  await runner.run(['provision', '--root', root, '--task', 'task', '--request', 'setup.json', '--execute']);
  check(parsedNativeCalls.at(-1).options.execute === 'true' && parsedNativeCalls.at(-1).options.request === 'setup.json',
    'Explicit native provisioning controls are routed without synthesizing authorization.');
  const beforeInvalidProvision = parsedNativeCalls.length;
  await rejected(() => runner.run(['provision', '--root', root]), /--request/);
  await rejected(() => runner.run(['setup', '--root', root, '--execute']), /registration --request/);
  check(parsedNativeCalls.length === beforeInvalidProvision, 'Incomplete executing setup/provision requests never reach the native port.');
  check(cli('--help').status === 0, 'Real Node CLI help works without state or native readiness.');
  check(cli('unknown').status === 1, 'Real Node CLI reports unknown operations as failure.');
  check(cli('generate', ...ownerArgs, '--request', 'replacement.json').status === 1, 'Real Node CLI refuses mutable continuation overrides before state access.');

  // Real installed .hephaera layout, with only the lifecycle port replaced by
  // an explicit fixture module. This exercises wrapper path/root transport.
  for (const name of ['commands/lib', 'installer/core']) fs.cpSync(path.join(BASE, name), path.join(root, '.hephaera', name), { recursive: true });
  fs.copyFileSync(path.join(BASE, 'commands/image-to-splat.sh'), path.join(root, '.hephaera/commands/image-to-splat.sh'));
  writeFixture('commands/lib/image-to-splat-state.cjs', `'use strict';
const assert=require('node:assert/strict');
const own=owner=>{assert.deepEqual(Object.keys(owner).sort(),['manifest','root']);return owner;};
exports.init=input=>({syntheticPort:true,manifest:'saved/manifest.json',input});
for(const name of ['status','validate','generate','verifyPackage'])exports[name]=owner=>({syntheticPort:true,operation:name,owner:own(owner)});
exports.review=(owner,input)=>({syntheticPort:true,operation:'review',owner:own(owner),input});
exports.record=(owner,input)=>({syntheticPort:true,operation:'record',owner:own(owner),input});
`);
  const wrapperHelp = shell('--help'); check(wrapperHelp.status === 0 && wrapperHelp.stdout.includes('image-to-splat <'), 'Installed wrapper help requires no host configuration.');
  const wrapperInit = shell(...initArgs.filter((_, index) => index !== 1 && index !== 2));
  check(wrapperInit.status === 0, 'Installed wrapper resolves the exact direct parent when root is omitted: ' + wrapperInit.stderr);
  const initialized = JSON.parse(wrapperInit.stdout);
  check(initialized.syntheticPort === true && initialized.input.root === root && initialized.input.mediaState === '.hephaera/.cache/shared-media'
    && initialized.input.ledgerRegistration === 'input/ledger-registration.json',
    'Installed wrapper preserves host root and immutable shared media-state/registration mapping.');
  for (const operation of ['status', 'validate', 'generate', 'verify-package']) {
    const result = shell(operation, '--manifest', 'saved/manifest.json');
    check(result.status === 0 && JSON.parse(result.stdout).owner.root === root, 'Installed wrapper routes ' + operation + ' through exact owner.');
  }
  const wrapperReview = shell('review', '--manifest', 'saved/manifest.json', '--packet', 'views/packet.json');
  check(wrapperReview.status === 0 && JSON.parse(wrapperReview.stdout).input.packet === 'views/packet.json', 'Installed review routes supplied packet without rendering.');
  const wrapperRecord = shell('record', '--manifest', 'saved/manifest.json', '--evidence', 'reviews/user.json');
  check(wrapperRecord.status === 0 && JSON.parse(wrapperRecord.stdout).input.evidence === 'reviews/user.json', 'Installed record preserves actual decision evidence path.');
  const wrapperDoctor = shell('doctor');
  check(wrapperDoctor.status === 0 && JSON.parse(wrapperDoctor.stdout).runtime.verified === false && JSON.parse(wrapperDoctor.stdout).generation === false,
    'Installed discovery reports absent runtime without building, installing or invoking a model.');
  check(shell('status', '--root', root, '--manifest', 'saved/manifest.json').status === 0, 'Explicit host root passes unchanged through the wrapper.');
  check(shell('generate', '--manifest', 'saved/manifest.json', '--host-context', 'forged.json').status === 1, 'Installed wrapper cannot expose protected raw execution arguments.');
  check(shell('generate', '--manifest', 'saved/manifest.json', '--ledger-registration', 'replacement.json').status === 1,
    'Installed continuation cannot replace a saved ledger-registration receipt.');
  check(shell('setup', '--ledger-registration', 'registration.json').status === 1,
    'Installed raw setup cannot install a first-use ledger registration.');
  check(!fs.existsSync(path.join(root, '.hephaera/.cache')), 'Synthetic routing created no host lifecycle/generation/cache state.');
  console.log('PASS: ' + checks + ' image-to-splat command/installed-wrapper CPU checks; trusted synthetic ports only, no native/model/GPU execution.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
