# Media pipelines

SFX/ambience, music and voice have independent production domains. They can load alongside any registered visual primary without changing `STYLE.md`. `MEDIA.md` remains the shared provider, permission, provenance, staging, budget and promotion authority. The [media guide](https://github.com/TimothyMeadows/Hephaera/blob/main/docs/MEDIA_PIPELINES.md) and [shared lifecycle](https://github.com/TimothyMeadows/Hephaera/blob/main/.media/pipelines/LIFECYCLE.md) define the complete contracts.

## Domain routing

| Domain | Canonical modalities | Optional host contract | Coordinating skill |
| --- | --- | --- | --- |
| AUDIO | `sfx`, `ambience` | `AUDIO.md` | `build-audio-assets` |
| MUSIC | `instrumental`, `supplied-lyrics` | `MUSIC.md` | `build-music-assets` |
| VOICE | `preset-speech`, `consented-cloning` | `VOICE.md` | `build-voice-assets` |

Mixed requests retain separate named domain contexts and asset versions. Contradictory domain/modality requests fail instead of rerouting silently. Ordinary generation planning does not require invented STYLE or ENGINE contracts; image work still needs visual selection, and runtime handoff needs the actual selected engine.

## Configure only the requested context

```bash
bash .hephaera/commands/generate-media-pipeline-contract.sh AUDIO
bash .hephaera/commands/validate-media-pipeline-contract.sh AUDIO
bash .hephaera/commands/resolve-media-pipeline.sh --modality ambience
bash .hephaera/commands/resolve-media-pipeline.sh --all --visual
```

Use MUSIC or VOICE when those domains are requested. Default generation writes read directives; `--inline` embeds the declaration. `--output FILE` creates a confined alternative contract selected with `--contract FILE`. An exact existing generated contract can be reused; differing bytes are preserved and reported as an error.

Aggregate resolution returns separate visual/audio/music/voice contexts. Inspect `configured`, contract/media identities, `policySha256`, `executionAvailable`, `nativeReadiness` and `unavailableReasons`. Configuration-only resolution leaves native readiness unverified. An absent unrelated optional contract does not block another configured domain or cause startup to create extra files.

## Shared lifecycle commands

Each domain command supports `brief`, `init`, `revise`, `status`, `doctor`, `setup-plan`, `generate`, `import`, `validate`, `review`, `handoff`, `promote` and `recover`. Read the requested command's `--help` and strict domain brief/examples before supplying JSON:

```bash
bash .hephaera/commands/audio-pipeline.sh --help
bash .hephaera/commands/music-pipeline.sh --help
bash .hephaera/commands/voice-pipeline.sh --help
```

For an existing task and an actual reviewed brief, initialization uses:

```bash
bash .hephaera/commands/audio-pipeline.sh init \
  --task town-square --asset arrival --version v1 \
  --brief inputs/arrival-sfx.json \
  --workspace .hephaera/.cache/media-production
```

Retain the returned `stateFile`; do not guess hashed state folders. State belongs below `.hephaera/.cache/tasks/<task>/media/<domain>/`, while outputs remain in versioned non-runtime staging. Initialization grants no synthesis allowance.

After separately authorized LOCAL generation, use the approval's already-bound physical shared media-state root. The AUDIO, MUSIC, VOICE and image cases under that approval reuse that root across domains, revisions, tasks and workspaces. Never allocate a new one to recover allowance. Bubo owns atomic started-attempt accounting, bounded workers and shared GPU exclusion. Loading contexts together does not authorize concurrent GPU inference.

## What each stage establishes

| Stage | Evidence | Remaining boundary |
| --- | --- | --- |
| Brief/init/setup-plan | Current intent, inputs, finite bounds and proposed prerequisites | No installation, model loading or synthesis |
| Generate/import | Actual native execution or real provider provenance and exact staged bytes | No listening acceptance or runtime copy |
| Validate | Supported measured format, duration, channels, size and signal properties | No artistic, speaker or lyric judgment |
| Content review | Complete exact-output listening with reviewer, verdict, reason and source | No target-engine acceptance |
| Runtime review/handoff | Current engine, target, codec/budgets, playback and load/dispose evidence | Handoff remains a guarded plan |
| Promote | Current acceptance plus exact separate authorization and fresh destination | No overwrite, future-revision approval or unrelated disclosure |

Changed sources, outputs or shared policy invalidate affected evidence. Another unchanged domain's review cannot approve the changed asset. `revise` creates a new version with retained parent ancestry; failed attempts remain consumed. Historical imports retain original run/runtime/request identities and create neither fresh synthesis nor a new listening verdict.

## AUDIO details

The [AUDIO declaration](https://github.com/TimothyMeadows/Hephaera/blob/main/.media/pipelines/audio/PIPELINE.md) covers effects and ambience. LOCAL uses the supported native SFX capability. Unsupported durations or controls fail; the workflow does not silently tile, trim, normalize or change provider. CLOUD is an explicitly selected provenance-import path where unattended session generation is unavailable.

Listen to the complete effect or ambience: intended event, unwanted speech/music, artifacts, start and tail. Claimed loops need actual seam review. Imported assets without authoritative technical analysis remain ineligible for handoff. Preserve unmodified originals and disclose clipping/silence instead of hiding it through processing.

## MUSIC details

The [MUSIC declaration](https://github.com/TimothyMeadows/Hephaera/blob/main/.media/pipelines/music/PIPELINE.md) distinguishes instrumental from supplied-lyric tracks. Bind exact supplied UTF-8 lyrics and scoped rights to every requested item. Optional planning stays disabled. Invented lyrics, stems/mastering/editing and unsupported controls are not implicit services.

The documented LOCAL ACE-Step Turbo profile supports whole-second 10–600 tracks, 1–8 steps, guidance 1 and explicit int32 seed, with its pinned CUDA/device/precision settings. Consult current pinned resources before a run rather than treating these bounds as permission to change installation. Native 48 kHz stereo measurements preserve amplitudes and cleanup evidence. Metrics do not establish singing or musical quality: listen to the entire track, intended vocals, every supplied line and any loop seam.

## VOICE details and privacy

The [VOICE declaration](https://github.com/TimothyMeadows/Hephaera/blob/main/.media/pipelines/voice/PIPELINE.md) supports preset speech and consented local-reference cloning. The LOCAL CustomVoice/Base profile uses supported language/preset and bounded autoregressive sampling. Fixed requested seconds, loops, diffusion and editing controls are unsupported. Native 24 kHz mono output retains its declared intrinsic decoder clamp and original bytes.

Review exact spoken text, pronunciation, artifacts and actual preset/reference match across the complete output. Cloning additionally requires local audio, matching transcript, rights, native recording-bound consent and a separate purpose-bound host local-use record covering all references. Changed recording, transcript or consent invalidates affected acceptance.

Local/QA consent does not grant public disclosure or runtime distribution. Promotion needs current public-use/distribution evidence and distinct exact-output/reference-bound cloned-output disclosure. Keep recordings, transcripts, conditioning, private QA speech and identifying hashes local. Public tracking uses nonidentifying summaries. These records do not authorize CLOUD cloning, remote references or uploads.

## Target review, promotion and recovery

Runtime acceptance binds the current engine identity, exact ordered outputs and declared target. Measure aggregate bytes/duration and actual rate/channel/codec support; a listed format does not install an encoder or prove device decoding. Test complete playback, user-gesture unlock where applicable, pause/restart, suspend/resume, routing/spatialization and scene disposal in the actual target. Browser evidence cannot certify a native player.

`handoff` returns a plan. Separately authorized `promote` publishes exact accepted files into a fresh target directory, retaining private ownership, source/target hashes and intent/completion/failure history. `status` distinguishes promotion completion, recovery needs and observed publication. A failure can occur after publication; do not assume failed exit means no runtime write. Explicit `recover` recognizes only exact owned bytes and cannot overwrite or adopt foreign files. Preserve uncertain locks and malformed history for inspection.

Provider unavailability, missing rights/consent, exhausted allowance or missing target evidence stops the affected operation. Keep work staged, retain the history and request a concrete decision; never switch provider or reset state automatically.
