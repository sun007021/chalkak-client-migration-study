package kr.chalkak.feature.notification

/*
 * NOTI/PUSH test coverage map for Android (catalog: docs/testing/catalog/notification-push.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   NOTI 001-009, 011-042, 044-048, 053 (inbox half), 055
 *        001/004/005/006/011/042/044/045/047 cover the logic half only; the W/E halves are deferred below.
 *        055 (unread-status 401) and PUSH-035 (no unregister API) test already existing code, so they pass before the stubs land.
 *   PUSH 001-004, 007-035, 037-066, 068, 071-073 (002 = the spec/REQ-PUSH-004 variant; 013 = login + signup + boot share one registrar;
 *        060/061/064/065 cover the queue / back-stack decision, the UI half is E)
 *   ONB  047 (first home after signup = same permission flow, named in the PUSH-010 test)
 *   Files: core/data AccessTokenClaimsTest, NotificationRepositoryTest, PushDeviceRepositoryTest;
 *          feature/notification PushPayloadAndRoutingTest (parser, D-11 table, nav modes), PushRegistrationTest,
 *          PermissionAndForegroundTest, TapHandlingTest (read decision, tap queue, resetter),
 *          NotificationInboxTest, NotificationDetailTest.
 *   Covered through existing tests of other tracks (not duplicated, ids named there as HOME-*):
 *          NOTI-049 050 051 052 = TC-HOME-050 051 052 (HomeHeroTest) + TC-HOME-049 (guest bell); unread dot lives in feature/home
 *          (HomeStateHolder.onNotificationInboxClosed / onPushReceived, UnreadLoader). BOOT-035 gate half = BootGateTest;
 *          the real tap queue is here (PushTapQueueTest, TC-BOOT-035).
 *
 * Deferred:
 *   :app Compose screen tests (W/S): NOTI-004 005 011 042 043 044 045 047 (render halves); PUSH-002 (app dialog, see conflicts)
 *   Not written, no JVM logic: NOTI-043 (long reason scroll, render only)
 *   Maestro E2E (E): NOTI-001 (bell opens inbox), 054 (read, back home, dot refreshed); PUSH-061 (draft preserved), 064 065 (real back stack)
 *   Agent scenarios (A): NOTI-056 057; PUSH-074 075 076 077
 *   iOS-only (not Android): PUSH-069 (willPresent options), 077 (APNs token), the iOS userInfo adapter half of PUSH-050
 *   Web-only: PUSH-036 (Web makes no PUT /push-devices/current)
 *   Flutter/RN-only: the plugin-wrapper adapter half of PUSH-050 (Android native covers fromData + intent extras)
 *   Android :app adapters: PUSH-072 icon half (channel creation is covered), 068 real Notification builder,
 *                          FCM onNewToken / onMessageReceived / intent wiring to PushRegistrationCoordinator / ForegroundPushHandler /
 *                          PushTapQueue, POST_NOTIFICATIONS system dialog, SessionRefresher adapter over TokenRefresher
 *
 * Not covered because spec, decisions and catalog disagree (needs a ruling before a test can be written):
 *   NOTI-010  catalog: list 404 -> "noti.gone" + refresh the list; spec failure table has no list-404 row (would loop). Defensive only.
 *   PUSH-002  catalog: app dialog "알림을 허용하시겠어요?" when OS state is already decided; spec REQ-PUSH-004 / 확인 필요 1: no dialog, only the
 *             flag. Tested the spec behavior under TC-PUSH-002 (MarkedOnly).
 *   PUSH-005 006  catalog: PATCH /notification-settings with three booleans and its failure message; spec REQ-PUSH-005: never PATCH.
 *   PUSH-028  catalog + REQ-PUSH-011: REAUTHENTICATION_REQUIRED -> refresh, then re-register; D-17 / TC-NET-018: REAUTH never refreshes, it
 *             clears the session and goes to login. Tested D-17 (decisions win).
 *   PUSH-029  catalog uses the REAUTH fixture for "keeps login"; under D-17 REAUTH logs out. Tested the 400 variant only.
 *   PUSH-070  catalog: suppress the foreground notification while the same post's AI feedback is open; spec 확인 필요 2: show every type.
 *             Spec behavior is implemented in the stub docs and tested (PUSH-073); no suppression test.
 *   PUSH-067  FEED-owned (post detail 404).
 *   NOTI-009  catalog text "로그인이 필요해요." after a surviving 401; spec table: login screen, no message. Tested the spec.
 */
internal object CoverageMap
