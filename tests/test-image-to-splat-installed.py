"""Actual installed host/CLI CPU checks; no installation, model or GPU execution.

Uses the committed Hephaera candidate and an already built pinned Bubo. Fixture
inputs and permissions are inert. No generation, technical construction approval,
human acceptance or promotion is requested or inferred.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

BASE = Path(__file__).resolve().parents[1]


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def put(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes((json.dumps(value, indent=2) + '\n').encode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    evidence = args.evidence.resolve(strict=True)
    assert evidence.is_dir() and evidence.is_relative_to(BASE) and not evidence.is_symlink()
    parent = BASE / '.local/sgi'
    parent.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='r-', dir=parent))
    source_env = dict(os.environ)
    for key in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'HEPHAERA_PROJECT_ROOT'):
        source_env.pop(key, None)
    config = run / 'gitconfig'
    config.write_bytes(b'[core]\n autocrlf = false\n longpaths = true\n[commit]\n gpgsign = false\n'
                       b'[user]\n name = Splat CPU fixture\n email = fixture@example.invalid\n')
    env = dict(source_env, GIT_ALLOW_PROTOCOL='file', GIT_TERMINAL_PROMPT='0',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(config))
    checks, forms = [], {}

    def check(value, label):
        assert value, label
        checks.append(label)
        print('PASS:', label, flush=True)

    def command(argv, cwd=BASE, selected_env=None, rejected=None):
        result = subprocess.run([str(v) for v in argv], cwd=cwd, env=selected_env or env,
                                capture_output=True, text=True, encoding='utf-8', timeout=180)
        if rejected is not None:
            check(result.returncode != 0 and rejected.lower() in (result.stdout + result.stderr).lower(),
                  'rejected: ' + rejected)
        else:
            assert result.returncode == 0, result.stdout + '\n' + result.stderr
        return result

    def git(folder, *values):
        return command(['git', '-C', folder, *values]).stdout.strip()

    def report(status):
        put(evidence / 'image-to-splat-installed-SUMMARY.json', {
            'status': status, 'checks': checks, 'forms': forms, 'fixture': str(run),
            'baselineHead': head, 'nativeRevision': pin['revision'],
            'scope': 'Actual committed clone/submodule host and pinned CLI CPU boundary only; '
                     'synthetic source/installation/rights fixtures. No model loading, generation, '
                     'creative claim, actual approval, rendering or promotion.'})

    head = git(BASE, 'rev-parse', 'HEAD')
    pin = json.loads((BASE / 'runtime/bubo.lock.json').read_bytes())
    try:
        status = command(['git', '-C', BASE, 'status', '--porcelain', '--untracked-files=no'],
                         selected_env=source_env).stdout.strip()
        check(not status, 'source and dependency are clean before installed acquisition')
        blob = command(['git', 'show', head + ':tests/test-image-to-splat-installed.py']).stdout
        check(blob.replace('\r\n', '\n') == Path(__file__).read_text(encoding='utf-8'),
              'executing installed fixture is committed at the source head')
        check(git(BASE, 'ls-tree', head, '--', 'commands/image-to-splat.sh').startswith('100755 '),
              'public wrapper is committed executable')
        command(['node', BASE / 'commands/lib/bubo-runtime.cjs', 'verify'])
        dependency = BASE / 'runtime/bubo'
        bundle = dependency / 'artifacts/bubo'
        original = {}
        for file in bundle.rglob('*'):
            assert not file.is_symlink() and (file.is_dir() or file.is_file())
            if file.is_file():
                original[file.relative_to(bundle).as_posix()] = sha(file)
        check(bool(original), 'existing verified native publication has a regular-file inventory')
        if os.name == 'nt':
            executable_path = command(['git', '--exec-path']).stdout.strip()
            bash = str(Path(executable_path).parents[2] / 'bin/bash.exe')
            assert Path(bash).is_file()
        else:
            bash = 'bash'

        for form in ('clone', 'submodule'):
            host = run / ('c' if form == 'clone' else 's')
            host.mkdir()
            git(host, 'init', '-q', '--initial-branch=main')
            base = host / '.hephaera'
            if form == 'clone':
                command(['git', 'clone', '-q', '--no-hardlinks', BASE, base], host)
            else:
                git(host, 'submodule', 'add', '-q', str(BASE), '.hephaera')
            git(base, 'checkout', '-q', '--detach', head)
            git(base, 'config', 'submodule.runtime/bubo.url', str(dependency))
            git(base, 'submodule', 'update', '--init', '--recursive', '--checkout', 'runtime/bubo')
            check(git(base / 'runtime/bubo', 'rev-parse', 'HEAD') == pin['revision'],
                  form + ': recursive initialization selects the actual merged Bubo pin')
            copied = base / 'runtime/bubo/artifacts/bubo'
            shutil.copytree(bundle, copied)
            for name, expected in original.items():
                assert sha(copied / name) == expected
            command(['node', base / 'commands/lib/bubo-runtime.cjs', 'verify'], host)
            local_env = dict(env, HEPHAERA_PROJECT_ROOT=str(host))

            def shell(name, *values, rejected=None):
                return command([bash, base / 'commands' / name, *values], host,
                               local_env, rejected=rejected)

            def cli(operation, *values, rejected=None):
                result = shell('image-to-splat.sh', operation, '--root', host, *values, rejected=rejected)
                return None if rejected is not None else json.loads(result.stdout)

            shell('create-host-ai-scaffold.sh')
            shell('generate-engine.sh', 'THREEJS')
            shell('generate-style.sh', 'CEL_SHADED_COMIC')
            shell('generate-media-contract.sh', 'CLOUD', 'LOCAL')
            skill = json.loads(shell('resolve-skill.sh', 'build-image-to-splat-assets').stdout)
            check(skill['compatible'] is True, form + ': installed coordinating skill is compatible')
            task = 'splat-cpu'
            task_dir = host / '.hephaera/.cache/tasks' / task
            task_dir.mkdir(parents=True, exist_ok=True)
            (task_dir / 'TASK.md').write_bytes(b'# Inert CPU fixture; no actual generation or approval\n')
            selection = f'.hephaera/.cache/tasks/{task}/selection.json'
            shell('resolve-art-pipeline.sh', '--override', 'LOCAL', '--json', '--evidence', selection)
            policy_files = ['STYLE.md', 'ENGINE.md', 'MEDIA.md']
            before = {name: sha(host / name) for name in policy_files}
            workspace, shared = '.hephaera/.cache/splat-tools', '.hephaera/.cache/local-media/shared-state'
            doctor = cli('doctor')
            check(doctor['runtime']['verified'] is True and doctor['gpuProbed'] is False
                  and doctor['modelLoading'] is False and doctor['generation'] is False,
                  form + ': actual installed doctor verifies the runtime without a GPU/model operation')
            setup = cli('setup', '--task', task, '--workspace', workspace, '--media-state', shared,
                        '--media', 'MEDIA.md', '--selection', selection, '--timeout', '30')
            check(setup['data']['mode'] == 'dry-run' and setup['data']['gpuUsed'] is False
                  and setup['data']['filesWritten'] is False and setup['data']['installationVerified'] is False,
                  form + ': actual native setup metadata is dry-run and grants no installation/readiness')

            def ref(name):
                return {'path': name, 'sha256': sha(host / name)}

            inputs = host / 'inputs'
            inputs.mkdir()
            (inputs / 'source.bin').write_bytes(b'SYNTHETIC non-image; CPU hash validation only\n')
            put(inputs / 'installation.json', {'fixture': 'inert receipt; no installed models'})
            put(inputs / 'rights.json', {'fixture': 'no actual generation permission'})
            put(inputs / 'approval.json', {'fixture': 'no actual generation or GPU permission'})
            budgets = dict(maxGaussians=131072, maxInputBytes=33554432, maxDecodedBytes=33554432,
                           maxHeaderBytes=65536, timeoutSeconds=30, maxLogBytes=1048576,
                           maxProcessMemoryBytes=268435456)
            native_request = dict(schemaVersion='bubo-splat-request/v1', backend='triposplat',
                                  styleSha256=before['STYLE.md'], input=ref('inputs/source.bin'),
                                  gaussianCounts=[32768, 131072], seed=42, budgets=budgets)
            request = dict(schemaVersion='bubo-splat-generation/v1', task=task, runId='cpu-only',
                           attemptKind='candidate', request=native_request,
                           installation=ref('inputs/installation.json'), authorization=ref('inputs/approval.json'),
                           settings=dict(steps=20, guidance=3, shift=3, erodeRadius=1),
                           limits=dict(maxInputPixels=1048576, maxInputEdge=1024, maxAspectRatio=1,
                                       maxOutputBytes=33554432, maxGpuAllocatedBytes=2147483648,
                                       minGpuFreeBytes=1073741824))
            put(inputs / 'request.json', request)
            initial = cli('init', '--task', task, '--asset', 'prop', '--version', 'v1', '--creator', 'fixture',
                          '--request', 'inputs/request.json', '--selection', selection, '--media', 'MEDIA.md',
                          '--workspace', workspace, '--media-state', shared)
            manifest = initial['manifest']
            cli('validate', '--manifest', manifest)
            saved = list((host / manifest).parent.glob('native/validate-*.json'))
            check(len(saved) == 1, form + ': actual native validation envelope retained')
            result = json.loads(saved[0].read_bytes())
            check('runtime' not in result and result['data']['schemaVersion'] == 'bubo-splat-request-validation/v1'
                  and result['data']['valid'] is True and result['data']['gpuUsed'] is False
                  and result['data']['inputDecodingVerified'] is False,
                  form + ': real splat envelope without a runtime field validates source bytes only')
            context = json.loads((host / result['hostSplatDispatch']['hostContext']['path']).read_bytes())
            check(context['policy']['pipeline'] == 'LOCAL'
                  and context['policy'].get('purpose') != 'local-media' and context['policy']['media']['path'] == 'MEDIA.md',
                  form + ': real native dispatch uses full-art LOCAL plus MEDIA policy')
            cli('status', '--manifest', manifest)
            cli('verify-package', '--manifest', manifest, rejected='successful generated package')
            check(before == {name: sha(host / name) for name in policy_files},
                  form + ': STYLE primary, engine and MEDIA remain byte-identical')
            check(not (host / shared / 'image-to-splat/ledger').exists(),
                  form + ': CPU metadata/validation created no native attempt ledger')
            check(not any((host / name).exists() for name in ('AUDIO.md', 'MUSIC.md', 'VOICE.md')),
                  form + ': optional independent media domains were not configured')
            (inputs / 'source.bin').write_bytes(b'changed synthetic source\n')
            stale = cli('status', '--manifest', manifest)
            check(stale['stage'] == 'stale' and bool(stale['staleInputs']), form + ': changed source is reported stale')
            cli('validate', '--manifest', manifest, rejected='stale')
            forms[form] = {'baselineHead': head, 'nativeRevision': pin['revision'], 'manifest': manifest,
                           'fullArtContextVerified': True, 'generation': False, 'GPU': False}
        check(all(sha(bundle / name) == expected for name, expected in original.items()),
              'original built Bubo publication is unchanged after both forms')
        report('pass')
        print('Installed image-to-splat CPU checks passed:', len(checks))
    except BaseException:
        report('fail')
        raise


if __name__ == '__main__':
    main()
