# basic example

This example shows how to stream a video, both using the existing voice connection or with a Go Live connection, using the new API introduced in v4.1.3

## Commands

- `.play-live <url>`: start Go Live stream from URL.
- `.play-cam <url>`: start camera stream from URL.
- `.stop-stream`: stop current stream.
- `.disconnect`: leave voice channel.
- `.tune show`: show active tuning profile.
- `.tune low|medium|high`: switch runtime tuning profile. If stream is active, profile auto-applies by restarting from current offset (not from start).
- `.back [seconds]`: restart active stream from current position minus seconds (default 10).
- `.forw [seconds]`: restart active stream from current position plus seconds (default 10).
- `.help`: show command help.

## Runtime config (env vars)

Use env vars to avoid storing secrets in `src/config.json`:

- `DISCORD_TOKEN`: Discord self token.
- `ACCEPTED_AUTHORS`: comma-separated user IDs, example `123,456`.
- `STREAM_WIDTH`, `STREAM_HEIGHT`, `STREAM_FPS`
- `STREAM_BITRATE_KBPS`, `STREAM_MAX_BITRATE_KBPS`
- `STREAM_HW_ACCEL`: `true|false`
- `STREAM_VIDEO_CODEC`: `H264|H265|VP8|VP9|AV1`

## Heroku notes

- `Procfile` uses worker process: `worker: npm run start`
- `Aptfile` installs system `ffmpeg`
- Deploy can use bundled local package source to keep `customInputOptions` seek behavior.
- Required config var for apt runtime libs:
  - `LD_LIBRARY_PATH=/app/.apt/usr/lib/x86_64-linux-gnu:/app/.apt/usr/lib/x86_64-linux-gnu/pulseaudio:/app/.apt/usr/lib/x86_64-linux-gnu/blas:/app/.apt/usr/lib/x86_64-linux-gnu/lapack:/app/.apt/lib/x86_64-linux-gnu:/app/.apt/usr/lib`
