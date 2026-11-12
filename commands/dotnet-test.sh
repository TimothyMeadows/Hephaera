#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${HEPHAERA_SESSION_ID:-}" && "${HEPHAERA_VISUALIZER_WRAPPED:-}" != '1' ]]; then
  if source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib/session-observer.sh" 2>/dev/null; then
    hephaera_visualizer_entrypoint verification "Dotnet tests" "${BASH_SOURCE[0]}" "$@"
  fi
fi
cd ..
if [[ $# -eq 0 ]]; then
  dotnet test
else
  dotnet test "$@"
fi
