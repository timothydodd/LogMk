# LogMk Optimizations & Features TODO

## P0 - Critical

- [x] **Auto Retention Service** - Add `LogRetentionService` background service that runs nightly, deletes logs older than configured retention period, and cleans up summary tables. Prevents unbounded DB growth.
- [x] **Auto-Create Missing Indexes** - The critical `(Deployment, Pod, TimeStamp)` composite index is skipped at startup. Add safe background migration with `CREATE INDEX IF NOT EXISTS`.
- [x] **Bounded Memory Queue** - Agent batch queue has no size limit. Add max queue size with drop-oldest policy to prevent OOM under sustained load / API downtime.

## P1 - High

- [x] **Persistent File Position Tracking** - File positions reset on agent restart, causing re-processing. Persist positions to local file or API.
- [x] **Circuit Breaker for API Calls** - Agent retries indefinitely when API is down. Add circuit breaker that stops after N failures and resumes after cooldown.
- [x] **Memory Leak Fixes** - `PodSequenceCounters` and `_deploymentSettings` grow forever as pods rotate. Add periodic cleanup of stale entries.
- [x] **Cursor-Based Pagination** - Replace offset-based pagination with keyset pagination using `(TimeStamp, Id)` for consistent performance at scale.

## P2 - Medium

- [x] **Server-Side SignalR Filtering** - Use existing `UserPreferences` to filter broadcasts per-connection (by deployment, pod, level).
- [x] **Configurable Hard-Coded Values** - Move hard-coded values to `appsettings.json`: SignalR broadcast limit (500), dedup window (30s), pod cache TTL (60min), purge batch size (10K).
- [ ] **Log Pattern Deduplication** - Detect repeating log patterns and store count + template instead of N identical entries ("this message repeated 47 times").
- [x] **Health/Metrics Endpoints** - Expose `/health` and `/metrics` for both Agent and API to monitor throughput, queue depth, error rates, cache hit rates.
- [x] **Early Validation in Agent** - Move log validation from send time to parse time in `LogWatcher` to avoid queuing invalid data.
- [x] **Log Summary Transaction Fix** - Hourly summary service does delete-then-insert without a transaction. Wrap in transaction.

## P3 - Low / Long-term

- [ ] **Table Partitioning by Date** - MySQL table partitioning by `LogDate` for faster queries and easy retention (drop old partitions).
- [ ] **Log Enrichment** - Parse JSON log fields into searchable columns (e.g., `request_id`, `user_id`, `duration_ms`).
- [ ] **Tiered Storage** - Hot table (< 7 days, full indexes) + cold table (older, minimal indexes).
- [ ] **Hot Config Reload** - Support hot-reload of pod ignore lists and log level overrides without agent restart.
- [ ] **Log Sampling** - For high-volume pods, configurable sampling rate to reduce storage.
- [ ] **Log Compression/Archival** - Compress older logs into archive table or cold storage.
