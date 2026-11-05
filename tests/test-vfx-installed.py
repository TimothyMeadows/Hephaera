"""Run the committed public VFX wrapper in real clone/submodule installations.

Select an existing clean pinned native checkout with --native-root. Its complete
verified publication is copied byte-for-byte; this test builds/installs nothing.
All image/review fixtures are synthetic protocol assertions, not visual approval.
"""
from pathlib import Path
import argparse
import ctypes
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import time


BASE = Path(__file__).resolve().parents[1]


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def process_active(pid):
    """Probe only a recorded owned PID; never terminate from a liveness probe."""
    if os.name != 'nt':
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetExitCodeProcess.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        error = ctypes.get_last_error()
        if error == 87:  # ERROR_INVALID_PARAMETER: this PID no longer exists.
            return False
        raise OSError(error, 'Owned process liveness is unverified')
    try:
        code = wintypes.DWORD()
        if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
            raise OSError(ctypes.get_last_error(), 'Owned process exit code is unavailable')
        return code.value == 259  # STILL_ACTIVE
    finally:
        kernel.CloseHandle(handle)


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
            'sourceHashes': {name: sha(BASE / name) for name in ['tests/test-vfx-installed.py', 'tests/vfx-fixture.cjs',
                'commands/lib/vfx-assets.cjs', 'commands/lib/bubo-vfx-adapter.cjs', 'runtime/bubo.lock.json']},
            'scope': 'Actual committed clone/submodule shell wrapper, pinned native inspection and fixed PNG preparation/verification. '
                     'Synthetic captures/review decisions test protocol binding only; no real visual quality, '
                     'human/runtime acceptance, rendering, generation or promotion.'}
        write_json(run / 'SUMMARY.json', value)
        write_json(evidence / ('vfx-installed-' + run.name + '-SUMMARY.json'), value)

    def command(argv, cwd=BASE, expected=None, environment=None, timeout=180, allowed_exit_codes=None):
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
        elif allowed_exit_codes is not None:
            assert result.returncode in allowed_exit_codes, result.stdout + '\n' + result.stderr
        else:
            assert result.returncode == 0, result.stdout + '\n' + result.stderr
        return result

    def git(folder, *values, environment=None):
        return command(['git', '-C', folder, *values], environment=environment).stdout.strip()

    try:
        source_head = git(BASE, 'rev-parse', 'HEAD')
        check(not git(BASE, 'status', '--porcelain', '--untracked-files=no', environment=source_env), 'tracked source and native dependency are clean before acquisition')
        for name in ['test-vfx-installed.py', 'test-vfx-assets.cjs', 'test-vfx-threejs-runtime.mjs', 'vfx-fixture.cjs']:
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
            verified_build = json.loads(command(['node', baseline / 'commands/lib/bubo-runtime.cjs', 'verify'], cwd=baseline).stdout)
            native_build_sha = hashlib.sha256(json.dumps(verified_build['build'], separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()
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
                check(all(item['runtime']['buildSha256'] == native_build_sha for item in inspected['inspections']), form + ': host phase uses the exact native compact build identity')
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

            # Actual native decoding and portable atlas ancestry through the
            # public installed wrapper, separately from the old v1 scenarios.
            legacy_manifest = manifest
            prepared_records = []
            for preparation_key in ['preparation', 'sheetPreparation']:
                source = data[preparation_key]
                prepared_init = invoke('init', *init_flags(**{'--asset': source['asset']}))
                manifest = prepared_init['manifest']
                invoke('prepare', '--manifest', manifest, '--phase', 'detailed', '--request', source['requestPath'], expected='provisional|accept')
                check(status()['phases']['detailed']['attempts'] == 0, form + ': detailed preparation gate runs before candidate reservation')
                provisional = invoke('stage', '--manifest', manifest, '--phase', 'provisional', '--package', source['provisionalPackagePath'], '--visual', data['visual'])
                record(provisional, name=source['asset'] + '-provisional')
                prepared = invoke('prepare', '--manifest', manifest, '--phase', 'detailed', '--request', source['requestPath'])
                check(sha(host / prepared['preparation']['path']) == prepared['preparation']['sha256']
                    and sha(host / prepared['nativePreparation']['path']) == prepared['nativePreparation']['sha256'], form + ': host preparation and actual native seal have exact file identities')
                prepared_package = host / prepared['package']['path']
                declaration = json.loads(prepared_package.read_bytes())
                atlas = declaration['atlases'][0]
                check(declaration['schemaVersion'] == 'bubo-vfx-package/v2' and len(declaration['resources']) == 1
                    and atlas['width'] == 18 and atlas['height'] == 7 and atlas['padding'] == 1 and atlas['extrusion'] == 1,
                    form + ': actual native preparation builds bounded padded non-square portable atlas')
                check(atlas['rateNumerator'] == 30000 and atlas['rateDenominator'] == 1001
                    and atlas['durationNumerator'] == 1001 and atlas['durationDenominator'] == 10000
                    and atlas['loop'] == source['request']['timing']['loop'], form + ': native atlas preserves exact rational frame duration and loop policy')
                check([frame['sourceFrame'] for frame in atlas['frames']] == ([2, 0, 1] if preparation_key == 'sheetPreparation' else [0, 1, 2]),
                    form + ': native sequence/sheet selection preserves original source frame order')
                atlas_file = prepared_package.parent / declaration['resources'][0]['path']
                actual_pixels = json.loads(command(['node', baseline / 'tests/vfx-fixture.cjs', 'pixels', atlas_file], cwd=host).stdout)
                source_pixels = [json.loads(command(['node', baseline / 'tests/vfx-fixture.cjs', 'pixels', host / item['path']], cwd=host).stdout)
                    for item in source['sources']]
                for frame_index, frame in enumerate(atlas['frames']):
                    original = source_pixels[0] if preparation_key == 'sheetPreparation' else source_pixels[frame_index]
                    source_x = frame['sourceFrame'] * 3 if preparation_key == 'sheetPreparation' else 0
                    for y in range(-1, 4):
                        for x in range(-1, 3):
                            actual_offset = ((frame['y'] + y) * actual_pixels['width'] + frame['x'] + x) * 4
                            original_offset = (min(2, max(0, y)) * original['width'] + source_x + min(1, max(0, x))) * 4
                            assert actual_pixels['pixels'][actual_offset:actual_offset + 4] == original['pixels'][original_offset:original_offset + 4], 'native decoded pixels/alpha/extrusion differ from independent original source decoder'
                check(True, form + ': every decoded RGBA pixel and edge extrusion matches independent owned source fixtures')
                invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', prepared['package']['path'], '--visual', data['visual'], expected='rights|derived|preparation|source')
                # The missing-receipt attempt is spent, and the original native
                # reservation remains usable only through its exact receipt.
                detailed = invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', prepared['package']['path'], '--preparation', prepared['preparation']['path'], '--visual', data['visual'])
                record(detailed, phase='detailed', name=source['asset'] + '-detailed')
                current = status()
                check(current['phases']['detailed']['accepted'] and current['phases']['detailed']['attempts'] == 2
                    and current['humanRuntimeAcceptance'] is False and current['promotionAvailable'] is False,
                    form + ': native preparation and detail retain exact consumed candidates with separate runtime/promotion gates')
                for file in [source['requestPath'], *[item['path'] for item in source['sources']], prepared['preparation']['path'],
                             prepared['nativePreparation']['path'], prepared['package']['path'], atlas_file.relative_to(host).as_posix(),
                             'inputs/camera.json', 'inputs/captures/start.png', 'inputs/reviews/' + source['asset'] + '-provisional-notes.txt',
                             'inputs/reviews/' + source['asset'] + '-detailed.json', '.hephaera/.engine/threejs/particles/three-vfx-runtime.mjs',
                             '.hephaera/.engine/threejs/particles/vfx-package.mjs', '.hephaera/commands/lib/bubo-vfx-adapter.cjs']:
                    mutate_and_reject(host / file)
                invoke('prepare', '--manifest', manifest, '--phase', 'detailed', '--request', source['requestPath'], expected='sealed|immutable|already|attempt|candidate')
                prepared_records.append({'manifest': manifest, 'preparation': prepared, 'detailed': detailed})
            forms[form]['preparations'] = prepared_records
            source = data['composedPreparation']
            manifest = invoke('init', *init_flags(**{'--asset': source['asset']}))['manifest']
            provisional = invoke('stage', '--manifest', manifest, '--phase', 'provisional', '--package', source['provisionalPackagePath'], '--visual', data['visual'])
            record(provisional, name='composition-provisional')
            prepared = invoke('prepare', '--manifest', manifest, '--phase', 'detailed', '--request', source['requestPath'])
            declaration = json.loads((host / prepared['package']['path']).read_bytes())
            composition_dir = host / 'inputs/composed-result'
            composition_dir.mkdir()
            for resource in declaration['resources']:
                target = composition_dir / resource['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile((host / prepared['package']['path']).parent / resource['path'], target)
            declaration['effects'].append({'id': 'cast', 'durationSeconds': .5, 'layers': [{'id': 'burst', 'kind': 'burst',
                'startSeconds': 0, 'durationSeconds': .5, 'resourceIds': ['atlas'], 'maxParticles': 4,
                'maxVertices': 16, 'maxDrawCalls': 1, 'maxTrailPoints': 0}]})
            declaration['atlases'][0]['bindings'].append({'effectId': 'cast', 'layerId': 'burst'})
            declaration['budgets'].update(maxEffects=2, maxLayers=2, maxParticles=8, maxVertices=64, maxDrawCalls=4,
                maxTrailPoints=16, maxDurationSeconds=4)
            composition_file = composition_dir / 'package.json'
            write_json(composition_file, declaration)
            profile = {'schemaVersion': 'hephaera-three-vfx-profile/v1', 'nativePackageSha256': sha(composition_file),
                'preparationSha256': prepared['nativePreparation']['sha256'],
                'budgets': {'maxSystems': 4, 'maxParticles': 32, 'maxTrailPoints': 16, 'maxVertices': 128, 'maxIndices': 256,
                    'maxDrawCalls': 4, 'maxTextureBytes': 1024, 'maxBufferBytes': 4000000, 'maxDurationSeconds': 4, 'maxUpdateSeconds': .1},
                'layers': [{'effectId': 'cast', 'layerId': 'burst', 'family': 'burst',
                    'emission': {'kind': 'burst', 'capacity': 4, 'count': 3, 'rate': 0, 'lifetimeSeconds': .2, 'durationSeconds': .3},
                    'size': .3, 'speed': 0, 'color': [1, .5, .25, .8], 'space': 'world', 'maxTailSeconds': .2, 'resourceId': 'atlas'}]}
            profile_file = host / 'inputs/composed-profile.json'
            write_json(profile_file, profile)
            invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', composition_file.relative_to(host).as_posix(),
                '--production', profile_file.relative_to(host).as_posix(), '--visual', data['visual'], expected='preparation|identity|mismatch')
            detailed = invoke('stage', '--manifest', manifest, '--phase', 'detailed', '--package', composition_file.relative_to(host).as_posix(),
                '--preparation', prepared['preparation']['path'], '--production', profile_file.relative_to(host).as_posix(), '--visual', data['visual'])
            record(detailed, phase='detailed', name='composition-detailed')
            check(status()['phases']['detailed']['accepted'] and status()['phases']['detailed']['attempts'] == 2,
                form + ': explicit within-brief native composition expands one-particle preparation through exact reviewed production profile')
            for file in [profile_file, composition_file, composition_dir / 'atlas.png']:
                mutate_and_reject(file)
            forms[form]['composition'] = {'manifest': manifest, 'preparation': prepared, 'production': profile_file.relative_to(host).as_posix(), 'detailed': detailed}
            manifest = legacy_manifest
            # Interrupt an actual independently owned wrapper after native
            # source inspection and real payload copying. Retain its lock,
            # attempt and reservations, then recover only through the CLI.
            interrupted = invoke('init', *init_flags(**{'--asset': 'interrupted-effect'}))
            interruption_manifest = interrupted['manifest']
            interrupted_directory = host / Path(interruption_manifest).parent
            asset_directory = interrupted_directory.parent
            input_inventory = {file.relative_to(host).as_posix(): sha(file) for file in (host / 'inputs').rglob('*') if file.is_file()}
            staging = host / interrupted['staging'] / 'attempts'
            argv = [bash, (baseline / 'commands/vfx-assets.sh').as_posix(), 'stage', '--root', host.as_posix(),
                '--manifest', interruption_manifest, '--phase', 'provisional', '--package', data['interruptionPackagePath'], '--visual', data['visual']]
            process_options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {'start_new_session': True}
            process = subprocess.Popen(argv, cwd=host, env=host_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding='utf-8', **process_options)
            stopped = False
            owned_pids = {process.pid}

            def stop_owned():
                if os.name == 'nt':
                    # A descendant can exit during taskkill enumeration, which
                    # returns1,128 or255. No code proves retirement: retain
                    # every reported PID and always require the bounded OS
                    # liveness checks below, including the Popen/native roots.
                    result = command(['taskkill', '/PID', str(process.pid), '/T', '/F'], cwd=host,
                        environment=host_env, allowed_exit_codes=[0, 1, 128, 255])
                    owned_pids.update(int(value) for value in re.findall(r'process with PID (\d+)', result.stdout + result.stderr, re.I))
                else:
                    os.killpg(process.pid, signal.SIGKILL)

            try:
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    if list(staging.glob('provisional-*/package/textures/spark.png')):
                        stop_owned()
                        stopped = True
                        break
                    assert process.poll() is None, 'Owned stage completed before the interruption point'
                    time.sleep(.005)
                assert stopped, 'No actual copied payload appeared within the interruption observation budget'
            finally:
                if not stopped and process.poll() is None:
                    stop_owned()
                stdout, stderr = process.communicate(timeout=20)
                record = {'command': argv, 'cwd': str(host), 'pid': process.pid,
                    'exitCode': process.returncode, 'stdout': stdout, 'stderr': stderr}
                calls.append(record)
                write_json(run / f'call-{len(calls):04d}.json', record)
            deadline = time.monotonic() + 10
            while any(process_active(pid) for pid in owned_pids) and time.monotonic() < deadline:
                time.sleep(.02)
            check(process.returncode != 0 and not any(process_active(pid) for pid in owned_pids), form + ': actual owned wrapper and reported descendants exited according to OS liveness')
            interrupted_status = invoke('status', '--manifest', interruption_manifest)
            phase = interrupted_status['phases']['provisional']
            check(interrupted_status['ownership']['state'] == 'abandoned' and not interrupted_status['ownership']['writable']
                and phase['attempts'] == 1 and len(phase['incompleteAttempts']) == 1 and not phase['staged'] and not phase['accepted'],
                form + ': actual interrupted copy reports abandoned ownership and one unsealed consumed attempt')
            events = [json.loads(file.read_bytes()) for file in sorted((interrupted_directory / 'events').glob('*.json'))]
            check(any(event['kind'] == 'stage-started' for event in events) and not any(event['kind'] in ['stage-sealed', 'review'] for event in events)
                and not list(staging.glob('*/review-packet.json')), form + ': interrupted payload never acquires a sealed review packet or acceptance')
            copied_inventory = {file.relative_to(host).as_posix(): sha(file) for file in staging.rglob('*') if file.is_file()}
            reservations = {file.name: sha(file) for file in (asset_directory / '.history').glob('*.json')}
            owner_bytes = (asset_directory / '.write-lock').read_bytes()
            check(bool(copied_inventory) and input_inventory == {file.relative_to(host).as_posix(): sha(file) for file in (host / 'inputs').rglob('*') if file.is_file()}, form + ': interruption retains copied payload and leaves every source input unchanged')
            invoke('init', *init_flags('v2', **{'--asset': 'interrupted-effect', '--parent-manifest': interruption_manifest}), expected='already owned|retained lock|recovery')
            recovered = invoke('recover', '--manifest', interruption_manifest)
            check(recovered['recovered'] and (host / recovered['archive'] / 'write-lock.json').read_bytes() == owner_bytes
                and recovered['processes']['processTermination'] is False and recovered['processes']['childCleanup'] == 'unverified-no-tracked-child-identities',
                form + ': public recover archives exact dead-owner bytes without claiming untracked child termination')
            check(reservations == {file.name: sha(file) for file in (asset_directory / '.history').glob('*.json')}
                and copied_inventory == {file.relative_to(host).as_posix(): sha(file) for file in staging.rglob('*') if file.is_file()}, form + ': recovery preserves attempt budgets and all interrupted payload bytes')
            recovered_status = invoke('status', '--manifest', interruption_manifest)
            check(recovered_status['ownership']['writable'] and recovered_status['phases']['provisional']['attempts'] == 1
                and len(recovered_status['phases']['provisional']['interruptedAttempts']) == 1
                and not recovered_status['phases']['provisional']['accepted'], form + ': recovered asset can continue while interruption remains consumed and unaccepted')
            check(recovered_status['ownership']['claim']['state'] == 'completed'
                and sha(host / recovered['claimCompletion']['path']) == recovered['claimCompletion']['sha256']
                and sha(host / recovered['completion']['path']) == recovered['completion']['sha256'], form + ': ordinal claim and separate release completion retain their exact public identities')
            invoke('stage', '--manifest', interruption_manifest, '--phase', 'provisional', '--package', data['interruptionPackagePath'], '--visual', data['visual'])
            continued = invoke('init', *init_flags('v2', **{'--asset': 'interrupted-effect', '--parent-manifest': interruption_manifest}))
            invoke('stage', '--manifest', continued['manifest'], '--phase', 'provisional', '--package', data['interruptionRevisionPackagePath'], '--visual', data['visual'])
            exhausted = invoke('init', *init_flags('v3', **{'--asset': 'interrupted-effect', '--parent-manifest': continued['manifest']}))
            invoke('stage', '--manifest', exhausted['manifest'], '--phase', 'provisional', '--package', data['interruptionRevisionPackagePath'], expected='candidate|budget|exhaust')
            check(all(sha(asset_directory / '.history' / name) == expected for name, expected in reservations.items()), form + ': retry and new version cannot reset the actual interrupted attempt allowance')
            forms[form]['interruption'] = {'manifest': interruption_manifest, 'ownedPids': sorted(owned_pids),
                'beforeRecovery': interrupted_status, 'recovery': recovered, 'afterRecovery': recovered_status,
                'retainedPayload': copied_inventory, 'continuedManifest': continued['manifest']}
            # Interrupt the new real native processing boundary as well. The
            # owned 16MP mask has finite256MiB allocation/128MiB output/15second limits, and
            # supplies an observable native-start window without a provider.
            source = data['interruptedPreparation']
            prepared_init = invoke('init', *init_flags(**{'--asset': source['asset'], '--brief': source['brief']}))
            native_manifest = prepared_init['manifest']
            native_state = host / Path(native_manifest).parent
            native_asset = native_state.parent
            native_staging = host / prepared_init['staging'] / 'attempts'
            argv = [bash, (baseline / 'commands/vfx-assets.sh').as_posix(), 'prepare', '--root', host.as_posix(),
                '--manifest', native_manifest, '--phase', 'provisional', '--request', source['requestPath']]
            process = subprocess.Popen(argv, cwd=host, env=host_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding='utf-8', **process_options)
            owned_pids = {process.pid}
            stopped = False
            native_attempt = None
            try:
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    starts = list(native_staging.glob('provisional-*/native/started.json'))
                    if starts:
                        native_attempt = starts[0].parent.parent
                        child = json.loads((native_attempt / 'native-process/child.json').read_bytes())
                        check(isinstance(child['pid'], int) and child['pid'] > 0, form + ': actual preparation records positive owned native PID before interruption')
                        owned_pids.add(child['pid'])
                        stop_owned()
                        stopped = True
                        break
                    assert process.poll() is None, 'Native preparation completed before its bounded interruption window'
                    time.sleep(.005)
                assert stopped, 'Native preparation did not reach its owned start receipt within60seconds'
            finally:
                if not stopped and process.poll() is None:
                    stop_owned()
                stdout, stderr = process.communicate(timeout=20)
                record = {'command': argv, 'cwd': str(host), 'pid': process.pid,
                    'exitCode': process.returncode, 'stdout': stdout, 'stderr': stderr}
                calls.append(record)
                write_json(run / f'call-{len(calls):04d}.json', record)
            deadline = time.monotonic() + 10
            while any(process_active(pid) for pid in owned_pids) and time.monotonic() < deadline:
                time.sleep(.02)
            check(process.returncode != 0 and not any(process_active(pid) for pid in owned_pids), form + ': interrupted wrapper and recorded native descendants are actually absent according to OS')
            partial_inventory = {file.relative_to(host).as_posix(): sha(file) for file in native_staging.rglob('*') if file.is_file()}
            check(partial_inventory and not (native_attempt / 'native/preparation.json').exists()
                and not list(native_staging.glob('*/review-packet.json')), form + ': actual interrupted native output retains start/request residue and acquires no preparation/review seal')
            interrupted_native = invoke('status', '--manifest', native_manifest)
            check(interrupted_native['ownership']['state'] == 'abandoned' and interrupted_native['phases']['provisional']['attempts'] == 1
                and interrupted_native['nativeProcesses'][0]['state'] == 'retired' and interrupted_native['nativeProcesses'][0]['proof'] == 'ESRCH',
                form + ': actual dead native child proof remains distinct from parent ownership and consumed candidate')
            reservations = {file.name: sha(file) for file in (native_asset / '.history').glob('*.json')}
            recovered_native = invoke('recover', '--manifest', native_manifest)
            check(recovered_native['processes']['childCleanup'] == 'tracked-native-preparation-retirement-proven'
                and recovered_native['processes']['processTermination'] is False
                and recovered_native['processes']['nativeChildren'][0]['proof'] == 'ESRCH', form + ': public native recovery binds proven child retirement without claiming to terminate it')
            check(reservations == {file.name: sha(file) for file in (native_asset / '.history').glob('*.json')}
                and partial_inventory == {file.relative_to(host).as_posix(): sha(file) for file in native_staging.rglob('*') if file.is_file()},
                form + ': native recovery retains every partial byte and exact candidate reservation')
            invoke('prepare', '--manifest', native_manifest, '--phase', 'provisional', '--request', source['requestPath'], expected='claim|exist|reservation|version|native|failed')
            retried_native = invoke('status', '--manifest', native_manifest)
            check(retried_native['phases']['provisional']['attempts'] == 2 and not retried_native['phases']['provisional']['accepted']
                and all(sha(host / file) == digest for file, digest in partial_inventory.items()),
                form + ': new output cannot reset permanent interrupted native version claim or discard original bytes')
            forms[form]['nativeInterruption'] = {'manifest': native_manifest, 'ownedPids': sorted(owned_pids),
                'beforeRecovery': interrupted_native, 'recovery': recovered_native, 'afterRetry': retried_native, 'retainedPayload': partial_inventory}
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
