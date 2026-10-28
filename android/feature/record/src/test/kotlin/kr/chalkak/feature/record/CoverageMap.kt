package kr.chalkak.feature.record

/*
 * REC test coverage map for Android (catalog: docs/testing/catalog/record.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   REC 001-003, 005-013, 015-017, 019-040, 042 (screen_view part), 043 (holder part)
 *     - 014 (REJECTED / unknown status) only asserts what catalog and spec agree on (no crash, REJECTED day never a photo day)
 *     - 018 covered as "multi-year list + arrows cross the year boundary"; the wheel's year-change rule is deferred
 *     - 009 covered as header copy + Sunday-first grid; "today is emphasised" is a screen detail
 *     - 038 covered as render(month) -> save("chalkak-calendar-yyyy-MM.png", bytes) -> one toast; PNG bytes come from a port
 *     - 004 is NOT tested as written (conflicts with REQ-REC-006, see below); empty month navigation is TC-016/037
 *   Files: core/data  RecordRepositoryTest (HTTP contract + REQ-REC-018 validation, sorting, 401 refresh, 400, 500 retries);
 *          feature/record  MonthGridTest, RecordLoadTest, RecordNavigationTest, RecordFailureTest, RecordActionsTest.
 *
 * Deferred:
 *   :app Compose screen / screenshot tests (W/S): REC-009 (today highlight, 7-column rendering), 041 (layout baselines),
 *     042 (testIDs), 011/035/037 rendering halves
 *   Platform adapters (:app, instrumentation): REC-038 PNG signature `89 50 4E 47` + width/height > 0 and the real MediaStore write
 *     (the CalendarImageRenderer / CalendarImageSaver ports are faked here); REC-039's OS permission dialog (AG-REC-001)
 *   Maestro E2E (E): REC-043 tab flow after a real upload, REC-024 / 034 / 029 end-to-end halves, back-stack behaviour of 034
 *   Agent scenarios (A): REC-044 (AG-REC-001), REC-045 (AG-REC-002)
 *   Not tested because the spec is silent or conflicting (see the test-writer report):
 *     REC-004  catalog: a month absent from the server list can be reached through the picker; spec REQ-REC-005/006 and TC-017: it
 *              is a no-op (tested as the latter)
 *     REC-014  catalog: unknown status -> only that day is skipped; spec REQ-REC-018: whole response is a contract violation
 *     REC-018  catalog: year-changing wheel selects the nearest month with records; spec's picker is a flat newest-first month list
 *     REC-031  query range guard (year 1..9999 / month 1..12) is unreachable through availableMonths; only the 400 mapping is tested
 *     403 banned member (REQ-REC-042) needs the D-08 copy decision
 *     Deleted-post memory across an account change: PostChanges is process-wide and reset by the app (D-17), not by this holder
 *     Selecting a day when the revalidated answer no longer contains the selected day (only the delete path, REQ-REC-028, is specified)
 */
internal object CoverageMap
