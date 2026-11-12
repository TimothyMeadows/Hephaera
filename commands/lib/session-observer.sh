#!/usr/bin/env bash
# Optional passive wrapper. Sourcing this file alone never launches a service.
hephaera_visualizer_exec_node() {
  local node_bin="$1" cli="$2" project="$3" native_bash=''
  shift 3
  if command -v cygpath >/dev/null 2>&1; then
    native_bash="$(cygpath -m "$BASH" 2>/dev/null)" \
      && cli="$(cygpath -m "$cli" 2>/dev/null)" \
      && project="$(cygpath -m "$project" 2>/dev/null)" || {
        printf '%s\n' 'Hephaera visualizer: path conversion unavailable; command continues without observation.' >&2
        return 1
      }
  fi
  "$node_bin" -e 'try { if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1); require(process.argv[1]); } catch { process.exit(1); }' "$cli" >/dev/null 2>&1 || {
    printf '%s\n' 'Hephaera visualizer: Node24 or recorder module unavailable; command continues without observation.' >&2
    return 1
  }
  if [[ -n "$native_bash" ]]; then
    # Preserve original shell argv/environment across the native Node boundary.
    # Only our own executable, CLI and root paths use native spellings. The
    # child Bash restores the caller's MSYS policy before launching its command.
    HEPHAERA_VISUALIZER_MSYS=1 HEPHAERA_VISUALIZER_MSYS_BASH="$native_bash" \
    HEPHAERA_VISUALIZER_MSYS_ARG_SET="${MSYS2_ARG_CONV_EXCL+x}" HEPHAERA_VISUALIZER_MSYS_ARG_VALUE="${MSYS2_ARG_CONV_EXCL-}" \
    HEPHAERA_VISUALIZER_MSYS_ENV_SET="${MSYS2_ENV_CONV_EXCL+x}" HEPHAERA_VISUALIZER_MSYS_ENV_VALUE="${MSYS2_ENV_CONV_EXCL-}" \
    MSYS2_ARG_CONV_EXCL='*' MSYS2_ENV_CONV_EXCL='*' \
      exec "$node_bin" "$cli" "$1" --root "$project" "${@:2}"
  fi
  exec "$node_bin" "$cli" "$1" --root "$project" "${@:2}"
}
hephaera_visualizer_entrypoint() {
  local phase="$1" label="$2" entry="$3"
  shift 3
  [[ -n "${HEPHAERA_SESSION_ID:-}" && "${HEPHAERA_VISUALIZER_WRAPPED:-}" != '1' ]] || return 0
  # Help should remain usable even when telemetry prerequisites are broken.
  [[ "${1:-}" != '-h' && "${1:-}" != '--help' ]] || return 0
  if [[ ! "$HEPHAERA_SESSION_ID" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ ]]; then
    printf '%s\n' 'Hephaera visualizer: invalid session identity; command continues without observation.' >&2
    return 0
  fi
  local observer_dir node_bin project
  observer_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || return 0
  node_bin="$(command -v node 2>/dev/null || command -v node.exe 2>/dev/null || true)"
  [[ -n "$node_bin" ]] || { printf '%s\n' 'Hephaera visualizer: Node unavailable; command continues without observation.' >&2; return 0; }
  entry="$(cd -- "$(dirname -- "$entry")" && pwd)/$(basename -- "$entry")" || return 0
  # Resolve in a subshell to avoid changing the caller's variables or traps.
  project="$(source "$observer_dir/memory-common.sh"; hephaera_resolve_paths; printf '%s' "$HEPHAERA_PROJECT_ROOT_RESOLVED")" || return 0
  # Only the documented task identifier at known boundaries becomes metadata;
  # arbitrary argv/output remain private. Never infer an ambient current task.
  local task_ref=''
  case "$(basename -- "$entry")" in
    create-task-file.sh|create-task-issue.sh|record-task-checkpoint.sh|validate-task-checkpoint.sh|link-pr-to-task-issue.sh|pr-readiness-check.sh) task_ref="${1:-}" ;;
    import-task-from-issue.sh) task_ref="${2:-}" ;;
  esac
  if [[ "$task_ref" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$ ]]; then
    hephaera_visualizer_exec_node "$node_bin" "$observer_dir/session-visualizer.cjs" "$project" run --session "$HEPHAERA_SESSION_ID" --phase "$phase" --label "$label" --task "$task_ref" --operation "$label" -- "$BASH" "$entry" "$@" || return 0
  else
    hephaera_visualizer_exec_node "$node_bin" "$observer_dir/session-visualizer.cjs" "$project" run --session "$HEPHAERA_SESSION_ID" --phase "$phase" --label "$label" -- "$BASH" "$entry" "$@" || return 0
  fi
}
