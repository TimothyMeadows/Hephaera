"""Exercise committed schematic commands in clone and submodule installations.

Requires an explicitly built, clean, pinned Bubo publication. Nothing is built,
downloaded or installed. The default checks use design operations without Blender.
--blender selects actual bounded construction/export/review for --native-form;
--receiving also inspects that handoff through MODEL_TO_ANIMATION. All fixture
decisions are synthetic protocol assertions, never human asset acceptance.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile


BASE = Path(__file__).resolve().parents[1]
CASES = {'vehicle': 'v', 'device': 'd', 'vessel': 's'}


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def gltf(file):
    with file.open('rb') as stream:
        magic, version, length, size, kind = struct.unpack('<5I', stream.read(20))
        assert magic == 0x46546C67 and version == 2 and length == file.stat().st_size
        assert kind == 0x4E4F534A and size <= length - 20
        return json.loads(stream.read(size))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--blender', type=Path)
    parser.add_argument('--native-form', choices=['clone', 'submodule'], default='clone')
    parser.add_argument('--case', action='append', choices=list(CASES))
    parser.add_argument('--receiving', action='store_true', help='Inspect, prepare and preserve the real mechanical handoff')
    args = parser.parse_args()
    if (args.case or args.receiving) and not args.blender:
        parser.error('--case and --receiving require an explicitly selected --blender')
    blender = args.blender.resolve(strict=True) if args.blender else None
    if blender and not blender.is_file():
        parser.error('--blender must identify an existing executable file')
    evidence = args.evidence.resolve(strict=True)
    if not evidence.is_dir():
        parser.error('--evidence must identify an existing directory')
    fixtures = BASE / '.local/si'
    fixtures.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='r-', dir=fixtures))
    assert run.parent == fixtures and run.resolve().is_relative_to(BASE) and not run.is_symlink()
    env = dict(os.environ, GIT_ALLOW_PROTOCOL='file', GIT_TERMINAL_PROMPT='0',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(run / 'gitconfig'))
    for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'HEPHAERA_PROJECT_ROOT']:
        env.pop(key, None)
    (run / 'gitconfig').write_text(
        '[core]\n autocrlf = false\n longpaths = true\n[commit]\n gpgsign = false\n'
        '[user]\n name = Schematic fixture\n email = fixture@example.invalid\n', encoding='utf-8')
    checks, forms, calls = [], {}, []
    source_head = None

    def check(value, message):
        assert value, message
        checks.append(message)
        print('PASS:', message, flush=True)

    def save(status):
        summary = {'status': status, 'checks': checks, 'forms': forms,
            'baselineHead': source_head, 'nativeForm': args.native_form,
            'selectedBlender': str(blender) if blender else None,
            'receivingRequested': args.receiving, 'fixture': str(run),
            'scope': 'Actual pinned installed host/native dispatch; optional real bounded Blender. '
                     'Whole-design and independent-model decisions are synthetic QA assertions only. '
                     'No human model, finished animation, engine/runtime acceptance or promotion.'}
        write_json(run / 'SUMMARY.json', summary)
        write_json(evidence / ('installed-' + run.name + '-SUMMARY.json'), summary)

    def command(argv, cwd, expected=None, environment=None, timeout=1800):
        record = {'command': [str(x) for x in argv], 'cwd': str(cwd)}
        try:
            result = subprocess.run(record['command'], cwd=cwd, env=environment or env,
                                    capture_output=True, text=True, encoding='utf-8', timeout=timeout)
            record.update(exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)
        except BaseException as error:
            record.update(error=str(error))
            raise
        finally:
            calls.append(record)
            write_json(run / f'call-{len(calls):04d}.json', record)
        if expected:
            check(result.returncode != 0 and re.search(expected, result.stdout + '\n' + result.stderr, re.I),
                  'expected rejection: ' + expected)
        else:
            assert result.returncode == 0, result.stdout + '\n' + result.stderr
        return result

    def git(folder, *values):
        return command(['git', '-C', folder, *values], BASE).stdout.strip()

    try:
        source_head = git(BASE, 'rev-parse', 'HEAD')
        check(not git(BASE, 'status', '--porcelain', '--untracked-files=no'), 'tracked source and native dependency are clean before installed acquisition')
        fixture_blob = command(['git', 'show', source_head + ':tests/test-schematic-installed.py'], BASE).stdout
        check(fixture_blob.replace('\r\n', '\n') == Path(__file__).read_text(encoding='utf-8'), 'the executing fixture is committed at the installed source head')
        mode = git(BASE, 'ls-tree', source_head, '--', 'commands/schematic-to-model.sh').split()[0]
        check(mode == '100755', 'public schematic shell wrapper is committed executable')
        command(['node', BASE / 'commands/lib/bubo-runtime.cjs', 'verify'], BASE)
        dependency = BASE / 'runtime/bubo'
        publication = dependency / 'artifacts/bubo'
        receipt = json.loads((publication / 'build-info.json').read_bytes())
        pin = json.loads((BASE / 'runtime/bubo.lock.json').read_bytes())
        check(receipt['sourceRevision'] == pin['revision'] and receipt['sourceDirty'] is False
              and git(dependency, 'rev-parse', 'HEAD') == pin['revision'], 'explicit clean native publication matches the recorded merged dependency')
        bundle = {}
        for file in publication.rglob('*'):
            assert not file.is_symlink() and (file.is_file() or file.is_dir()), 'Publication contains an unsupported path'
            if file.is_file():
                bundle[file.relative_to(publication).as_posix()] = sha(file)
        check(bool(bundle), 'explicitly built publication has a regular-file byte inventory')
        bash = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'

        for form in ['clone', 'submodule']:
            host = run / ('c' if form == 'clone' else 's')
            host.mkdir()
            git(host, 'init', '-q', '--initial-branch=main')
            baseline = host / '.hephaera'
            if form == 'clone':
                command(['git', 'clone', '-q', '--no-hardlinks', BASE, baseline], host)
            else:
                git(host, 'submodule', 'add', '-q', str(BASE), '.hephaera')
            git(baseline, 'checkout', '-q', '--detach', source_head)
            if form == 'submodule':
                git(host, 'add', '.hephaera')
            check(git(baseline, 'rev-parse', 'HEAD') == source_head, form + ': exact committed baseline is installed at .hephaera')
            git(baseline, '-c', 'submodule.runtime/bubo.url=' + str(dependency),
                'submodule', 'update', '--init', '--recursive', '--checkout', '--', 'runtime/bubo')
            installed_native = baseline / 'runtime/bubo'
            check(git(installed_native, 'rev-parse', 'HEAD') == pin['revision']
                  and not git(installed_native, 'status', '--porcelain', '--untracked-files=no'), form + ': recursively initialized native checkout is clean and exactly pinned')
            built = installed_native / 'artifacts/bubo'
            shutil.copytree(publication, built, symlinks=False)
            check(all(sha(built / name) == expected for name, expected in bundle.items()), form + ': copied explicit publication preserves every source byte')
            command(['node', baseline / 'commands/lib/bubo-runtime.cjs', 'verify'], baseline)
            host_env = dict(env, HEPHAERA_PROJECT_ROOT=host.as_posix())
            command([bash, (baseline / 'commands/generate-style.sh').as_posix(), '--pipeline', 'SCHEMATIC_TO_MODEL', 'CEL_SHADED_COMIC'], baseline, environment=host_env)
            skill = json.loads(command([bash, (baseline / 'commands/resolve-skill.sh').as_posix(), 'build-schematic-models'], baseline, environment=host_env).stdout)
            check(skill['compatible'] is True, form + ': coordinating skill resolves compatible before use')
            style_hash = sha(host / 'STYLE.md')
            engine_before = (host / 'ENGINE.md').read_bytes() if (host / 'ENGINE.md').exists() else None
            task = host / '.hephaera/.cache/tasks/qa'
            task.mkdir(parents=True, exist_ok=True)
            (host / 'inputs').mkdir()
            media = host / 'MEDIA.md'
            media.write_text('Invalid unrelated media fixture; procedural mechanical work must not load this.\n', encoding='utf-8')
            media_hash = sha(media)
            forms[form] = {'host': str(host), 'baselineHead': source_head, 'nativeRevision': pin['revision'], 'cases': {}}

            def invoke(operation, *values, expected=None, workflow='schematic-to-model'):
                wrapper = baseline / ('commands/' + workflow + '.sh')
                prefix = [bash, wrapper.as_posix()] if os.name == 'nt' else [str(wrapper)]
                result = command([*prefix, operation, '--root', host, *values], host,
                                 expected=expected, environment=host_env)
                return result if expected else json.loads(result.stdout)

            def references(value):
                return {name: entry for name, entry in value.items() if isinstance(entry, dict) and 'path' in entry and 'sha256' in entry}

            native = bool(blender and form == args.native_form)
            names = (args.case or list(CASES)) if native else ['vehicle']
            for name in dict.fromkeys(names):
                asset = CASES[name]
                label = form + '/' + name
                design = json.loads((dependency / 'resources/schematic-to-model/examples-v2' / (name + '.json')).read_bytes())
                design['styleSha256'] = style_hash
                source = host / 'inputs' / (asset + '.json')
                write_json(source, design)
                rights = task / (asset + '-r.json')
                rights_value = {'schemaVersion': 'hephaera-schematic-rights/v1', 'designSha256': sha(source),
                    'status': 'owned', 'rightsHolder': 'Hephaera owned procedural QA fixture',
                    'scope': 'schematic-to-model', 'evidence': [], 'referenceInputs': []}
                write_json(rights, rights_value)
                budget = task / (asset + '-b.json')
                write_json(budget, {'schemaVersion': 'hephaera-schematic-budget/v1', 'timeoutSeconds': 900,
                    'maxLogBytes': 16777216, 'maxPrivateBytes': 8589934592})
                initial = invoke('init', '--task', 'qa', '--asset', asset, '--version', 'v1', '--design', source.relative_to(host).as_posix(),
                                 '--rights', rights.relative_to(host).as_posix(), '--budget', budget.relative_to(host).as_posix())
                manifest = initial['manifest']
                check(manifest == f'.hephaera/.cache/tasks/qa/schematic-to-model/{asset}/v1/manifest.json', label + ': native state uses the canonical installed task layout')
                preview = invoke('preview', '--manifest', manifest)
                check(invoke('validate', '--manifest', manifest)['isValid'], label + ': real native dimension/connectivity validation succeeds without Blender')
                check({'assembly-details.svg', 'flex-rigs.svg', 'exploded.svg', 'bom.json'} <= set(preview['artifacts']), label + ': complete v2 schematic package includes component and rig policies')
                drawing_root = host / preview['drawingDirectory']
                check(all(sha(drawing_root / file) == expected for file, expected in preview['artifacts'].items()), label + ': actual preview artifacts match their approval inventory')
                status = invoke('status', '--manifest', manifest)
                check(not status['wholeAssemblyApproved'] and not status['runtimeAcceptance'], label + ': design preview grants no implicit whole-design or runtime approval')
                invoke('promote', '--manifest', manifest, expected='unsupported|unknown')
                invoke('init', '--task', 'qa', '--asset', 'x', '--version', 'v1', '--design', '../outside.json',
                       '--rights', rights.relative_to(host).as_posix(), '--budget', budget.relative_to(host).as_posix(), expected='traversal|escape|reserved|path')
                check(not (task / 'schematic-to-model/x/v1').exists(), label + ': traversal rejection creates no asset policy or native state')
                for file, description in [(rights, 'rights'), (source, 'design')]:
                    saved = file.read_bytes()
                    try:
                        file.write_bytes(saved + b'\n')
                        invoke('status', '--manifest', manifest, expected='chang|stale|fresh|identit')
                    finally:
                        file.write_bytes(saved)
                    check(not invoke('status', '--manifest', manifest)['wholeAssemblyApproved'], label + ': changed ' + description + ' is rejected without inventing approval')
                review = {'schemaVersion': 'bubo-schematic-review/v1', 'kind': 'whole-assembly-design', 'decision': 'approved',
                    'reviewer': 'synthetic-installed-design-qa', 'human': True, 'asset': asset, 'version': 'v1',
                    'designSha256': preview['designSha256'], 'designFingerprint': preview['designFingerprint'],
                    'reviewedArtifacts': preview['artifacts'],
                    'reason': 'Synthetic protocol assertion for owned procedural test data; no human model or production acceptance.'}
                approval = task / (asset + '-dr.json')
                write_json(approval, review)
                recorded = invoke('record', '--manifest', manifest, '--kind', review['kind'], '--reviewer', review['reviewer'], '--evidence', approval.relative_to(host).as_posix())
                check(recorded['wholeAssemblyApproved'] and not recorded['runtimeAcceptance'], label + ': synthetic exact-package design decision remains separate from model/runtime acceptance')
                item = {'manifest': manifest, 'preview': preview, 'designDecision': str(approval), 'nativeExecuted': native}
                forms[form]['cases'][name] = item
                if native:
                    item['doctor'] = invoke('doctor', '--manifest', manifest, '--blender', blender)
                    item['parts'] = invoke('build-parts', '--manifest', manifest, '--blender', blender)
                    item['assembly'] = invoke('assemble', '--manifest', manifest, '--blender', blender)
                    item['motion'] = invoke('prove-motion', '--manifest', manifest, '--blender', blender)
                    check(item['motion']['currentMotionProofValid'] and not item['motion']['humanModelAccepted']
                          and not item['motion']['runtimeAcceptance'], label + ': real sampled readiness grants no human model or runtime acceptance')
                    item['export'] = invoke('export', '--manifest', manifest, '--blender', blender, '--author', 'synthetic-installed-model-author')
                    exported = item['export']
                    check(exported['currentExportValid'] and exported['portableVerified'] and not exported['currentViewsValid'], label + ': independent portable verification precedes model review views')
                    package_file = host / exported['packageManifest']
                    package = json.loads(package_file.read_bytes())
                    package_root = package_file.parent
                    check(sha(package_file) == exported['packageSha256'] and all(sha(package_root / f['path']) == f['sha256']
                          and (package_root / f['path']).stat().st_size == f['bytes'] for f in package['files']), label + ': sealed package retains complete payload bytes')
                    rest = gltf(package_root / 'assembly.glb')
                    diagnostic = gltf(package_root / 'diagnostic-motion/diagnostic.glb')
                    check(not rest.get('animations') and diagnostic.get('animations'), label + ': canonical rest export and diagnostic animation remain separate')
                    check({c['instanceId']: c['partId'] for c in package['components']} == {i['id']: i['partId'] for i in design['instances']}, label + ': all approved physical occurrences survive export independently')
                    item['review'] = invoke('review', '--manifest', manifest, '--blender', blender)
                    current = invoke('status', '--manifest', manifest)['export']
                    check(current['currentExportValid'] and current['currentViewsValid'] and not current['independentModelReviewed']
                          and not current['humanModelAccepted'], label + ': actual complete views precede independent and human model decisions')
                    decision = {'schemaVersion': 'bubo-schematic-model-review/v1', 'kind': 'independent-model', 'decision': 'approved',
                        'reviewer': 'synthetic-installed-independent-qa', 'role': 'synthetic-fixture', 'independent': True, 'human': False,
                        'reason': 'Synthetic lifecycle assertion after actual automated output checks; no human quality or runtime acceptance.',
                        'modelSha256': sha(package_root / 'assembly.glb'), 'packageSha256': current['packageSha256'],
                        'restVerificationSha256': current['restVerificationSha256'], 'diagnosticVerificationSha256': current['diagnosticVerificationSha256'],
                        'viewsSha256': current['viewsSha256'], 'independentReviewSha256': None, 'reviewedArtifacts': current['reviewArtifacts']}
                    independent = task / (asset + '-ir.json')
                    write_json(independent, decision)
                    handed = invoke('record', '--manifest', manifest, '--kind', decision['kind'], '--reviewer', decision['reviewer'], '--evidence', independent.relative_to(host).as_posix())
                    check(handed['independentModelReviewed'] and handed['mechanicalHandoff'] and not handed['humanModelAccepted']
                          and not handed['runtimeAcceptance'], label + ': synthetic independent decision issues a preserve-only handoff without human/runtime acceptance')
                    handoff_file = host / handed['mechanicalHandoff']
                    handoff = json.loads(handoff_file.read_bytes())
                    bound = references(handoff) | {'state-' + key: value for key, value in references(handoff['sourceState']).items()}
                    check(len(bound) == 11 and all(sha(host / ref['path']) == ref['sha256'] for ref in bound.values()), label + ': handoff binds all seven sources and four current source-state fences')
                    check(handoff['bindings']['nodes'] == rest['nodes'] and handoff['bindings']['skins'] == rest.get('skins', []), label + ': handoff preserves actual GLB component and skin bindings')
                    item.update(record=handed, status=invoke('status', '--manifest', manifest))
                    if args.receiving:
                        received_asset = 'm' + asset
                        root_node = rest['nodes'][rest['scenes'][rest.get('scene', 0)]['nodes'][0]]['name']
                        component = next(c['node'] for c in handoff['components'] if c['kind'] == 'rigid')
                        recipe = {'schemaVersion': 1, 'profile': 'mechanical-assembly', 'fps': 12, 'requiredClips': ['fixture-motion'],
                            'rig': {'mode': 'preserve', 'rootNode': root_node}, 'parts': [], 'anchors': [],
                            'clips': [{'id': 'fixture-motion', 'role': 'owned-receiving-qa-no-production-motion', 'loop': True, 'rootMotion': 'in-place',
                                'startFrame': 0, 'endFrame': 6, 'markers': [], 'channels': [{'target': {'node': component}, 'property': 'location',
                                    'keyframes': [[0, [0, 0, 0]], [3, [0, 0, .001]], [6, [0, 0, 0]]]}]}],
                            'states': [], 'transitions': [], 'parameters': [], 'effects': [],
                            'budgets': {'maxTriangles': 500000, 'maxBones': 128, 'maxInfluences': 4, 'maxMaterials': 128, 'maxTextureBytes': 1048576,
                                'maxRuntimeBytes': 536870912, 'maxClips': 10, 'maxClipSeconds': 10, 'maxSamples': 1000, 'maxPreviewFrames': 100,
                                'maxAttempts': 10, 'timeoutSeconds': 900, 'maxLogBytes': 8388608},
                            'review': {'renderer': 'BLENDER_WORKBENCH', 'fps': 4, 'resolution': [64, 64], 'cameras': ['front']}}
                        recipe_file = host / 'inputs' / (asset + '-m.json')
                        motion_rights = host / 'inputs' / (asset + '-mr.json')
                        write_json(recipe_file, recipe)
                        write_json(motion_rights, {'authorized': True, 'scope': 'Owned synthetic receiving fixture only; no production animation, runtime acceptance or promotion'})
                        initialized = invoke('init', '--task', 'qa', '--asset', received_asset, '--version', 'v1', '--actor', 'qa',
                            '--model', handoff['model']['path'], '--recipe', recipe_file.relative_to(host).as_posix(),
                            '--rights', motion_rights.relative_to(host).as_posix(), '--blender', blender,
                            '--handoff', handoff_file.relative_to(host).as_posix(), workflow='model-to-animation')
                        motion_manifest = initialized['manifest']
                        for operation in ['inspect', 'prepare', 'rig']:
                            invoke(operation, '--manifest', motion_manifest, workflow='model-to-animation')
                        motion_state = host / motion_manifest
                        received = json.loads(motion_state.read_bytes())
                        check(received['profile'] == 'mechanical-assembly' and not received['approvals']
                              and all(received['stages'][key]['status'] == 'complete' for key in ['inspect', 'prepare', 'rig']), label + ': installed receiving preserves mixed rigid/flexible source without inheriting motion approvals')
                        check(sha(host / received['mechanicalHandoff']) == sha(handoff_file)
                              and all(received['sourceInputs'].get(ref['path']) == ref['sha256'] for ref in bound.values()), label + ': receiving retains exact source identities and immutable handoff')
                        invoke('author', '--manifest', motion_manifest, workflow='model-to-animation', expected='rig|approv')
                        for changed in [host / handoff['sourceState']['export']['path'], package_root / next(f['path'] for f in package['files'] if f['path'].endswith('.svg'))]:
                            saved, before = changed.read_bytes(), sha(motion_state)
                            try:
                                changed.write_bytes(saved + b'\n')
                                invoke('status', '--manifest', motion_manifest, workflow='model-to-animation', expected='chang|stale|fresh|identit')
                                check(sha(motion_state) == before, label + ': stale source or payload cannot rewrite receiving expectations')
                            finally:
                                changed.write_bytes(saved)
                            invoke('status', '--manifest', motion_manifest, workflow='model-to-animation')
                        item['receiving'] = {'manifest': motion_manifest, 'profile': received['profile'], 'stages': ['inspect', 'prepare', 'rig']}
                else:
                    doctor = invoke('doctor', '--manifest', manifest)
                    check(doctor['blenderVersion'] is None and doctor['toolSha256'] is None
                          and doctor['provisioningRequired'] is False
                          and any('existing registered Blender' in reason for reason in doctor['unavailable']),
                          label + ': missing explicit Blender is reported without native probing or installation')
                    invoke('build-parts', '--manifest', manifest, '--blender', host / 'missing-blender', expected='existing|unavailable|missing|executable')
                    item['status'] = invoke('status', '--manifest', manifest)

                revision = host / 'inputs' / (asset + '-v2.json')
                changed_design = dict(design, name=design['name'] + ' — revised fixture')
                write_json(revision, changed_design)
                revised_rights = task / (asset + '-r2.json')
                write_json(revised_rights, dict(rights_value, designSha256=sha(revision)))
                prior_manifest_sha = sha(host / manifest)
                next_version = invoke('init', '--task', 'qa', '--asset', asset, '--version', 'v2',
                    '--design', revision.relative_to(host).as_posix(), '--rights', revised_rights.relative_to(host).as_posix(),
                    '--budget', budget.relative_to(host).as_posix(), '--parent-manifest', manifest)
                next_state = json.loads((host / next_version['manifest']).read_bytes())
                check(not next_version['wholeAssemblyApproved'] and next_state['parentSha256'] == prior_manifest_sha
                      and sha(host / next_state['parentSnapshot']) == prior_manifest_sha,
                      label + ': new design version retains exact parent ancestry without inheriting approval')
                item['revisionManifest'] = next_version['manifest']
                check(sha(host / 'STYLE.md') == style_hash and ((host / 'ENGINE.md').read_bytes() if (host / 'ENGINE.md').exists() else None) == engine_before,
                      label + ': production preserves the selected STYLE and ENGINE contracts')
                check(sha(media) == media_hash and not (host / 'assets').exists(), label + ': unrelated media and runtime assets remain untouched')
                save('in-progress')
            contexts = list(task.glob('bubo-host/*/host-context.json'))
            check(bool(contexts) and all('media' not in json.loads(file.read_bytes())['policy']
                  and not any(ref['path'] == 'MEDIA.md' for ref in json.loads(file.read_bytes())['references']) for file in contexts), form + ': schematic and mechanical dispatch do not bind unrelated MEDIA')
            if not native:
                check(all(not json.loads(file.read_bytes())['tools'] for file in contexts), form + ': pure design fixture has no native executable registrations')
            check(not git(baseline, 'status', '--porcelain', '--untracked-files=no'), form + ': installed tracked baseline and native source stay clean')
            save('in-progress')
        save('passed')
        print(json.dumps({'status': 'passed', 'checks': len(checks), 'evidence': str(run / 'SUMMARY.json')}), flush=True)
    except BaseException:
        save('failed')
        print('Preserved installed schematic evidence at ' + str(run), flush=True)
        raise


if __name__ == '__main__':
    main()
