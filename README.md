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

## Commands

- `.play-live <url>`: start Go Live stream from URL.
- `.play-cam <url>`: start camera stream from URL.
- If stream is active, `.play-live`/`.play-cam` adds item to queue.
- `.skip`: stop current stream and continue next queue item.
- `.stop-stream`: stop stream and clear queue, stay in voice channel.
- `.disconnect`: leave voice channel and clear queue.
- `.queue`: show active stream and queued items.
- `.loop on|off|toggle|show`: loop last finished stream.
- `.tune show`: show active tuning profile.
- `.tune low|medium|high`: switch runtime tuning profile. If stream is active, profile auto-applies by restarting from current offset (not from start).
- `.back [seconds]`: restart active stream from current position minus seconds (default 10).
- `.forw [seconds]`: restart active stream from current position plus seconds (default 10).
- `.help`: show command help.

## Runtime config (env vars)

Use env vars to avoid storing secrets in `src/config.json`:

- `DISCORD_TOKEN`: Discord self token.
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
