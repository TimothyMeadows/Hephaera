#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == '--help' || $# -eq 0 ]]; then
  exec node "$script_dir/lib/session-visualizer.cjs" --help
fi
source "$script_dir/lib/memory-common.sh"
hephaera_resolve_paths
node_bin="$(command -v node 2>/dev/null || command -v node.exe 2>/dev/null || true)"
if [[ "$1" == run ]]; then
  if [[ -n "$node_bin" ]] && source "$script_dir/lib/session-observer.sh" 2>/dev/null; then
    if hephaera_visualizer_exec_node "$node_bin" "$script_dir/lib/session-visualizer.cjs" "$HEPHAERA_PROJECT_ROOT_RESOLVED" "$@"; then exit 0; fi
  fi
  printf '%s\n' 'Hephaera visualizer: recorder unavailable; running the original command without observation.' >&2
  while [[ $# -gt 0 && "$1" != '--' ]]; do shift; done
  [[ $# -gt 1 ]] || { echo 'run requires an executable after --.' >&2; exit 1; }
  shift; exec "$@"
fi
[[ -n "$node_bin" ]] || { echo 'Hephaera visualizer needs existing Node24; nothing was installed.' >&2; exit 1; }
exec "$node_bin" "$script_dir/lib/session-visualizer.cjs" "$1" --root "$HEPHAERA_PROJECT_ROOT_RESOLVED" "${@:2}"
