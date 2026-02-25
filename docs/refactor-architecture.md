# Refactor Architecture Notes

## Goals

- Split monolithic `src/index.ts` into focused modules.
- Improve maintainability with clear boundaries (commands, controller, services, utils, state).
- Reduce duplicate logic and centralize shared behavior.
- Patch runtime issue from Heroku logs that caused repeated failing playback attempts.

## New Module Structure

- `src/index.ts`: app bootstrap and dependency wiring.
- `src/commands/router.ts`: command routing for `.help`, `.play-live`, `.skip`, `.tune`, and others.
- `src/controller/stream-controller.ts`: playback orchestration and queue lifecycle.
- `src/services/metadata-service.ts`: ffprobe metadata probing + cache.
- `src/services/youtube-resolver-service.ts`: YouTube resolver API flow (download polling + PoW handling) + cache.
- `src/state/app-state.ts`: mutable runtime state container.
- `src/config/runtime.ts`: env/config resolution and stream profile helpers.
- `src/formatters/queue.ts`: queue/status string formatting.
- `src/utils/*`: shared utilities (`async`, `command`, `media`, `reply`, `logger`).
- `src/types.ts`: shared domain types.
- `src/constants.ts`: command help and stream profile presets.

## Runtime Issue From Heroku Logs

Observed error chain:

- Resolver returned URL that then became `404 Not Found` in ffmpeg input.
- Playback kept failing quickly and repeatedly.
- Repeated retries eventually hit `EMFILE` (`Too many open file descriptors`).

Patch applied:

- Add per-source failure tracking in controller.
- Skip unstable source when failed repeatedly in short window.
- Do not loop-requeue playback when stop reason is `error`.
- Keep queue flow for healthy items and keep user-facing error response.

## Consistency Improvements

- Centralized profile handling in `config/runtime.ts`.
- Centralized metadata formatting and seek utilities in `utils/media.ts`.
- Unified safe reply logic in `utils/reply.ts`.
- Unified log surface in `utils/logger.ts`.
- Kept strict TypeScript compile passing (`npm run build`).

## Context7 Guidance Used

- Discord.js guide pattern for modular command/event separation.
- Node best-practice guidance for explicit async error handling and centralized error surface.
