package kr.chalkak.feature.home

/*
 * HOME + BANR test coverage map for Android (catalog: docs/testing/catalog/home.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   HOME 001-018, 019 (state part), 020-023, 024-034 (028 leap year included), 035-054 (047 holder part only)
 *   BANR 001-016, 017-023, 025 (holder part: screen_view issue once), 027 (holder part)
 *   Files: core/data HomeRepositoryTest, BannerRepositoryTest;
 *          feature/home HomeHeroTest, HomeSectionsTest, HomeLifecycleTest, HomeBannerListTest, IssueLinkPolicyTest.
 *   Partly: HOME-005/006 "no GET /posts/{id}" is structural (HomeRepository has no such method).
 *           HOME-031 selection priority / HOME-032 "chosen date survives a retry" belong to the Record tab state (REC).
 *           HOME-054 "0 ai-review requests" is structural: the AI card polling lives in the AIR area, home only gates visibility.
 *
 * Deferred:
 *   :app Compose screen tests (W/S): HOME-019 (render), 056, 057, 058; BANR-007 (placeholder render), 029
 *   Maestro E2E (E): HOME-021 (seed shown before detail), 023 (tab opens popular page 1), 031 (record tab selection),
 *                    047 (upload -> home navigation), 048 (back from inbox); BANR-024 (web view reload), 025 (one screen only; the holder side is unit-tested), 026 (back keeps scroll), 027 (web view opens), 028 (offline web view)
 *   Agent scenarios (A): HOME-059, 060; BANR-030
 *   Contract (D): BANR-031 (dev-server schema diff)
 *   Owned elsewhere: HOME-055 (image download dedupe) -> app image loader; HOME-044 cache wipe of other features -> UserDataResetter participants;
 *                    HOME-014 refresh single-flight itself -> core:network (here only the repository-level resend is asserted)
 *   Not covered, no TC: REQ-HOME-033 like toggle (LikeToggler port is declared, wiring and TC land with the LIKE/display PR),
 *                       REQ-HOME-017 inconsistent today bodies, REQ-HOME-044 push-driven scroll-to-top
 */
internal object CoverageMap
