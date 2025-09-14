# LogMk UI Enhancement Stories

## 📅 Completed Stories

### ✅ Dropdown Component Enhancements
**Completed:** 2025-01-14
- **Search Filtering** - Added live search to filter dropdown options
- **Select All Option** - Added toggleable select all for multi-select dropdowns
- **Applied to:** Pod selector and Log level selector
- **Details:**
  - Search input with auto-focus when dropdown opens
  - Smart filtering - select all only affects visible items
  - Keyboard accessible
  - Dark theme optimized styling

---

## 📋 Prioritized Backlog

### Priority Levels
- **P0 (Critical)** - Essential for basic usability
- **P1 (High)** - Significant productivity improvements
- **P2 (Medium)** - Nice-to-have enhancements
- **P3 (Low)** - Future considerations

---

### 🔴 P0 - Critical Priority

#### 1. Copy Log Line
**Impact:** Essential for debugging and sharing logs
- Click to copy individual log entries to clipboard
- Add copy button on hover
- Show toast notification on copy
- **Effort:** Small
- **Implementation:** Add copy icon button to each log line

#### 2. Clear All Filters Button
**Impact:** Basic usability - users need quick way to reset
- One-click to reset all filters
- Position prominently in filter controls
- **Effort:** Small
- **Implementation:** Add button to log-filter-controls component

#### 3. Mobile-Responsive Layout
**Impact:** Critical for on-call engineers accessing from phones
- Collapsible filter panel
- Stack filters vertically on mobile
- Touch-friendly controls
- **Effort:** Medium
- **Implementation:** Update grid layout with media queries

---

### 🟠 P1 - High Priority

#### 4. Export Logs (CSV/JSON)
**Impact:** Essential for analysis and reporting
- Export filtered logs in CSV or JSON format
- Include all visible columns
- Respect current filters
- **Effort:** Medium
- **Implementation:** Add export service and download button

#### 5. Keyboard Shortcuts
**Impact:** Power users need efficient navigation
- Ctrl/Cmd+F - Focus search
- Ctrl/Cmd+Shift+C - Clear filters
- E - Show only errors
- W - Show only warnings
- Arrow keys - Navigate logs
- **Effort:** Medium
- **Implementation:** Add keyboard event listeners

#### 6. Timestamp Formatting Options
**Impact:** Different use cases need different time formats
- Toggle between relative (5 min ago) and absolute time
- Persist user preference
- **Effort:** Small
- **Implementation:** Add toggle in settings/toolbar

#### 7. Log Details Modal
**Impact:** Essential for viewing truncated logs
- Click to view full log in modal
- JSON formatting for structured logs
- Copy full log button
- **Effort:** Medium
- **Implementation:** Create modal component

#### 8. Interactive Chart Time Selection
**Impact:** Natural way to filter by time
- Click and drag on chart to select time range
- Visual feedback during selection
- **Effort:** Medium
- **Implementation:** Enhance chart component with selection

---

### 🟡 P2 - Medium Priority

#### 9. Save Filter Presets
**Impact:** Convenience for recurring investigations
- Save current filter combination
- Name and manage presets
- Quick apply from dropdown
- **Effort:** Large
- **Implementation:** Add preset management service

#### 10. Context Menu
**Impact:** Improved interaction patterns
- Right-click on log for options
- Filter by this pod/level
- Copy log
- **Effort:** Medium
- **Implementation:** Add context menu component

#### 11. Syntax Highlighting
**Impact:** Better readability for technical logs
- Highlight JSON structures
- Color code stack traces
- Highlight URLs, IPs
- **Effort:** Medium
- **Implementation:** Enhance highlight pipe

#### 12. Log Grouping
**Impact:** Reduce noise from repeated logs
- Group identical consecutive logs
- Show count badge
- Expand to see all
- **Effort:** Large
- **Implementation:** Add grouping logic to log service

#### 13. Error Count Badge
**Impact:** Quick awareness of issues
- Show error count in navbar/tab
- Real-time updates
- Click to filter
- **Effort:** Small
- **Implementation:** Add badge component

#### 14. Compact/Expanded View Toggle
**Impact:** User preference for information density
- Toggle between dense and readable layouts
- Persist preference
- **Effort:** Small
- **Implementation:** Add view mode toggle

---

### 🟢 P3 - Low Priority

#### 15. Auto-scroll Toggle (Real-time Monitoring)
**Impact:** Useful but not critical - manual scrolling works
- Auto-scroll to bottom for new logs
- Pause button to stop scrolling
- Resume from where paused
- **Effort:** Medium
- **Implementation:** Add scroll control component

#### 16. Pause/Resume Live Updates
**Impact:** Nice for investigation but refresh works
- Temporarily stop incoming logs
- Queue new logs while paused
- Show new log count
- **Effort:** Medium
- **Implementation:** Add pause state to SignalR service

#### 17. Regex Search Support
**Impact:** Power feature for advanced users
- Toggle regex mode
- Validate regex input
- Highlight matches
- **Effort:** Medium
- **Implementation:** Enhance search with regex option

#### 18. Share Filter URL
**Impact:** Team collaboration feature
- Generate URL with filter params
- Copy link button
- Parse filters from URL
- **Effort:** Medium
- **Implementation:** Add URL state management

#### 19. Select Multiple Logs
**Impact:** Batch operations
- Shift+click to select range
- Ctrl+click for individual
- Copy selected logs
- **Effort:** Large
- **Implementation:** Add selection state management

#### 20. Sound Alerts
**Impact:** Attention for critical events
- Optional sound for errors
- Configurable in settings
- Different sounds for severity
- **Effort:** Small
- **Implementation:** Add audio service

#### 21. Desktop Notifications
**Impact:** Background monitoring
- Browser notifications for errors
- Request permission
- Configurable thresholds
- **Effort:** Medium
- **Implementation:** Add notification service

#### 22. Dark/Light Theme Toggle
**Impact:** User preference (dark theme already excellent)
- Add light theme variables
- Theme switcher in navbar
- Persist preference
- **Effort:** Large
- **Implementation:** Create light theme stylesheet

#### 23. Line Numbers
**Impact:** Reference for discussion
- Optional line numbers
- Copy with line numbers
- **Effort:** Small
- **Implementation:** Add to log viewport

#### 24. Exclude Filters
**Impact:** Advanced filtering
- Hide logs matching criteria
- Inverse filters
- **Effort:** Medium
- **Implementation:** Add exclude logic to filters

#### 25. Chart Type Options
**Impact:** Visualization preference
- Switch between bar/line/area
- Persist preference
- **Effort:** Small
- **Implementation:** Add chart type selector

#### 26. Zoom Controls for Chart
**Impact:** Detailed time analysis
- Zoom in/out buttons
- Reset zoom
- **Effort:** Medium
- **Implementation:** Add zoom controls to chart

#### 27. Show/Hide Chart Toggle
**Impact:** Screen space optimization
- Collapse chart to maximize logs
- Persist preference
- **Effort:** Small
- **Implementation:** Add toggle button

#### 28. Export Time Range
**Impact:** Specific period analysis
- Date/time pickers for export
- Validate range
- **Effort:** Medium
- **Implementation:** Add date range picker

#### 29. Pagination Options
**Impact:** Performance tuning
- Configure logs per page
- Show current page info
- **Effort:** Medium
- **Implementation:** Add pagination controls

#### 30. Memory Management Settings
**Impact:** Long-running sessions
- Configure max logs in memory
- Auto-clear old logs
- **Effort:** Medium
- **Implementation:** Add memory management

---

## 📝 Implementation Notes

### General Guidelines
- All features should maintain dark theme consistency
- Follow Angular 17+ patterns (signals, new control flow)
- Ensure keyboard accessibility
- Add loading states where appropriate
- Show user feedback (toasts, highlights)
- Persist user preferences to localStorage

### Testing Checklist
- [ ] Works with empty state (no logs)
- [ ] Handles large datasets (10k+ logs)
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Dark theme consistent
- [ ] Performance acceptable

### Next Steps
1. Pick stories from P0/P1 based on current needs
2. Implement in priority order
3. Update this file as stories are completed
4. Gather user feedback to reprioritize