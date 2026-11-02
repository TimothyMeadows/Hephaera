#!/usr/bin/env bash
set -euo pipefail
setup_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$setup_directory/setup-local-tool.cjs" "$@"
