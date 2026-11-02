# Make sound, music, and speech deliberately

Hephaera separates sound effects, music, and spoken voice because they need different briefs and reviews. You can use them together, and they do not replace the visual pipeline in `STYLE.md`. A sound-only task does not need an invented art style or game engine just to begin planning.

| Domain | Use it for | Optional host contract |
| --- | --- | --- |
| `AUDIO` | Sound effects and ambience. | `AUDIO.md` |
| `MUSIC` | Instrumental tracks or songs with supplied lyrics. | `MUSIC.md` |
| `VOICE` | Preset speech or consented local-reference voice cloning. | `VOICE.md` |

## Write a brief before generating

Describe the purpose, length, mood, playback situation, format limits, and what would count as a good result. For example:

```text
Plan three short interaction sounds: successful pickup, unavailable action, and confirmed purchase. Keep them distinguishable at low volume. Check supported production options and propose a finite generation/revision budget. Do not generate or import anything yet.
```

For music, say whether it needs a loop, how it should change with gameplay, and whether lyrics are supplied. For voice, provide exact spoken text and pronunciation needs. The agent should preserve supplied lyrics and their rights information rather than casually rewriting them.

Create only the domain contract you need. For an agreed sound-effects workflow, run from the host project root:

```bash
bash .hephaera/commands/generate-media-pipeline-contract.sh AUDIO
bash .hephaera/commands/validate-media-pipeline-contract.sh AUDIO
```

Use `MUSIC` or `VOICE` for those domains. These commands record workflow choices; they do not select CLOUD or LOCAL execution, download models, or generate media.

## Check the production path separately

`MEDIA.md` records shared provider, rights, budget, staging, and review rules. Available execution depends on the actual session and prepared local tools. LOCAL uses the verified Bubo runtime and supported model/tool installations; setup is a separate operation and begins as a plan, not an automatic install.

You can inspect current command help without starting a run:

```bash
bash .hephaera/commands/audio-pipeline.sh --help
bash .hephaera/commands/music-pipeline.sh --help
bash .hephaera/commands/voice-pipeline.sh --help
```

Ask the agent to report missing prerequisites and the proposed allowance before authorizing generation. Starting a new task or revision does not reset an allowance tied to the same approval. Several loaded workflows also do not authorize simultaneous local GPU generation.

## Listen before accepting

Technical validation can check file properties and measurements. It cannot decide whether a sound communicates the right event, a track works musically, or a spoken line sounds natural.

Listen to the entire output. Check any claimed loop seam, all supplied lyrics, every spoken line, pronunciation, artifacts, and the intended preset or reference match. A seamless loop, automatic mastering, or a complete engine player is not guaranteed just because a file was produced.

Keep candidates staged until their current version is reviewed. Test loading, playback, volume behavior, interruption, and cleanup in the selected target before runtime handoff. Explicit promotion of the accepted bytes is separate from generation and listening review.

## Keep voice consent and disclosure distinct

Preset speech and cloning are different profiles. Cloning requires the exact local reference recording, transcript, rights, and purpose-bound consent. The supported cloning path keeps that reference local; do not treat local testing consent as permission to upload or publicly distribute it.

Public use of a cloned output needs its own current disclosure and distribution authorization. Private recordings, transcripts, and generated QA speech stay local. If those permissions or tools are missing, stop that part of the task and report what is needed rather than switching providers.

The [media pipelines wiki](https://github.com/TimothyMeadows/Hephaera/wiki/Media-Pipelines) explains the detailed lifecycle. Read [Bubo runtime](https://github.com/TimothyMeadows/Hephaera/wiki/Bubo-Runtime) for native prerequisites and [delivery and troubleshooting](delivery-and-troubleshooting.md) for the final review boundary.
