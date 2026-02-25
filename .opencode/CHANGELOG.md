# OpenCode Session Changelog

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
