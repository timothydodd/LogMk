# Log Purge Queue System - Implementation Stories

## Overview
Implement a background work queue system to handle large-scale log purge operations asynchronously, preventing timeouts and providing visibility into ongoing operations.

## User Stories

### 1. Database Schema for Work Queue
- [x] Create `WorkQueue` table with columns:
  - `Id` (int, primary key)
  - `Type` (string) - e.g., "LOG_PURGE"
  - `Status` (string) - "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"
  - `PodName` (string)
  - `CreatedAt` (datetime)
  - `StartedAt` (datetime, nullable)
  - `CompletedAt` (datetime, nullable)
  - `ErrorMessage` (string, nullable)
  - `RecordsAffected` (int, nullable)
  - `EstimatedRecords` (int, nullable)
  - `Progress` (int) - percentage 0-100
- [x] Add migration script for new table
- [x] Create indexes on Status and PodName

### 2. Work Queue Models and DTOs
- [x] Create `WorkQueueItem` model in LogMkCommon
- [x] Create DTOs for API communication:
  - `CreateWorkQueueItemRequest`
  - `WorkQueueItemResponse`
  - `WorkQueueStatusResponse`
- [x] Add repository/service methods for queue operations

### 3. Background Service for Queue Processing
- [x] Create `WorkQueueProcessorService` as hosted service
- [x] Implement queue polling mechanism (check every 30 seconds)
- [x] Process items with Status = "PENDING" in FIFO order
- [x] Update progress during large operations
- [x] Handle errors gracefully with retry logic
- [x] Set very long timeout (e.g., 1 hour) for database operations

### 4. API Endpoints for Queue Management
- [x] `POST /api/workqueue/purge` - Add purge job to queue
- [x] `GET /api/workqueue` - List all queue items
- [x] `GET /api/workqueue/active` - Get currently processing items
- [x] `GET /api/workqueue/pod/{podName}` - Check if pod has pending operations
- [x] `DELETE /api/workqueue/{id}` - Cancel pending job (if not started)

### 5. SignalR Real-time Updates
- [x] Add SignalR hub methods for queue updates:
  - `QueueItemAdded`
  - `QueueItemStarted`
  - `QueueItemProgress`
  - `QueueItemCompleted`
  - `QueueItemFailed`
- [x] Broadcast updates from background service

### 6. Frontend Queue View Component
- [x] Create `WorkQueueComponent` to display queue status
- [x] Show list of pending/active/completed jobs
- [x] Display progress bars for active jobs
- [x] Show elapsed time and estimated completion
- [x] Add refresh button and auto-refresh via SignalR
- [x] Implement cancel button for pending jobs

### 7. Update Purge Screen Integration
- [x] Modify existing purge screen to check queue before showing pods
- [x] Disable purge button if pod has pending/active queue items
- [x] Show status badge if pod is being processed
- [x] Add "View in Queue" link for pods with active jobs
- [x] Change purge action to create queue item instead of direct delete

### 8. Queue Status Service (Frontend)
- [x] Create `WorkQueueService` for Angular
- [x] Implement methods to:
  - Check if pod has pending operations
  - Get queue status
  - Subscribe to SignalR updates
  - Cancel pending jobs
- [x] Cache queue status to reduce API calls

### 9. Error Handling and Notifications
- [ ] Add toast notifications for queue operations
- [ ] Show error details when jobs fail
- [ ] Implement retry mechanism for failed jobs
- [ ] Add logging for all queue operations

### 10. Performance Optimizations
- [x] Batch delete operations in chunks (e.g., 10,000 records at a time)
- [x] Add database query hints for large deletes
- [x] Implement progress calculation based on total records
- [ ] Add option to schedule jobs during off-peak hours

### 11. Testing
- [ ] Unit tests for queue processor service
- [ ] Integration tests for API endpoints
- [ ] Frontend component tests
- [ ] End-to-end test for complete purge workflow
- [ ] Performance test with millions of records

## Technical Considerations

### Database Performance
- Use `DELETE` with `LIMIT` clauses for batch operations
- Consider using `DELETE` with `JOIN` for better performance
- Add appropriate indexes to support efficient deletes

### Scalability
- Design queue to handle multiple types of work (not just purges)
- Consider using distributed locking if multiple API instances
- Implement queue priority levels for future use

### UI/UX
- Show clear feedback when operations are queued
- Provide estimated completion times based on record count
- Allow users to see historical completed jobs
- Consider adding email notifications for long-running jobs

## Implementation Order
1. Database schema and models (Stories 1-2)
2. Background service (Story 3)
3. API endpoints (Story 4)
4. Basic frontend integration (Story 7)
5. Queue view component (Story 6)
6. SignalR updates (Story 5)
7. Frontend service and full integration (Story 8)
8. Error handling and notifications (Story 9)
9. Performance optimizations (Story 10)
10. Testing (Story 11)

## Notes
- All database operations in the background service should use a separate, long-timeout connection
- Consider adding a maximum queue size to prevent abuse
- Queue items older than X days should be automatically cleaned up
- Add metrics/monitoring for queue health