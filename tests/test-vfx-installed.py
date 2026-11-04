"""Run the committed public VFX wrapper in real clone/submodule installations.

Select an existing clean pinned native checkout with --native-root. Its complete
verified publication is copied byte-for-byte; this test builds/installs nothing.
All image/review fixtures are synthetic protocol assertions, not visual approval.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile


BASE = Path(__file__).resolve().parents[1]


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--native-root', type=Path, required=True)
    parser.add_argument('--form', action='append', choices=['clone', 'submodule'])
    args = parser.parse_args()
    evidence = args.evidence.resolve(strict=True)
    native_root = args.native_root.resolve(strict=True)
    if not evidence.is_dir() or not native_root.is_dir():
        parser.error('--evidence and --native-root must be existing directories')
    fixtures = BASE / '.local/vi'
    fixtures.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='r-', dir=fixtures))
    assert run.parent == fixtures and run.resolve().is_relative_to(BASE) and not run.is_symlink()
    source_env = dict(os.environ)
    for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'HEPHAERA_PROJECT_ROOT']:
        source_env.pop(key, None)
    env = dict(source_env, GIT_ALLOW_PROTOCOL='file', GIT_TERMINAL_PROMPT='0',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(run / 'gitconfig'))
    (run / 'gitconfig').write_text('[core]\n autocrlf = false\n longpaths = true\n[commit]\n gpgsign = false\n'
        '[user]\n name = VFX fixture\n email = fixture@example.invalid\n', encoding='utf-8')
    checks, forms, calls = [], {}, []
    source_head = None

    def check(value, message):
        assert value, message
        checks.append(message)
        print('PASS:', message, flush=True)

    def save(status):
        value = {'status': status, 'checks': checks, 'forms': forms, 'baselineHead': source_head,
            'selectedNativeRoot': str(native_root), 'fixture': str(run),
            'scope': 'Actual committed clone/submodule shell wrapper and pinned native envelope inspection. '
                     'Synthetic captures/review decisions test protocol binding only; no real visual quality, '
                     'human/runtime acceptance, resource decoding, rendering, generation or promotion.'}
        write_json(run / 'SUMMARY.json', value)
        write_json(evidence / ('vfx-installed-' + run.name + '-SUMMARY.json'), value)

    def command(argv, cwd=BASE, expected=None, environment=None, timeout=180):
        record = {'command': [str(x) for x in argv], 'cwd': str(cwd)}
        try:
            result = subprocess.run(record['command'], cwd=cwd, env=environment or env,
                capture_output=True, text=True, encoding='utf-8', timeout=timeout)
            record.update(exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)
        except BaseException as error:
            record['error'] = str(error)
            raise
        finally:
            calls.append(record)
            write_json(run / f'call-{len(calls):04d}.json', record)
        if expected:
            check(result.returncode != 0 and re.search(expected, result.stdout + '\n' + result.stderr, re.I), 'expected rejection: ' + expected)
        else:
            assert result.returncode == 0, result.stdout + '\n' + result.stderr
        return result

    def git(folder, *values, environment=None):
        return command(['git', '-C', folder, *values], environment=environment).stdout.strip()

    try:
        source_head = git(BASE, 'rev-parse', 'HEAD')
        check(not git(BASE, 'status', '--porcelain', '--untracked-files=no', environment=source_env), 'tracked source and native dependency are clean before acquisition')
        for name in ['test-vfx-installed.py', 'test-vfx-assets.cjs', 'vfx-fixture.cjs']:
            committed = command(['git', 'show', source_head + ':tests/' + name]).stdout
            check(committed.replace('\r\n', '\n') == (BASE / 'tests' / name).read_text(encoding='utf-8'), 'executing test source is committed: ' + name)
        check(git(BASE, 'ls-tree', source_head, '--', 'commands/vfx-assets.sh').split()[0] == '100755', 'public VFX shell wrapper is committed executable')
        pin = json.loads((BASE / 'runtime/bubo.lock.json').read_bytes())
        check(native_root == (BASE / 'runtime/bubo').resolve(), 'explicit native root is the candidate owning pinned dependency')
        check(git(native_root, 'rev-parse', 'HEAD') == pin['revision'] and not git(native_root, 'status', '--porcelain', '--untracked-files=no'), 'explicit native checkout is clean and exactly pinned')
        command(['node', BASE / 'commands/lib/bubo-runtime.cjs', 'verify'])
        publication = native_root / 'artifacts/bubo'
        receipt = json.loads((publication / 'build-info.json').read_bytes())
        check(receipt['sourceRevision'] == pin['revision'] and receipt['sourceDirty'] is False, 'actual existing publication has clean pinned source receipt')
        bundle = {}
        for file in publication.rglob('*'):
            assert not file.is_symlink() and (file.is_file() or file.is_dir()), 'unsupported publication path'
            if file.is_file():
                bundle[file.relative_to(publication).as_posix()] = sha(file)
        check(bool(bundle), 'complete verified native publication inventory exists')
        bash = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'

        for form in dict.fromkeys(args.form or ['clone', 'submodule']):
            host = run / ('c' if form == 'clone' else 's')
            host.mkdir()
            git(host, 'init', '-q', '--initial-branch=main')
            baseline = host / '.hephaera'
            if form == 'clone':
                command(['git', 'clone', '-q', '--no-hardlinks', BASE, baseline], cwd=host)
            else:
                git(host, 'submodule', 'add', '-q', str(BASE), '.hephaera')
            git(baseline, 'checkout', '-q', '--detach', source_head)
            if form == 'submodule':
                git(host, 'add', '.hephaera')
            check(git(baseline, 'rev-parse', 'HEAD') == source_head, form + ': exact committed baseline installed at .hephaera')
            git(baseline, '-c', 'submodule.runtime/bubo.url=' + str(native_root), 'submodule', 'update', '--init', '--recursive', '--checkout', '--', 'runtime/bubo')
            installed_native = baseline / 'runtime/bubo'
            check(git(installed_native, 'rev-parse', 'HEAD') == pin['revision'] and not git(installed_native, 'status', '--porcelain', '--untracked-files=no'), form + ': real native submodule is clean and pinned')
            built = installed_native / 'artifacts/bubo'
            shutil.copytree(publication, built, symlinks=False)
            check({file.relative_to(built).as_posix(): sha(file) for file in built.rglob('*') if file.is_file()} == bundle, form + ': complete explicit publication copied with every byte verified')
            command(['node', baseline / 'commands/lib/bubo-runtime.cjs', 'verify'], cwd=baseline)
            host_env = dict(env, HEPHAERA_PROJECT_ROOT=host.as_posix())
            command([bash, (baseline / 'commands/create-host-ai-scaffold.sh').as_posix()], cwd=host, environment=host_env)
            check((host / '.hephaera/.cache/SYSTEM_MEMORY.md').is_file() and './.hephaera/AGENTS.md' in (host / 'AGENTS.md').read_text(encoding='utf-8'), form + ': canonical installed host scaffold is present')
            data = json.loads(command(['node', baseline / 'tests/vfx-fixture.cjs', 'init', host, baseline], cwd=host).stdout)
            forms[form] = {'host': str(host), 'baselineHead': source_head, 'nativeRevision': pin['revision']}

            def invoke(operation, *flags, expected=None):
                result = command([bash, (baseline / 'commands/vfx-assets.sh').as_posix(), operation, '--root', host.as_posix(), *flags],
                    cwd=host, expected=expected, environment=host_env)
                return result if expected else json.loads(result.stdout)

            def init_flags(version='v1', **changes):
                value = {'--task': data['task'], '--asset': data['asset'], '--version': version, '--creator': data['creator'], '--brief': data['brief'], '--rights': data['rights']}
                value.update(changes)
                return [part for item in value.items() for part in item]

            manifest = data['manifest']
            package_path = data['packagePath']

            def status():
                return invoke('status', '--manifest', manifest)

            def mutate_and_reject(file):
                saved = file.read_bytes()
                try:
                    file.write_bytes(saved + b'\n')
                    stale = status()
                    check(stale['fresh'] is False and stale['stale'] and all(value['accepted'] is False for value in stale['phases'].values()), form + ': drift invalidates current acceptance: ' + str(file.relative_to(host)))
                finally:
                    file.write_bytes(saved)
                check(file.read_bytes() == saved, form + ': drift test restores exact bytes: ' + str(file.relative_to(host)))
                check(status()['fresh'] is True, form + ': exact restoration recovers current evidence')

            invoke('promote', '--manifest', manifest, expected='unknown|unsupported|operation')
            invoke('doctor', '--host-context', 'injected.json', expected='unknown|unsupported|protected|argument')
            invoke('init', *init_flags(**{'--task': 'missing-task'}), expected='TASK|task')
            invoke('init', *init_flags(**{'--asset': '../escape'}), expected='safe|invalid|identifier|path|asset')
            invoke('init', *init_flags(**{'--brief': '../outside.json'}), expected='path|travers|escape|reserved')
            engine_bytes = (host / 'ENGINE.md').read_bytes()
            try:
                (host / 'ENGINE.md').unlink()
                invoke('init', *init_flags(), expected='ENGINE|contract|explicit|ENOENT')
                check(not (host / manifest).exists(), form + ': missing explicit ENGINE creates no lifecycle state or fabricated hash')
            finally:
                (host / 'ENGINE.md').write_bytes(engine_bytes)
            media_before = sha(host / 'MEDIA.md')
            audio_before = sha(host / 'AUDIO.md')
            before = invoke('init', *init_flags())
            check(before['manifest'] == manifest, form + ': public init uses canonical task/version state')
            immutable = (host / manifest).read_bytes()
            invoke('init', *init_flags(), expected='exist|immutable|version|retained')
            check((host / manifest).read_bytes() == immutable, form + ': duplicate init preserves immutable version')
            state = status()
            check(state['humanRuntimeAcceptance'] is False and state['promotionAvailable'] is False, form + ': lifecycle cannot grant runtime or promotion authority')
            transplanted = host / '.hephaera/.cache/tasks/other/vfx/owned-effect/v1/manifest.json'
            transplanted.parent.mkdir(parents=True)
            transplanted.write_bytes(immutable)
            invoke('status', '--manifest', transplanted.relative_to(host).as_posix(), expected='ownership|identity|path')
            check(transplanted.read_bytes() == immutable, form + ': task-transplanted manifest is rejected without rewriting its history')
            doctor = invoke('doctor')
            check(doctor['readiness']['renderingAvailable'] is False and all(value['renderingAvailable'] is False for value in doctor['engines'].values()), form + ': every engine is explicitly unavailable for rendering in this delivery')
            invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', data['packagePath'], expected='provisional|accept')
            failed = invoke('init', *init_flags(**{'--asset': 'failed-effect'}))
            malformed = json.loads((host / data['packagePath']).read_bytes())
            malformed.update(id='failed-effect', executable='never execute fixture data')
            malformed_file = host / 'inputs/invalid/package.json'
            write_json(malformed_file, malformed)
            for _ in range(3):
                invoke('stage', '--manifest', failed['manifest'], '--phase', 'provisional', '--package', malformed_file.relative_to(host).as_posix(), expected='unknown|field|JSON|schema|package|native|failed')
            failed_state = invoke('status', '--manifest', failed['manifest'])
            failed_events = [json.loads(file.read_bytes()) for file in sorted((host / Path(failed['manifest']).parent / 'events').glob('*.json'))]
            check(failed_state['phases']['provisional']['staged'] is False and failed_state['phases']['provisional']['attempts'] == 3
                and sum(event['kind'] == 'stage-failed' for event in failed_events) == 3
                and not any(event['kind'] == 'stage-sealed' for event in failed_events), form + ': actual native rejections retain finite failed attempts without sealing a phase')
            retained_failures = {file.relative_to(host).as_posix(): sha(file) for file in (host / Path(failed['manifest']).parent).rglob('*') if file.is_file()}
            invoke('stage', '--manifest', failed['manifest'], '--phase', 'provisional', '--package', malformed_file.relative_to(host).as_posix(), expected='candidate|budget|exhaust')
            failed_revision = invoke('init', *init_flags('v2', **{'--asset': 'failed-effect', '--parent-manifest': failed['manifest']}))
            invoke('stage', '--manifest', failed_revision['manifest'], '--phase', 'provisional', '--package', malformed_file.relative_to(host).as_posix(), expected='candidate|budget|exhaust')
            check(all(sha(host / name) == digest for name, digest in retained_failures.items()), form + ': exhausted attempts survive revision and cannot be reset')

            def stage(visual=True):
                flags = ['--manifest', manifest, '--phase', 'provisional', '--package', package_path]
                if visual:
                    flags += ['--visual', data['visual']]
                staged = invoke('stage', *flags)
                check(re.fullmatch(r'[a-f0-9]{64}', staged['phaseDigest']) and sha(host / staged['reviewPacket']['path']) == staged['reviewPacket']['sha256'], form + ': staged phase binds exact review packet bytes')
                package_file = host / staged['package']['path']
                declaration = json.loads(package_file.read_bytes())
                check(sha(package_file) == staged['package']['sha256'] and all(sha(package_file.parent / item['path']) == item['sha256']
                    and (package_file.parent / item['path']).stat().st_size == item['bytes'] for item in declaration['resources']), form + ': native-observed complete resource closure preserves bytes and paths in staging')
                check({file.relative_to(package_file.parent).as_posix() for file in package_file.parent.rglob('*') if file.is_file()}
                    == {package_file.name, *(item['path'] for item in declaration['resources'])}, form + ': staging copies only the native-observed declared closure')
                return staged

            def record(staged, phase='provisional', reviewer='fixture-independent', verdict='accepted', name=None, expected=None, mutate=None):
                staged_file = host / 'inputs/staged.json'
                write_json(staged_file, staged)
                name = name or phase + '-' + verdict
                decision = json.loads(command(['node', baseline / 'tests/vfx-fixture.cjs', 'review', host, staged_file,
                    phase, reviewer, verdict, name], cwd=host).stdout)
                file = host / decision['evidence']
                if mutate:
                    value = json.loads(file.read_bytes())
                    mutate(value)
                    write_json(file, value)
                return invoke('record', '--manifest', manifest, '--phase', phase, '--reviewer', reviewer, '--evidence', decision['evidence'], expected=expected), file

            # A sealed phase is immutable; missing-visual and rejected decisions
            # retain their own versions instead of being overwritten by retries.
            invoke('init', *init_flags(**{'--asset': 'missing-visual'}))
            manifest = '.hephaera/.cache/tasks/qa/vfx/missing-visual/v1/manifest.json'
            package_path = data['noVisualPackagePath']
            no_visual = stage(False)
            record(no_visual, name='no-visual', expected='visual|coverage|unavailable|capture')
            manifest = data['manifest']
            package_path = data['packagePath']
            provisional = stage()
            record(provisional, reviewer=data['creator'], name='self-review', expected='independen|creator|distinct|author')
            record(provisional, name='wrong-packet', expected='packet|hash|mismatch|stale', mutate=lambda value: value.update(reviewPacketSha256='a' * 64))
            record(provisional, name='name-only', expected='sourceEvidence|required|missing|field', mutate=lambda value: value.pop('sourceEvidence'))
            record(provisional, verdict='rejected', name='rejected-retained')
            rejected_records = {file.relative_to(host).as_posix(): sha(file) for file in (host / Path(manifest).parent).rglob('*') if file.is_file()}
            invoke('stage', '--manifest', manifest, '--phase', 'provisional', '--package', package_path, expected='sealed|immutable|revision')
            invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', package_path, expected='provisional|accept')
            revision = invoke('init', *init_flags('v2', **{'--parent-manifest': manifest}))
            check(revision['manifest'] == data['revisedManifest'], form + ': rejected version has an explicit immutable revision')
            manifest = revision['manifest']
            package_path = data['revisedPackagePath']
            immutable = (host / manifest).read_bytes()
            provisional = stage()
            record(provisional, name='accepted-provisional')
            check(all(sha(host / name) == digest for name, digest in rejected_records.items()), form + ': revision preserves all prior attempts and rejected review bytes')
            detailed = invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', package_path, '--visual', data['visual'])
            record(detailed, phase='detailed', name='accepted-detailed')
            check((host / manifest).read_bytes() == immutable, form + ': staging and reviews preserve immutable manifest bytes')
            for operation in ['inspect', 'validate']:
                inspected = invoke(operation, '--manifest', manifest)
                check(inspected['humanRuntimeAcceptance'] is False and inspected['promotionAvailable'] is False, form + ': real native ' + operation + ' cannot grant runtime/promotion authority')
            forms[form].update(manifest=manifest, provisional=provisional, detailed=detailed)
            for name in ['STYLE.md', 'ENGINE.md', 'ARCHITECTURE.md', '.hephaera/.engine/THREEJS.md', '.hephaera/.engine/registry.json',
                         'inputs/brief.json', 'inputs/rights.json', 'inputs/permission.txt', 'inputs/effect-v2/textures/spark.png',
                         'inputs/camera.json', 'inputs/captures/end.png', 'inputs/reviews/accepted-provisional-notes.txt',
                         'inputs/bindings/model.glb', 'inputs/bindings/rig.json', 'inputs/bindings/clip.json',
                         'inputs/bindings/marker.json', 'inputs/bindings/transform.json',
                         'inputs/environment/backend.json', 'inputs/environment/driver.json', 'inputs/environment/renderer.json',
                         '.hephaera/commands/vfx-assets.sh', '.hephaera/commands/lib/vfx-assets.cjs']:
                mutate_and_reject(host / name)
            # Native build identity must remain current even when resource bytes
            # and policy files are otherwise unchanged.
            mutate_and_reject(built / 'bubo.dll')
            parent_hash = sha(host / manifest)
            revision = invoke('init', *init_flags('v3', **{'--parent-manifest': manifest}))
            check(revision['manifest'] == manifest.replace('/v2/', '/v3/') and sha(host / manifest) == parent_hash, form + ': revision retains exact immutable parent without rewriting history')
            revised = invoke('status', '--manifest', revision['manifest'])
            check(revised['humanRuntimeAcceptance'] is False and revised['promotionAvailable'] is False, form + ': revision carries no human/runtime or promotion acceptance')
            invoke('stage', '--manifest', revision['manifest'], '--phase', 'provisional', '--package', package_path, expected='candidate|budget|exhaust')
            check(sha(host / 'MEDIA.md') == media_before and sha(host / 'AUDIO.md') == audio_before and not (host / 'assets').exists(), form + ': owned workflow preserves unrelated media and produces no runtime assets')
            contexts = list((host / '.hephaera/.cache/tasks/qa/bubo-host').glob('*/host-context.json'))
            check(bool(contexts) and all(not json.loads(file.read_bytes())['tools'] and 'media' not in json.loads(file.read_bytes())['policy']
                and not any(ref['path'] in ['MEDIA.md', 'AUDIO.md'] for ref in json.loads(file.read_bytes())['references']) for file in contexts), form + ': actual native contexts isolate tools and unrelated media domains')
            check(not git(baseline, 'status', '--porcelain', '--untracked-files=no'), form + ': installed tracked baseline and native source remain clean')
            save('in-progress')
        save('passed')
        print(json.dumps({'status': 'passed', 'checks': len(checks), 'evidence': str(run / 'SUMMARY.json')}), flush=True)
    except BaseException:
        save('failed')
        print('Preserved installed VFX evidence at ' + str(run), flush=True)
        raise


if __name__ == '__main__':
    main()
