package kr.chalkak.feature.display

/*
 * DISP / FEED / LIKE test coverage map for Android (catalog: docs/testing/catalog/display-feed.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   DISP 001-049, 051-056, 058
 *     (050 offline retry is the same path as 005; 056 only its "open with a date" half is JVM)
 *   FEED 001-013, 016-042, 044-048, 057
 *     (043 banned member may delete: the client has no ban knowledge, same path as 036)
 *   ANL (display/feed only): 005 (display), 007, 017, 018, 021, 022 - the other screens come with their tracks
 *   LIKE 001-024, 026-033
 *     (005 home ranking: the shared LikeController is tested here, the home wiring comes with the home track;
 *      026/027/028 retry/backoff are asserted on the repository over virtual time, the controller sees only the
 *      final result)
 *   Files: core/data  PostRepositoryTest (HTTP contract), LikeControllerTest (shared toggle), PostChangesTest;
 *          feature/display  DisplayLoadTest, DisplaySortPagingTest, DisplayDateNavTest, DisplayLikeTest,
 *          FeedDetailTest, FeedEditTest, FeedDeleteTest, FeedLikeTest, PureLogicTest (date picker, header collapse,
 *          photo zoom math).
 *
 * Deferred:
 *   :app Compose screen / screenshot tests (W/S): DISP-057 (masonry layout), 059 (state screenshots), 060 (testIDs);
 *     FEED-014 (sign image load failure), 049 (ratio transition), 053 (title row), 058 (testIDs);
 *     LIKE-025 (cross-screen sync is E; the shared state is covered by LIKE-004), 034 (a11y label + testID)
 *   Maestro E2E (E): DISP-050 (offline recovery), 056 (upload success -> exhibition, record -> exhibition),
 *     FEED-015 (back keeps scroll/date/sort), LIKE-025
 *   Agent scenarios (A): DISP-062, FEED-054, FEED-055, LIKE-035
 *   Contract drift against the dev server (D): DISP-061, FEED-056
 *   iOS-only (not Android): FEED-050 (shared-element transition coordinates), 051 (back-swipe gesture numbers),
 *     052 (rendering while swiping) - recorded as platform differences
 *
 * REQ-DISP-002: a `/topics` answer whose topicDate differs from the requested date is an invalid response
 * (TC-DISP-002 mismatch tests in DisplayLoadTest); screen_view `display` / `feed` is sent when the screen becomes
 * visible, not on repeated onScreenShown calls.
 *
 * Spec points the tests had to interpret (see the test-writer report): date moves use the pending target,
 * a PUT 400 shows `feed.edit.error.state` (TC-FEED-028 only asserts invariants), a stale like rollback re-sends the
 * newest intent (TC-LIKE-022), PostsQuery rejects a seed on non-random sorts / random page 2 without a seed.
 */
internal object CoverageMap
