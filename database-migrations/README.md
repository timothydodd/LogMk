# Database Migrations

This directory contains SQL migration scripts for the LogMk database.

## Migration 001: Add Composite Indexes

**File:** `001-add-composite-indexes.sql`

### Problem
The `/api/log/counts` and `/api/log/times` endpoints perform `GROUP BY Deployment, Pod` queries on the entire Log table. Without proper indexing, these queries can timeout on large datasets (>1M rows).

### Solution
Create a composite index on `(Deployment, Pod, TimeStamp)` columns.

### When to Run
- If you see timeout errors in the LogMkAgent logs when calling `/api/log/counts` or `/api/log/times`
- If the API logs show: `PERFORMANCE WARNING: Missing composite index 'Deployment_Pod_TimeStamp_idx'`
- During a scheduled maintenance window (recommended for production)

### How to Run

1. **Connect to your MySQL database:**
   ```bash
   mysql -h <host> -u <user> -p <database>
   ```

2. **Check if index exists:**
   ```sql
   SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = DATABASE()
   AND table_name = 'Log'
   AND index_name = 'Deployment_Pod_TimeStamp_idx';
   ```
   If the count is 0, the index doesn't exist and should be created.

3. **Create the index:**
   ```sql
   CREATE INDEX Deployment_Pod_TimeStamp_idx ON `Log` (Deployment, Pod, TimeStamp);
   ```

4. **Monitor progress (in another MySQL session):**
   ```sql
   SHOW PROCESSLIST;
   ```

### Expected Time
- **1M rows:** ~30 seconds
- **10M rows:** ~5 minutes
- **100M rows:** ~30-60 minutes

### Impact
- **During creation:** High CPU and I/O usage, queries to the Log table may be slower
- **After creation:** 10-100x faster queries for counts and times endpoints
- **Disk space:** Approximately 10-20% of the Log table size

### Rollback
If you need to remove the index:
```sql
DROP INDEX Deployment_Pod_TimeStamp_idx ON `Log`;
```

### Alternative: Online Index Creation (MySQL 5.6+)
For minimal downtime on large tables:
```sql
CREATE INDEX Deployment_Pod_TimeStamp_idx ON `Log` (Deployment, Pod, TimeStamp) ALGORITHM=INPLACE, LOCK=NONE;
```

This allows concurrent reads/writes during index creation but may take longer.

## Future Migrations

Add new migration files with incremental numbering:
- `002-description.sql`
- `003-description.sql`
- etc.
