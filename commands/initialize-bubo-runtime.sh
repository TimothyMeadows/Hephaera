#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 0 ]] || { echo 'Usage: initialize-bubo-runtime.sh (recorded commit only; no --remote).' >&2; exit 1; }
exec node "$script_dir/lib/bubo-runtime-setup.cjs" initialize
