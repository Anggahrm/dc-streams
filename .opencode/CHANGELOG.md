# OpenCode Session Changelog

## 2026-02-27

- Rolled back local and remote `main` to commit `32b6251` using hard reset + force push.
- Removed global author gate so public users can run public commands.
- Added owner-priority command gating in router (`.skip`, `.stop-stream`, `.disconnect`, `.loop`, `.tune`, `.back`, `.forw`).
- Added owner-priority queue behavior for `.play-live` / `.play-cam` requests.
- Refactored command feedback to Markdown-style English responses across router/controller/queue formatter.
- Added unknown-command feedback for dot-prefixed commands.
- Hardened queue start flow with `startingPlayback` lock to reduce concurrent-start race conditions.
- On failed voice join during start, item is requeued and user gets explicit retry guidance.
- Verified compile success with `npm run build`.

## 2026-02-25

- Refactored monolithic `src/index.ts` into modular architecture (`commands`, `controller`, `services`, `state`, `utils`, `formatters`, `config`, `types`).
- Centralized runtime config/profile logic and shared helpers to improve consistency and reduce duplicate code.
- Added `MetadataService` for ffprobe metadata probing/caching and `YouTubeResolverService` for resolver + PoW flow.
- Added queue/playback controller with clearer orchestration boundaries and safer command routing.
- Patched repeated stale resolver URL failure loop by:
  - detecting likely stale YouTube resolved URLs (404 / invalid input signatures),
  - invalidating resolver cache and retrying once with fresh URL,
  - preventing loop requeue on error,
  - skipping repeatedly failing sources to reduce runaway retries and EMFILE risk.
- Verified build passes with `npm run build`.
