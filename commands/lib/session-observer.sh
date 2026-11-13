#!/usr/bin/env bash
# Optional passive wrapper. Sourcing this file alone never launches a service.
hephaera_visualizer_exec_node() {
  local node_bin="$1" cli="$2" project="$3" native_bash='' converted=''
  shift 3
  if command -v cygpath >/dev/null 2>&1; then
    converted="$(printf '%s\n' "$BASH" "$cli" "$project" | cygpath -m -f - 2>/dev/null)" || {
        [[ "${HEPHAERA_VISUALIZER_DIAGNOSTICS:-}" != '1' ]] || printf '%s\n' 'Hephaera visualizer: path conversion unavailable; command continues without observation.' >&2
        return 1
      }
    { IFS= read -r native_bash; IFS= read -r cli; IFS= read -r project; } <<< "$converted" || return 1
  fi
  # Load and run in one Node process. If optional metadata setup fails, launch
  # the original command once; never retry after handing it to the runner.
  local program='
const args=process.argv.slice(2), command=args.slice(args.indexOf("--")+1);
let cli,parsed,root;
try {
  if(Number(process.versions.node.split(".")[0])<24)throw Error();
  cli=require(process.argv[1]);parsed=cli.parse(args);
  const store=require(require("node:path").join(require("node:path").dirname(process.argv[1]),"session-events.cjs"));
  root=store.rootPath(parsed.options.root);store.id(parsed.options.session);
} catch(error) { cli=null; }
function plain() {
  const cp=require("child_process"),env=Object.assign({},process.env,{HEPHAERA_VISUALIZER_WRAPPED:"1"});
  let executable=command[0],values=command.slice(1);
  if(process.platform==="win32"&&env.HEPHAERA_VISUALIZER_MSYS==="1") {
    for(const pair of [["MSYS2_ARG_CONV_EXCL","ARG"],["MSYS2_ENV_CONV_EXCL","ENV"]]) {
      if(env["HEPHAERA_VISUALIZER_MSYS_"+pair[1]+"_SET"]==="x")env[pair[0]]=env["HEPHAERA_VISUALIZER_MSYS_"+pair[1]+"_VALUE"];else delete env[pair[0]];
    }
    executable=env.HEPHAERA_VISUALIZER_MSYS_BASH;values=["-c","exec \"$@\"","hephaera-unobserved"].concat(command);
    for(const key of Object.keys(env))if(key==="HEPHAERA_VISUALIZER_MSYS"||key.indexOf("HEPHAERA_VISUALIZER_MSYS_")===0)delete env[key];
  }
  return new Promise(resolve=>{
    const child=cp.spawn(executable,values,{shell:false,stdio:"inherit",windowsHide:true,env:env}),handlers=[];
    for(const signal of ["SIGINT","SIGTERM"]){const handler=()=>child.kill(signal);handlers.push([signal,handler]);process.on(signal,handler);}
    child.once("error",()=>resolve({exitCode:127}));child.once("close",(code,signal)=>{for(const pair of handlers)process.removeListener(pair[0],pair[1]);resolve({exitCode:code===null?143:code,signal:signal});});
  });
}
const action=cli?()=>cli.run(root,parsed.options,parsed.command):plain;
Promise.resolve().then(action).then(result=>{process.exitCode=result.exitCode;if(result.signal&&process.platform!=="win32")process.kill(process.pid,result.signal);},()=>{process.exitCode=127;});
'
  if [[ -n "$native_bash" ]]; then
    # Preserve original shell argv/environment across the native Node boundary.
    # Only our own executable, CLI and root paths use native spellings. The
    # child Bash restores the caller's MSYS policy before launching its command.
    HEPHAERA_VISUALIZER_MSYS=1 HEPHAERA_VISUALIZER_MSYS_BASH="$native_bash" \
    HEPHAERA_VISUALIZER_MSYS_ARG_SET="${MSYS2_ARG_CONV_EXCL+x}" HEPHAERA_VISUALIZER_MSYS_ARG_VALUE="${MSYS2_ARG_CONV_EXCL-}" \
    HEPHAERA_VISUALIZER_MSYS_ENV_SET="${MSYS2_ENV_CONV_EXCL+x}" HEPHAERA_VISUALIZER_MSYS_ENV_VALUE="${MSYS2_ENV_CONV_EXCL-}" \
    MSYS2_ARG_CONV_EXCL='*' MSYS2_ENV_CONV_EXCL='*' \
      exec "$node_bin" -e "$program" "$cli" "$1" --root "$project" "${@:2}"
  fi
  exec "$node_bin" -e "$program" "$cli" "$1" --root "$project" "${@:2}"
}
hephaera_visualizer_entrypoint() {
  local phase="$1" label="$2" entry="$3"
  shift 3
  [[ -n "${HEPHAERA_SESSION_ID:-}" && "${HEPHAERA_VISUALIZER_WRAPPED:-}" != '1' ]] || return 0
  # Help should remain usable even when telemetry prerequisites are broken.
  [[ "${1:-}" != '-h' && "${1:-}" != '--help' ]] || return 0
  if [[ ! "$HEPHAERA_SESSION_ID" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ ]]; then
    [[ "${HEPHAERA_VISUALIZER_DIAGNOSTICS:-}" != '1' ]] || printf '%s\n' 'Hephaera visualizer: invalid session identity; command continues without observation.' >&2
    return 0
  fi
  local observer_dir node_bin project observer_source="${BASH_SOURCE[0]}"
  case "$OSTYPE" in msys*|cygwin*) observer_source="${observer_source//\\//}"; entry="${entry//\\//}" ;; esac
  observer_dir="$(cd -- "${observer_source%/*}" && pwd)" || return 0
  node_bin="$(command -v node 2>/dev/null || command -v node.exe 2>/dev/null || true)"
  [[ -n "$node_bin" ]] || return 0
  local entry_dir="${entry%/*}"
  [[ "$entry_dir" != "$entry" ]] || entry_dir='.'
  entry="$(cd -- "$entry_dir" && pwd)/${entry##*/}" || return 0
  # The supported installation has one exact owner. Node validates that root
  # again; standalone maintainer checkouts retain the canonical resolver.
  case "$observer_dir" in
    */.hephaera/commands/lib) project="${observer_dir%/.hephaera/commands/lib}" ;;
    *)
      if [[ "${HEPHAERA_PROJECT_ROOT:-}" == /* || "${HEPHAERA_PROJECT_ROOT:-}" =~ ^[A-Za-z]:[/\\] ]]; then project="$HEPHAERA_PROJECT_ROOT"
      else project="$(source "$observer_dir/memory-common.sh"; hephaera_resolve_paths; printf '%s' "$HEPHAERA_PROJECT_ROOT_RESOLVED")" || return 0; fi ;;
  esac
  # Only the documented task identifier at known boundaries becomes metadata;
  # arbitrary argv/output remain private. Never infer an ambient current task.
  local task_ref=''
  case "${entry##*/}" in
    create-task-file.sh|create-task-issue.sh|record-task-checkpoint.sh|validate-task-checkpoint.sh|link-pr-to-task-issue.sh|pr-readiness-check.sh) task_ref="${1:-}" ;;
    import-task-from-issue.sh) task_ref="${2:-}" ;;
  esac
  if [[ "$task_ref" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$ ]]; then
    hephaera_visualizer_exec_node "$node_bin" "$observer_dir/session-visualizer.cjs" "$project" run --session "$HEPHAERA_SESSION_ID" --phase "$phase" --label "$label" --task "$task_ref" --operation "$label" -- "$BASH" "$entry" "$@" || return 0
  else
    hephaera_visualizer_exec_node "$node_bin" "$observer_dir/session-visualizer.cjs" "$project" run --session "$HEPHAERA_SESSION_ID" --phase "$phase" --label "$label" -- "$BASH" "$entry" "$@" || return 0
  fi
}
