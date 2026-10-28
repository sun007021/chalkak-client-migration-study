package kr.chalkak.feature.navigation

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val ALL_ROUTES: List<Route> = listOf(
    Route.Login, Route.Terms, Route.OnboardingSignature, Route.OnboardingSignaturePreview,
    HOME, DISPLAY, RECORD, SETTINGS,
    Route.Feed(POST_A, FeedSource.Display), Route.Feed(POST_A, FeedSource.ById),
    Route.Notifications, Route.NotificationDetail(NOTI_A), Route.BannerWeb,
    Route.PhotoUpload, Route.PhotoUploadSuccess(LocalDate.of(2026, 10, 27)), Route.Feedback,
    Route.ChangeSignature, Route.ChangeSignaturePreview,
    Route.TermsDocument(TermsDocumentKind.TermsOfService), Route.TermsDocument(TermsDocumentKind.PrivacyPolicy),
)

class GuestPolicyTest {
    @Test
    fun `TC-NAV-016 a guest on the record tab is blocked with nav-guest-record`() {
        assertEquals("nav.guest.record", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.RecordTab))
        assertEquals("기록을 보려면 로그인이 필요해요", Copy["nav.guest.record"])
    }

    @Test
    fun `TC-NAV-017 a guest on the upload button is blocked with nav-guest-upload`() {
        assertEquals("nav.guest.upload", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.UploadButton))
    }

    @Test
    fun `TC-NAV-018 a guest opening a feed detail is blocked with nav-guest-feed`() {
        assertEquals("nav.guest.feed", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.FeedDetail))
    }

    @Test
    fun `TC-NAV-019 a guest liking is blocked with nav-guest-like`() {
        assertEquals("nav.guest.like", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.Like))
    }

    @Test
    fun `TC-NAV-020 a guest on the bell is blocked with nav-guest-notification`() {
        assertEquals("nav.guest.notification", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.NotificationEntry))
    }

    @Test
    fun `TC-NAV-022 a guest on the feedback entry is blocked with nav-guest-feedback`() {
        assertEquals("nav.guest.feedback", GuestPolicy.blockingToast(AccessMode.Guest, GuestAction.FeedbackEntry))
    }

    @Test
    fun `TC-NAV-023 the six guest toasts resolve to the exact ko-json copy`() {
        val expected = mapOf(
            GuestAction.RecordTab to "기록을 보려면 로그인이 필요해요",
            GuestAction.UploadButton to "게시물을 추가하려면 로그인이 필요해요",
            GuestAction.FeedDetail to "게시물 피드를 보려면 로그인이 필요해요",
            GuestAction.Like to "좋아요를 누르려면 로그인이 필요해요",
            GuestAction.NotificationEntry to "로그인 후 알림을 확인할 수 있어요",
            GuestAction.FeedbackEntry to "피드백을 보내려면 로그인이 필요해요",
        )
        assertEquals(GuestAction.entries.toSet(), expected.keys)
        expected.forEach { (action, text) ->
            val key = requireNotNull(GuestPolicy.blockingToast(AccessMode.Guest, action)) { "$action must be blocked" }
            assertEquals(text, Copy[key])
        }
    }

    @Test
    fun `TC-NAV-024 a member (including a suspended one) is never blocked on any action`() {
        GuestAction.entries.forEach { assertNull(GuestPolicy.blockingToast(AccessMode.Member, it), "$it") }
    }
}

class RouteRulesTest {
    @Test
    fun `TC-NAV-012 the bottom bar shows on the four tab roots only`() {
        val withBar = ALL_ROUTES.filter { RouteRules.showsBottomBar(it) }
        assertEquals(listOf<Route>(HOME, DISPLAY, RECORD, SETTINGS), withBar)
        assertFalse(RouteRules.showsBottomBar(Route.Feed(POST_A, FeedSource.Display)))
        assertFalse(RouteRules.showsBottomBar(Route.Login))
    }

    @Test
    fun `TC-ANL-002 every route maps to one of the 19 allowed screen names and every name is used`() {
        val names = ALL_ROUTES.map { RouteRules.screenName(it) }
        assertTrue(AppConstants.ANALYTICS_SCREEN_NAMES.containsAll(names), names.toString())
        assertEquals(AppConstants.ANALYTICS_SCREEN_NAMES.toSet(), names.toSet())
    }

    @Test
    fun `TC-ANL-005 the tab roots map to home display record settings`() {
        assertEquals(
            listOf("home", "display", "record", "settings"),
            listOf(HOME, DISPLAY, RECORD, SETTINGS).map { RouteRules.screenName(it) },
        )
        Tab.entries.forEach { assertEquals(it.analyticsName, RouteRules.screenName(Route.TabRoot(it))) }
    }

    @Test
    fun `TC-ANL-006 notifications, notification detail and the banner web map to their names`() {
        assertEquals("notifications", RouteRules.screenName(Route.Notifications))
        assertEquals("notification_detail", RouteRules.screenName(Route.NotificationDetail(NOTI_A)))
        assertEquals("issue", RouteRules.screenName(Route.BannerWeb))
    }

    @Test
    fun `TC-ANL-007 the feed is feed whatever the entry`() {
        assertEquals("feed", RouteRules.screenName(Route.Feed(POST_A, FeedSource.Display)))
        assertEquals("feed", RouteRules.screenName(Route.Feed(POST_A, FeedSource.ById)))
    }

    @Test
    fun `TC-ANL-008 and TC-ANL-009 upload, success and feedback names`() {
        assertEquals("photo_upload", RouteRules.screenName(Route.PhotoUpload))
        assertEquals("photo_upload_success", RouteRules.screenName(Route.PhotoUploadSuccess(LocalDate.of(2026, 10, 27))))
        assertEquals("feedback", RouteRules.screenName(Route.Feedback))
    }

    @Test
    fun `TC-ANL-003 and TC-ANL-004 sign-up and change-signature screens map to their names`() {
        assertEquals(
            listOf("login", "terms", "onboarding_signature", "onboarding_signature_preview"),
            listOf(Route.Login, Route.Terms, Route.OnboardingSignature, Route.OnboardingSignaturePreview).map { RouteRules.screenName(it) },
        )
        assertEquals("change_signature", RouteRules.screenName(Route.ChangeSignature))
        assertEquals("change_signature_preview", RouteRules.screenName(Route.ChangeSignaturePreview))
    }

    @Test
    fun `TC-ANL-010 the sign-up terms screen is terms and the documents are told apart`() {
        assertEquals("terms", RouteRules.screenName(Route.Terms))
        assertEquals("terms_of_service", RouteRules.screenName(Route.TermsDocument(TermsDocumentKind.TermsOfService)))
        assertEquals("privacy_policy", RouteRules.screenName(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy)))
    }

    @Test
    fun `TC-ANL-011 only the terms documents are overlays`() {
        assertEquals(
            listOf<Route>(
                Route.TermsDocument(TermsDocumentKind.TermsOfService),
                Route.TermsDocument(TermsDocumentKind.PrivacyPolicy),
            ),
            ALL_ROUTES.filter { RouteRules.isOverlay(it) },
        )
    }

    @Test
    fun `TC-NAV-032 sameDestination compares identity not source or date`() {
        assertTrue(RouteRules.sameDestination(Route.Feed(POST_A, FeedSource.Display), Route.Feed(POST_A, FeedSource.ById)))
        assertFalse(RouteRules.sameDestination(Route.Feed(POST_A, FeedSource.Display), Route.Feed(POST_B, FeedSource.Display)))
        assertTrue(RouteRules.sameDestination(Route.Notifications, Route.Notifications))
        assertFalse(RouteRules.sameDestination(Route.Notifications, Route.Feedback))
        assertTrue(RouteRules.sameDestination(DISPLAY, DISPLAY))
        assertFalse(RouteRules.sameDestination(DISPLAY, RECORD))
        assertTrue(
            RouteRules.sameDestination(
                Route.PhotoUploadSuccess(LocalDate.of(2026, 10, 26)),
                Route.PhotoUploadSuccess(LocalDate.of(2026, 10, 27)),
            ),
        )
        assertFalse(
            RouteRules.sameDestination(
                Route.TermsDocument(TermsDocumentKind.TermsOfService),
                Route.TermsDocument(TermsDocumentKind.PrivacyPolicy),
            ),
        )
        assertFalse(RouteRules.sameDestination(Route.NotificationDetail(NOTI_A), Route.NotificationDetail(POST_A)))
    }

    @Test
    fun `TC-NAV-001 tabs are ordered home display record settings with their label copy keys`() {
        assertEquals(listOf(Tab.Home, Tab.Display, Tab.Record, Tab.Settings), Tab.entries)
        assertEquals(listOf("홈", "전시", "기록", "설정"), Tab.entries.map { Copy[it.labelCopyKey] })
    }
}
