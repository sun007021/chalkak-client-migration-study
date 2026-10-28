package kr.chalkak.feature.aireview

/*
 * AIR (AI feedback) test coverage map for Android (catalog: docs/testing/catalog/ai-review.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   Contract / mapping (core/data AiReviewRepositoryTest, MockWebServer + shared fixtures):
 *     AIR 001-009, 017 (GET 404 is a plain HTTP failure), 029 (401 refresh+resend / reauth, repository half),
 *     030/031 (POST sent once, no retry), 039 (GET 500 backoff then completed), 047 (503 Retry-After waits 1000 ms virtual)
 *     AIR-004 also covers REQ-AIR-045 (empty feedback item) and AIR-005 NaN / boundary scores via AiReviewMapper.
 *     The "request cancel is not a network error" half of AIR-009 is the ApiClient cancel rule (core:network tests);
 *     the holder half is in AiRequestTest.
 *   Holders (feature/aireview, virtual time, FakeAiReviewRepository):
 *     AiPillStateTest   AIR 004, 011-019, 040, 045 (pill states, past topic, guest / not mine / 404, home vs detail
 *                       revalidation, first-GET failure, KST midnight at tap and confirm)
 *     AiRequestTest     AIR 009, 020, 022-031, 032 (start sheet, POST once, results by body status, 400/401/403/404/409/5xx,
 *                       lost answer + GET sync)
 *     AiPollingTest     AIR 013, 029, 032-036, 038, 039, 041-044, 046 (3 s grid, 300 s window incl. 299.999/300.000,
 *                       hidden / re-show, late answers, A -> B, user change, poll errors)
 *     AiResultSheetTest AIR 010, 049-054 (result content, score format, a11y text, badge, criteria dialog, failure sheet,
 *                       copy terms)
 *     AiPushEntryTest   AIR 058 (auto-open once per entry from the latest GET)
 *   AIR-048 (3 s / 300 s constants) is asserted against shared/constants.json by core:common AppConstantsTest.
 *
 * Deferred:
 *   :app Compose / screenshot tests (W/S): AIR-010 rendering, 012-016 pill rendering halves, 021 (no consent UI),
 *     049-053 rendering halves, 055 (wave / ripple animation only while PROCESSING), 056 (screenshots), 057 (testIDs)
 *   Maestro E2E (E): AIR-059 (inbox AI item = same destination; routing itself is TC-NOTI-028 / TC-PUSH-040 in
 *     feature/notification), 058 end-to-end half, 046 offline recovery on a device
 *   Agent scenarios (A): AIR-060, AIR-061
 *   Held back because the spec is ambiguous or contradictory (see the test-writer report):
 *     AIR-020 second half (home failed re-request without a sheet, issue 2 / REQ-AIR-036) - no home holder in this track
 *     AIR-037 (manual "AI 상태 다시 확인" after the window ended - REQ-AIR-027 keeps the pill on "AI 분석중", issue 3)
 *     AIR-047 holder half ("window clock unchanged" while the repository waits out Retry-After) - needs a boundary
 *       rule for a GET that straddles 300.000 s
 *     AIR-017 wording: catalog says a 404 shows "AI 피드백을 확인할 수 없는 게시물이에요." but REQ-AIR-005/030 and the
 *       failure table say GET 404 hides silently; tests follow the spec (silent on GET, message on POST 404)
 *     POST response time vs send time as the window start (AIR-022 says response, REQ-AIR-026 / D-03 say send):
 *       tests use an immediate answer, so both readings pass
 */
internal object CoverageMap
