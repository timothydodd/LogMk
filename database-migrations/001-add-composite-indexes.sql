-- Migration: Add composite index for better query performance
-- Run this during a maintenance window as it may take time on large tables
--
-- This index significantly improves performance for:
-- - /api/log/counts endpoint (GetDeploymentCounts)
-- - /api/log/times endpoint (GetLatestEntryTimes)
--
-- Estimated time: Depends on table size
--   - 1M rows: ~30 seconds
--   - 10M rows: ~5 minutes
--   - 100M rows: ~30-60 minutes
--
-- Progress monitoring:
--   You can check progress in another session with:
--   SHOW PROCESSLIST;

-- Check if index already exists before creating
SELECT
    CASE
        WHEN COUNT(*) > 0 THEN 'Index already exists, skipping creation'
        ELSE 'Index does not exist, creating...'
    END AS status
FROM information_schema.statistics
WHERE table_schema = DATABASE()
AND table_name = 'Log'
AND index_name = 'Deployment_Pod_TimeStamp_idx';

-- Create the composite index
-- Note: Remove the comment below to execute
-- CREATE INDEX Deployment_Pod_TimeStamp_idx ON `Log` (Deployment, Pod, TimeStamp);

-- Verify index was created
SELECT
    index_name,
    column_name,
    seq_in_index,
    cardinality,
    index_type
FROM information_schema.statistics
WHERE table_schema = DATABASE()
AND table_name = 'Log'
AND index_name = 'Deployment_Pod_TimeStamp_idx'
ORDER BY seq_in_index;
