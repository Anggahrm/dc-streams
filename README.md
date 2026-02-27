# basic example

This example shows how to stream a video, both using the existing voice connection or with a Go Live connection, using the new API introduced in v4.1.3

## Architecture (refactored)

- `src/index.ts`: app bootstrap and dependency wiring.
- `src/commands/router.ts`: command parsing + dispatch.
- `src/controller/stream-controller.ts`: queue, playback lifecycle, restart logic.
- `src/services/metadata-service.ts`: ffprobe metadata probing/cache.
- `src/services/youtube-resolver-service.ts`: YouTube URL resolver + cache.
- `src/state/app-state.ts`: runtime mutable state.
- `src/config/runtime.ts`: env/config resolution and stream profiles.
- `src/formatters/queue.ts`: queue status formatter.
- `src/utils/*`: common helpers (reply/logger/media/async/command).
- `src/types.ts`: shared domain types.

Detailed notes: `docs/refactor-architecture.md`.

## YouTube resolver env

- `YTDL_CACHE_TTL_MS` (default `45000`): cache TTL untuk resolved direct file URL YouTube.
  TTL pendek mengurangi risiko URL expired (loading terus).

## Commands

- Public commands: `.help`, `.queue`, `.play-live <url>`, `.play-cam <url>`.
- Owner-priority commands: `.skip`, `.stop-stream`, `.disconnect`, `.loop on|off|toggle|show`, `.tune show|low|medium|high`, `.back [seconds]`, `.forw [seconds]`.
- If stream is active, `.play-live` / `.play-cam` adds item to queue.
- Owner requests are prioritized in queue order.

## Runtime config (env vars)

Use env vars to avoid storing secrets in `src/config.json`:

- `DISCORD_TOKEN`: Discord self token.
- `OWNER_IDS`: comma-separated owner IDs, example `123,456`.
- `ACCEPTED_AUTHORS`: comma-separated user IDs, example `123,456`.
- `YTDL_API_BASE`: YouTube resolver API base (default `https://youtubedl.siputzx.my.id`).
- `YTDL_API_KEY`: optional API key for resolver.
- `YTDL_MEDIA_TYPE`: resolver media type (`merge`, `video`, `audio`) default `merge`.
- `YTDL_POLL_INTERVAL_MS`: resolver polling interval in ms (default `2000`).
- `YTDL_POLL_TIMEOUT_MS`: resolver polling timeout in ms (default `60000`).
- `STREAM_WIDTH`, `STREAM_HEIGHT`, `STREAM_FPS`
- `STREAM_BITRATE_KBPS`, `STREAM_MAX_BITRATE_KBPS`
- `STREAM_HW_ACCEL`: `true|false`
- `STREAM_VIDEO_CODEC`: `H264|H265|VP8|VP9|AV1`

## Heroku notes

- `Procfile` uses worker process: `worker: npm run start`
- `Aptfile` installs system `ffmpeg`
- Deploy can use bundled local package source to keep `customInputOptions` seek behavior.
- YouTube links are resolved via `YTDL_API_BASE/download?url=<youtube-url>&type=video` before streaming.
- If resolver requires PoW, bot auto-runs `/akumaudownload` and `/cekpunyaku` flow to obtain `pow_session`.
- Required config var for apt runtime libs:
  - `LD_LIBRARY_PATH=/app/.apt/usr/lib/x86_64-linux-gnu:/app/.apt/usr/lib/x86_64-linux-gnu/pulseaudio:/app/.apt/usr/lib/x86_64-linux-gnu/blas:/app/.apt/usr/lib/x86_64-linux-gnu/lapack:/app/.apt/lib/x86_64-linux-gnu:/app/.apt/usr/lib`
