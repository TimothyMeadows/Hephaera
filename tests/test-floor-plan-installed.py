"""Exercise real pinned floor-plan dispatch in clone and submodule hosts.

Requires an explicitly built clean Bubo dependency and committed Hephaera source.
No downloads/builds/installations or human approvals occur. --blender optionally
runs owned procedural fixtures through construction, export and complete views.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

BASE = Path(__file__).resolve().parents[1]


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--blender', type=Path)
    args = parser.parse_args()
    evidence = args.evidence.resolve(strict=True)
    run = Path(tempfile.mkdtemp(prefix='installed-', dir=evidence))
    assert run.parent == evidence and not run.is_symlink()
    env = dict(os.environ, GIT_ALLOW_PROTOCOL='file', GIT_TERMINAL_PROMPT='0',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(run/'gitconfig'))
    for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'HEPHAERA_PROJECT_ROOT']:
        env.pop(key, None)
    (run/'gitconfig').write_text('[core]\n autocrlf = false\n longpaths = true\n[commit]\n gpgsign = false\n[user]\n name = Floor plan fixture\n email = fixture@example.invalid\n')
    checks, forms = [], {}

    def check(value, message):
        assert value, message
        checks.append(message)
        print('PASS:', message, flush=True)

    def command(argv, cwd, fail=False, environment=None):
        result = subprocess.run([str(x) for x in argv], cwd=cwd, env=environment or env,
                                capture_output=True, text=True, encoding='utf-8', timeout=1800)
        if fail:
            check(result.returncode != 0, 'expected rejection: '+str(argv[-1]))
        else:
            assert result.returncode == 0, result.stdout+'\n'+result.stderr
        return result

    def git(folder, *values):
        return command(['git', '-C', folder, *values], BASE).stdout.strip()

    def save(status):
        (run/'SUMMARY.json').write_text(json.dumps({'status': status, 'checks': checks, 'forms': forms,
            'baselineHead': git(BASE, 'rev-parse', 'HEAD'),
            'scope': 'Real pinned native dispatch and optional actual Blender; design decisions are synthetic QA only, no human/model/engine acceptance or promotion.'}, indent=2)+'\n')

    try:
        command(['node', BASE/'commands/lib/bubo-runtime.cjs', 'verify'], BASE)
        dependency = BASE/'runtime/bubo'
        receipt = json.loads((dependency/'artifacts/bubo/build-info.json').read_bytes())
        pin = json.loads((BASE/'runtime/bubo.lock.json').read_bytes())
        check(receipt['sourceRevision'] == pin['revision'] and not receipt['sourceDirty'], 'explicit clean native build matches recorded merged revision')
        bash = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
        for form in ['clone', 'submodule']:
            host = run/form
            host.mkdir()
            git(host, 'init', '-q', '--initial-branch=main')
            baseline = host/'.hephaera'
            if form == 'clone':
                command(['git', 'clone', '-q', '--no-hardlinks', BASE, baseline], host)
            else:
                git(host, 'submodule', 'add', '-q', str(BASE), '.hephaera')
            git(baseline, '-c', 'submodule.runtime/bubo.url='+str(dependency), 'submodule', 'update', '--init', '--checkout', '--', 'runtime/bubo')
            built = baseline/'runtime/bubo/artifacts/bubo'
            for file in (dependency/'artifacts/bubo').rglob('*'):
                assert not file.is_symlink() and (file.is_file() or file.is_dir()), 'Bundle contains unsupported path'
            shutil.copytree(dependency/'artifacts/bubo', built, symlinks=False)
            check(git(baseline/'runtime/bubo', 'rev-parse', 'HEAD') == pin['revision'], form+': actual nested dependency uses merged revision')
            host_env = dict(env, HEPHAERA_PROJECT_ROOT=str(host).replace('\\', '/'))
            command([bash, str(baseline/'commands/generate-style.sh').replace('\\', '/'), '--pipeline', 'FLOOR_PLAN_TO_MODEL', 'CEL_SHADED_COMIC'], baseline, environment=host_env)
            skill = json.loads(command([bash, str(baseline/'commands/resolve-skill.sh').replace('\\', '/'), 'build-floor-plan-models'], baseline, environment=host_env).stdout)
            check(skill['compatible'], form+': coordinating skill resolves compatible before use')
            style = host/'STYLE.md'
            style_hash = sha(style)
            task = host/'.hephaera/.cache/tasks/floor-plan-qa'
            task.mkdir(parents=True, exist_ok=True)
            (host/'inputs').mkdir()
            # An unrelated invalid MEDIA contract must never affect procedural architecture.
            (host/'MEDIA.md').write_text('Intentionally not a media contract; floor production does not read this.\n')
            adapter = baseline/'commands/lib/bubo-floor-plan-adapter.cjs'

            def invoke(operation, *values, fail=False):
                result = command([bash, str(baseline/'commands/floor-plan-to-model.sh').replace('\\', '/'), operation, '--root', host, *values], host, fail=fail, environment=host_env)
                if fail:
                    return result
                return json.loads(result.stdout)

            cases = ['single-storey', 'multi-storey', 'angled-courtyard'] if args.blender and form == 'clone' else ['single-storey']
            forms[form] = {'host': str(host), 'cases': {}}
            for index, name in enumerate(cases):
                asset = ['single', 'multi', 'court'][index]
                plan = json.loads((dependency/'resources/floor-plan-to-model/examples-v2'/f'{name}.json').read_bytes())
                plan['styleSha256'] = style_hash
                plan['budgets']['maxGeometryChecks'] = 4000000
                source = host/'inputs'/f'{asset}.json'
                source.write_text(json.dumps(plan, indent=2)+'\n')
                rights = task/f'{asset}-rights.json'
                rights.write_text(json.dumps({'schemaVersion': 'hephaera-floor-plan-rights/v1', 'planSha256': sha(source),
                    'status': 'owned', 'rightsHolder': 'Hephaera procedural QA fixture', 'scope': 'floor-plan-to-model', 'evidence': [], 'referenceInputs': []}, indent=2)+'\n')
                budget = task/f'{asset}-budget.json'
                budget.write_text(json.dumps({'schemaVersion': 'hephaera-floor-plan-budget/v1', 'timeoutSeconds': 600,
                    'maxLogBytes': 16777216, 'maxPrivateBytes': 8589934592}, indent=2)+'\n')
                initial = invoke('init', '--task', 'floor-plan-qa', '--asset', asset, '--version', 'v1', '--plan', source.relative_to(host).as_posix(), '--rights', rights.relative_to(host).as_posix(), '--budget', budget.relative_to(host).as_posix())
                manifest = initial['manifest']
                preview = invoke('preview', '--manifest', manifest)
                invoke('validate', '--manifest', manifest)
                status = invoke('status', '--manifest', manifest)
                check(not status['wholeBuildingApproved'], form+'/'+name+': design steps work without Blender or implicit approval')
                saved = rights.read_bytes()
                rights.write_bytes(saved+b'\n')
                rejected = invoke('status', '--manifest', manifest, fail=True)
                check('chang' in rejected.stderr.lower() or 'stale' in rejected.stderr.lower(), form+'/'+name+': changed rights rejected')
                rights.write_bytes(saved)
                item = {'manifest': manifest, 'preview': preview}
                forms[form]['cases'][name] = item
                if args.blender and form == 'clone':
                    review = {'schemaVersion': 'bubo-floor-plan-review/v1', 'kind': 'whole-building-design', 'decision': 'approved',
                        'reviewer': 'synthetic-qa-design-reviewer', 'human': True,
                        'asset': asset, 'version': 'v1', 'planSha256': preview['planSha256'],
                        'designFingerprint': preview['designFingerprint'], 'reviewedArtifacts': preview['drawings'],
                        'reason': 'Synthetic owned engineering fixture assertion, not human building/model acceptance.'}
                    approval = task/f'{asset}-synthetic-design-review.json'
                    approval.write_text(json.dumps(review, indent=2)+'\n')
                    invoke('record', '--manifest', manifest, '--kind', 'whole-building-design', '--reviewer', review['reviewer'], '--evidence', approval.relative_to(host).as_posix())
                    item['doctor'] = invoke('doctor', '--manifest', manifest, '--blender', args.blender)
                    item['build'] = invoke('build', '--manifest', manifest, '--blender', args.blender)
                    item['export'] = invoke('export', '--manifest', manifest, '--blender', args.blender, '--author', 'synthetic-qa-model-author')
                    item['review'] = invoke('review', '--manifest', manifest, '--blender', args.blender)
                    item['status'] = invoke('status', '--manifest', manifest)
                    check(item['status']['export']['currentExportValid'], form+'/'+name+': verified portable export remains current')
                check(sha(style) == style_hash, form+'/'+name+': workflow preserves STYLE')
                check(not (host/'assets').exists(), form+'/'+name+': no game asset promotion')
                save('in-progress')
        save('passed')
        print(json.dumps({'status': 'passed', 'checks': len(checks), 'evidence': str(run/'SUMMARY.json')}), flush=True)
    except BaseException:
        save('failed')
        raise


if __name__ == '__main__':
    main()
