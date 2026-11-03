/* Visual selection only: no native runtime, Blender, media or installation. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const styles = require('../commands/lib/style-contract.cjs');
const engines = require('../commands/lib/engine-contract.cjs');
const directory = fs.mkdtempSync(path.join(__dirname, '.floor-plan-selection-'));
const pipeline = 'FLOOR_PLAN_TO_MODEL';
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const rejects = (action, pattern) => { assert.throws(action, pattern); checks++; };
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function write(root, name, value) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
}
function host(name) {
  const root = path.join(directory, name);
  fs.mkdirSync(root);
  return root;
}
function style(root, primary = 'PROOF_TO_MODEL', allowed = [primary], inline = false) {
  const contract = value => `.styles/.pipelines/${value === pipeline ? 'floor-plan-to-model' : 'proof-to-model'}/PIPELINE.md`;
  return write(root, 'STYLE.md', [
    '# STYLE.md', '', 'Generated from Hephaera style templates:', '- CEL_SHADED_COMIC', '',
    'Primary Hephaera art pipeline:', `- ${primary}`, '', 'Allowed Hephaera art pipelines:',
    ...allowed.map(value => '- ' + value), '', '---', '', '## Art Pipeline Policy', '',
    '- A prompt override applies only to that task and does not rewrite this STYLE.md.',
    '- Never switch or fall back to another pipeline silently.', '',
    ...(inline ? ['## Inlined Art Pipeline Templates', ...allowed.map(value => fs.readFileSync(path.join(engines.BASE, contract(value)), 'utf8'))]
      : ['This document intentionally stays concise by referencing selected style and pipeline templates.',
        'Read `./.hephaera/.styles/CEL_SHADED_COMIC.md` instructions',
        ...allowed.map(value => `Read \`./.hephaera/${contract(value)}\` instructions`)]), ''
  ].join('\n'));
}
function cli(root, args) {
  return cp.spawnSync(process.execPath, [path.join(engines.BASE, 'commands/lib/style-contract.cjs'), 'resolve', '--root', root, ...args],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
}
try {
  for (const value of [pipeline, 'floor-plan-to-model', 'floor plan to model']) eq(styles.normalize(value), pipeline);
  rejects(() => styles.normalize('FLOOR_PLAN_TO_MODELS'), /Unknown art pipeline/);

  const primaryHost = host('primary');
  const primaryFile = style(primaryHost, pipeline);
  const primaryHash = sha(primaryFile);
  eq(styles.validate(primaryFile).primary, pipeline);
  const primary = styles.resolve(primaryHost, primaryFile);
  eq(primary.pipeline, pipeline);
  eq(primary.selectionSource, 'style');
  eq(primary.styleSha256, primaryHash);
  eq(primary.fallbackPolicy, 'stop');
  eq(fs.existsSync(path.join(primaryHost, '.hephaera')), false);
  eq(fs.existsSync(path.join(primaryHost, 'ENGINE.md')), false);

  const defaultHost = host('unchanged-default');
  const defaultFile = style(defaultHost);
  const defaultBytes = fs.readFileSync(defaultFile);
  eq(styles.resolve(defaultHost, defaultFile).pipeline, 'PROOF_TO_MODEL');
  // Explicit prompt selection may use any registered pipeline, even when it
  // is not an allowed STYLE alternative; it never rewrites that contract.
  const override = styles.resolve(defaultHost, defaultFile, { override: 'floor-plan-to-model' });
  eq(override.pipeline, pipeline);
  eq(override.selectionSource, 'prompt');
  eq(override.styleSha256, sha(defaultFile));
  eq(styles.validate(defaultFile).allowed, ['PROOF_TO_MODEL']);
  eq(fs.readFileSync(defaultFile), defaultBytes);
  eq(styles.resolve(defaultHost, defaultFile).pipeline, 'PROOF_TO_MODEL');

  for (const engine of ['THREEJS', 'BABYLONJS', 'PHASERJS', 'UNITY', 'UNREAL', 'GODOT']) {
    const root = host('engine-' + engine);
    engines.generate(root, engine);
    const file = style(root, pipeline), engineFile = path.join(root, 'ENGINE.md');
    const before = { engine: sha(engineFile), style: sha(file), selection: engines.resolve(root) };
    // Unrelated domain contracts are intentionally invalid. Visual selection
    // does not load them or initialize a media/provider/native workflow.
    write(root, 'MEDIA.md', 'invalid unrelated media fixture');
    for (const domain of ['AUDIO', 'MUSIC', 'VOICE']) write(root, domain + '.md', 'invalid unrelated domain fixture');
    eq(styles.resolve(root, file).pipeline, pipeline);
    eq(engines.resolve(root), before.selection);
    eq(sha(engineFile), before.engine);
    eq(sha(file), before.style);
    eq(fs.existsSync(path.join(root, '.hephaera')), false);
    eq(fs.existsSync(path.join(root, 'assets')), false);
    eq(fs.existsSync(path.join(root, '.art-staging')), false);
    if (engine === 'UNITY') rejects(() => styles.resolve(root, file, { override: 'CODE' }), /THREEJS/);
  }

  const inlineHost = host('inline');
  eq(styles.validate(style(inlineHost, pipeline, [pipeline], true)).primary, pipeline);
  const invalid = host('invalid');
  rejects(() => styles.validate(style(invalid, pipeline, ['PROOF_TO_MODEL'])), /Primary art pipeline is not present/);
  rejects(() => styles.validate(style(invalid, pipeline, [pipeline, pipeline])), /Duplicate allowed art pipeline/);
  rejects(() => styles.validate(style(invalid, 'FLOOR_PLAN_TO_MODELS')), /Unknown art pipeline/);

  const receiptHost = host('receipt');
  const receiptStyle = style(receiptHost);
  fs.mkdirSync(path.join(receiptHost, '.hephaera/.cache/tasks/floor-qa'), { recursive: true });
  const receiptFile = path.join(receiptHost, '.hephaera/.cache/tasks/floor-qa/pipeline-selection.json');
  const receiptBefore = sha(receiptStyle);
  const result = cli(receiptHost, ['--override', pipeline, '--evidence', receiptFile, '--json']);
  eq(result.status, 0);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  eq(receipt.pipeline, pipeline);
  eq(receipt.selectionSource, 'prompt');
  eq(receipt.styleContract, 'STYLE.md');
  eq(receipt.styleSha256, receiptBefore);
  eq(receipt.fallbackPolicy, 'stop');
  eq(JSON.parse(result.stdout), receipt);
  eq(sha(receiptStyle), receiptBefore);
  const outside = cli(receiptHost, ['--override', pipeline, '--evidence', path.join(directory, 'outside-selection.json')]);
  eq(outside.status, 1);
  eq(fs.existsSync(path.join(directory, 'outside-selection.json')), false);
  const invalidOverride = cli(receiptHost, ['--override', 'FLOOR_PLAN_TO_MODELS', '--json']);
  eq(invalidOverride.status, 1);
  eq(styles.resolve(receiptHost, receiptStyle).pipeline, 'PROOF_TO_MODEL');
  console.log(JSON.stringify({ status: 'passed', checks, scope: 'Visual selection, canonical and prompt receipts across six engines; no native execution, media loading, installation or model acceptance.' }));
} finally {
  const intendedParent = fs.realpathSync(__dirname);
  const absolute = fs.realpathSync(directory);
  assert.equal(path.dirname(absolute), intendedParent);
  assert(path.basename(absolute).startsWith('.floor-plan-selection-'));
  fs.rmSync(absolute, { recursive: true, force: false });
}
