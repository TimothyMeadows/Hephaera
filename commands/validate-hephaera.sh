#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${HEPHAERA_SESSION_ID:-}" && "${HEPHAERA_VISUALIZER_WRAPPED:-}" != '1' ]]; then
  hephaera_observer="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/session-observer.sh"
  if [[ -r "$hephaera_observer" ]] && source "$hephaera_observer" 2>/dev/null; then
    hephaera_visualizer_entrypoint verification "Hephaera validation" "${BASH_SOURCE[0]}" "$@"
  fi
fi

exclude_gauntlet=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --exclude-gauntlet) exclude_gauntlet=1; shift ;;
    -h|--help)
      echo 'Usage: ./commands/validate-hephaera.sh [--exclude-gauntlet]'
      echo 'Runs all integrated checks by default; --exclude-gauntlet omits only the monolithic Gauntlet regression.'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

node --test ./tests/test-session-visualizer.cjs
bash ./tests/test-hephaera-layout.sh
bash ./tests/test-state-transition.sh
node ./tests/test-state-transition.cjs
bash ./tests/test-cache-workflows.sh
bash ./tests/test-runtime-cache-layout.sh
node ./tests/test-bubo-installation.cjs
node ./tests/test-bubo-host-context.cjs
node ./tests/test-action-vfx-host-admission.cjs
node ./tests/test-schematic-selection.cjs
node ./tests/test-schematic-host.cjs
node ./tests/test-mechanical-host-context.cjs
node ./tests/test-bubo-media-context.cjs
node ./tests/test-media-pipeline-contract.cjs
node ./tests/test-media-pipeline-state.cjs
node ./tests/test-audio-pipeline-spec.cjs
node ./tests/test-audio-pipeline-cli.cjs
node ./tests/test-music-pipeline-spec.cjs
node ./tests/test-music-pipeline-cli.cjs
node ./tests/test-voice-pipeline-spec.cjs
node ./tests/test-voice-pipeline-cli.cjs
node ./tests/test-media-pipeline-generation-guards.cjs
node ./tests/test-media-pipeline-integration.cjs
node ./tests/test-media-pipeline-promotion.cjs
bash ./tests/test-generative-media.sh
node ./tests/test-bubo-installation.cjs --real-runtime
bash ./commands/test-bubo-runtime.sh host
bash ./commands/test-bubo-runtime.sh media
bash ./commands/validate-engines.sh
bash ./tests/test-engine-selection.sh
node ./tests/test-maui-engine-selection.cjs
node ./tests/test-threejs-quarks-selection.cjs
node ./tests/test-threejs-particles.cjs
node ./tests/test-threejs-quarks-runtime.mjs
node ./tests/test-vfx-threejs-runtime.mjs
node ./tests/test-action-vfx-package.mjs
node ./tests/test-action-vfx-runtime.mjs
node ./tests/test-action-vfx-decoded-model.mjs
node ./tests/test-threejs-postprocessing-selection.cjs
node ./tests/test-threejs-postprocessing.cjs
node ./tests/test-threejs-postprocessing-runtime.mjs
node ./tests/test-web-game-packaging.cjs
node ./tests/test-web-game-package-transactions.cjs
node --test ./tests/test-web3-policy.cjs ./tests/test-web3-contracts.mjs ./tests/test-web3-wallets.mjs ./tests/test-web3-ownership.mjs ./tests/test-web3-trading.mjs ./tests/test-web3-integration.mjs
bash ./tests/test-unreal-capabilities.sh
bash ./tests/test-unity-capabilities.sh
bash ./tests/test-unity-service-contracts.sh
bash ./tests/test-native-engine-fixtures.sh
bash ./tests/test-gameplay-profiles.sh
bash ./commands/validate-roles.sh
bash ./commands/validate-skills.sh
bash ./commands/validate-commands.sh
bash ./commands/validate-styles.sh
bash ./commands/validate-role-skill-map.sh
bash ./commands/validate-role-language-alignment.sh
bash ./commands/validate-cloud-preferences.sh
bash ./commands/validate-art-pipelines.sh
bash ./commands/validate-media-templates.sh
bash ./commands/validate-readme.sh
bash ./tests/test-memory-system.sh
bash ./tests/test-windows-bash-bootstrap.sh
bash ./tests/test-brainstorm-flow.sh
bash ./tests/test-task-execution.sh
bash ./tests/test-selected-capability-import.sh
bash ./tests/test-game-template-catalog.sh
bash ./tests/test-art-pipelines.sh
bash ./tests/test-proof-to-model.sh
python_bin=''
for candidate in python python3 python.exe; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; assert sys.version_info >= (3, 10)' >/dev/null 2>&1; then
    python_bin="$candidate"
    break
  fi
done
[[ -n "$python_bin" ]] || { echo 'Python 3.10+ is required for native proof-to-model integration checks.' >&2; exit 1; }
if [[ "$(uname -s)" == Linux ]]; then "$python_bin" tests/test-bubo-cancellation.py; fi
"$python_bin" tests/test-proof-model-blender.py
"$python_bin" tests/test-proof-model-native-integration.py
bash ./tests/test-model-to-animation.sh
"$python_bin" tests/test-model-animation-blender.py
"$python_bin" tests/test-model-animation-native-integration.py
bash ./tests/test-model-to-action.sh
"$python_bin" tests/test-model-action-blender.py
"$python_bin" tests/test-model-action-native-integration.py
bash ./tests/test-code-character-contract.sh
bash ./tests/test-code-character-skills.sh
bash ./tests/test-code-character-evidence.sh
bash ./tests/test-code-character-integration.sh
bash ./tests/test-blender-art-capabilities.sh
bash ./tests/test-external-asset-library.sh
if [[ $exclude_gauntlet -eq 0 ]]; then
  bash ./tests/test-gauntlet-flow.sh
else
  echo 'Excluded tests/test-gauntlet-flow.sh (--exclude-gauntlet).'
fi

echo "Hephaera validation passed."
