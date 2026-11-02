#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
configuration="${1:-Release}"
[[ $# -le 1 && ( "$configuration" == Release || "$configuration" == Debug ) ]] || { echo 'Use Release or Debug.' >&2; exit 1; }
exec node "$script_dir/lib/bubo-runtime-setup.cjs" build "$configuration"
