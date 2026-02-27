# Refactor Architecture Notes

## Goals

- Split monolithic `src/index.ts` into focused modules.
- Improve maintainability with clear boundaries (commands, controller, services, utils, state).
- Reduce duplicate logic and centralize shared behavior.
- Patch runtime issue from Heroku logs that caused repeated failing playback attempts.
- Add anime/donghua streaming via Sanka Vollerei API.

## Module Structure

- `src/index.ts`: app bootstrap and dependency wiring.
- `src/commands/router.ts`: command registry with `ownerOnly` wrapper; routes `.help`, `.play-live`, `.skip`, `.tune`, `.anime`, `.donghua`, and others.
- `src/controller/stream-controller.ts`: playback orchestration and queue lifecycle.
- `src/controller/error-recovery.ts`: `FailedSourceTracker` class + `classifyPlaybackError()` — extracted from controller to eliminate duplicate error-handling blocks.
- `src/services/metadata-service.ts`: ffprobe metadata probing + cache.
- `src/services/youtube-resolver-service.ts`: YouTube resolver API flow (download polling + PoW handling) + cache.
- `src/services/anime-service.ts`: Sanka Vollerei API integration — search, detail, episode, server resolution for both anime (Otakudesu) and donghua (Anichin) sources.
- `src/state/app-state.ts`: mutable runtime state container.
- `src/config/runtime.ts`: env/config resolution and stream profile helpers.
- `src/formatters/queue.ts`: queue/status string formatting.
- `src/formatters/anime.ts`: anime/donghua search result and detail formatting for Discord messages.
- `src/formatters/stream-errors.ts`: data-driven resolver/prepare error formatting — extracted from controller.
- `src/utils/*`: shared utilities (`async`, `command`, `media`, `reply`, `logger`).
- `src/types.ts`: shared domain types including anime/donghua API response types.
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
- Unified log surface in `utils/logger.ts` (timestamps + proper `console.warn`/`console.error`).
- Kept strict TypeScript compile passing (`npm run build`).

## Second Pass — Extraction & Feature Addition

### Controller decomposition

- Extracted `FailedSourceTracker` and `classifyPlaybackError()` into `controller/error-recovery.ts` — replaces inline `Map<string, FailedSource>`, three duplicate if-blocks, `shouldRefreshResolvedUrl`, and `shouldRetryGoogleVideoForbidden`.
- Extracted `formatResolvePrepareError()` into `formatters/stream-errors.ts` — data-driven pattern matching replaces private method with hardcoded string checks.
- Added `getCurrentPlaybackItem()` helper — eliminates repeated `{ sourceUrl, type, requestedByOwner }` destructuring.
- Added `setSwitchStopReason()` helper — eliminates repeated guard pattern for pending restart setup.
- Controller reduced from 521 → 413 lines.

### Command router refactor

- Converted if-chain to command registry pattern (`Map<string, CommandEntry>`).
- Added `ownerOnly()` wrapper for permission gating.
- Added 6 anime/donghua commands: `.anime`, `.anime-detail`, `.anime-play`, `.donghua`, `.donghua-detail`, `.donghua-play`.

### Anime/Donghua integration

- `anime-service.ts` wraps the Sanka Vollerei API with rate-limit awareness (70 req/min, 3 warnings before ban).
- Handles divergent response formats between anime (Otakudesu) and donghua (Anichin) endpoints.
- `anime.ts` formatters produce Discord-friendly summaries with episode counts and genre info.

## Context7 Guidance Used

- Discord.js guide pattern for modular command/event separation.
- Node best-practice guidance for explicit async error handling and centralized error surface.
