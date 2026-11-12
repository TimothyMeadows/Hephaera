#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${HEPHAERA_SESSION_ID:-}" && "${HEPHAERA_VISUALIZER_WRAPPED:-}" != '1' ]]; then
  if source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/session-observer.sh" 2>/dev/null; then
    hephaera_visualizer_entrypoint work "VFX workflow" "${BASH_SOURCE[0]}" "$@"
  fi
fi

command_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Node.js is required for the VFX asset workflow.' >&2; exit 1; }
has_root=false
is_help=false
for argument in "$@"; do
  [[ "$argument" != '--root' ]] || has_root=true
  [[ "$argument" != '--help' && "$argument" != 'help' ]] || is_help=true
done
if [[ "$has_root" == false && "$is_help" == false ]]; then
  source "$command_dir/lib/memory-common.sh"
  hephaera_resolve_paths
  set -- "$@" --root "$HEPHAERA_PROJECT_ROOT_RESOLVED"
fi
exec node "$command_dir/lib/vfx-assets.cjs" "$@"
