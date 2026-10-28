package kr.chalkak.feature.settings

/*
 * SET + FDBK test coverage map for Android (catalog: docs/testing/catalog/settings-feedback.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   SET  001 (section order only) 002-012, 013 (existing signature repo, passes today), 014-016, 017 (state half),
 *        018 (values + labels via copy), 019-038, 042, 043 (logic half), 045, 046 (logic half),
 *        047 (logic half: effect + analytics), 049 (value only), 050 (logic half), 051 (logic half), 052
 *        - HTTP halves (C) in core/data NotificationSettingsRepositoryTest: 014 015 019-022 034-036
 *        - Holder halves in feature/settings PushSettingsStateHolderTest (015-038) and SettingsStateHolderTest (001-012, 037, 042-052)
 *        - 038 also pins REQ-SET-015 (provisional: no PATCH), REQ-SET-016 and REQ-SET-017
 *   FDBK 001 (screen_view half), 003-015 (013/014 counter half), 016, 017-030, 034, 035
 *        - HTTP halves (C) in core/data FeedbackRepositoryTest: 008 012 015 016 021-027
 *        - Holder halves in feature/settings FeedbackStateHolderTest; 001/035 entry halves in SettingsStateHolderTest
 *        - 002 (U part) is not separately testable: the strings are copy keys
 *
 * Deferred:
 *   :app Compose screen tests (W/S): SET-001 (render), 017 (render), 018 (checked state exposure), 039, 040 (Web only, N/A),
 *                                    041, 044, 048, 053; FDBK-002, 013 (render), 014 (UI does not freeze), 018 (button label render), 033
 *   Maestro E2E (E): SET-043 (login screen reached), 046 (screen outcome), 047 (sheet really opens), 050; FDBK-001 (screen opens), 031, 032
 *   Agent scenarios (A): SET-054, 055, 056; FDBK-036, 037
 *   Owned elsewhere: SET-012/034 "refresh once then resend" itself -> core:network (TokenRefresher, ApiClientAuthTest);
 *                    TC-ONB-009..011 URL/host classification -> feature/onboarding LegalDocuments;
 *                    TC-AUTH-035/043/044 logout/withdraw request order -> feature/auth AccountActions + core/data AuthRepository
 *
 * Not covered, no TC (spec requirements without a catalog id):
 *   REQ-SET-018 is covered by tests named "REQ-SET-018 ..." in PushSettingsStateHolderTest (no catalog TC);
 *   REQ-SET-019 Web ignores device permission (N/A on Android); REQ-SET-021 banned member can read/write push settings
 *   (no special-casing, nothing to assert beyond the happy path); REQ-FDBK-014 "push-tap navigation is held while the
 *   feedback screen is open" (belongs to the push/navigation area, D-11).
 */
internal object CoverageMap
