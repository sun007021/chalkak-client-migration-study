package kr.chalkak.feature.navigation

import kotlin.test.Test
import kotlin.test.assertEquals

/** `replaceTop` and `popTo` report exactly one `screen_view` (D-22, TC-ANL-017 without the extra view of the revealed screen). */
class ReplaceAndPopToTest {
    @Test
    fun `TC-ANL-017 REQ-NAV-025 replaceTop swaps the top and sends only the new screen_view`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics, listOf(HOME, DISPLAY))
        nav.open(Route.NotificationDetail(NOTI_A))
        analytics.clear()

        val outcome = nav.replaceTop(Route.Notifications)

        assertEquals(NavOutcome.Replaced(Route.Notifications), outcome)
        assertEquals(listOf(HOME, DISPLAY, Route.Notifications), nav.stack)
        assertEquals(listOf("screen_view:notifications"), analytics.events)
        assertEquals(listOf(HOME, DISPLAY, Route.Notifications), nav.state.value.stack)
    }

    @Test
    fun `TC-ANL-017 replaceTop with the route that is already on top does nothing`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.open(Route.Notifications)
        analytics.clear()
        assertEquals(NavOutcome.Ignored, nav.replaceTop(Route.Notifications))
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `REQ-NAV-017 replaceTop keeps the guest gates of open`() {
        val analytics = RecordingAnalytics()
        val nav = guest(analytics)
        nav.open(Route.TermsDocument(TermsDocumentKind.TermsOfService))
        analytics.clear()
        val outcome = nav.replaceTop(Route.Notifications)
        assertEquals(NavOutcome.Blocked::class, outcome::class)
        assertEquals(Route.TermsDocument(TermsDocumentKind.TermsOfService), nav.top)
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-ANL-017 popTo goes down to the wanted screen with one screen_view for it`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Display)
        nav.open(Route.Notifications)
        nav.open(Route.NotificationDetail(NOTI_A))
        analytics.clear()

        val outcome = nav.popTo { it == HOME }

        assertEquals(NavOutcome.Navigated(HOME), outcome)
        assertEquals(listOf(HOME), nav.stack)
        assertEquals(listOf("screen_view:home"), analytics.events)
    }

    @Test
    fun `TC-ANL-017 popTo with the wanted screen already on top does nothing`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        assertEquals(NavOutcome.Ignored, nav.popTo { it == HOME })
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-ANL-017 popTo never empties the stack when nothing matches`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.open(Route.Notifications)
        analytics.clear()
        nav.popTo { false }
        assertEquals(listOf(HOME), nav.stack)
        assertEquals(listOf("screen_view:home"), analytics.events)
    }

    @Test
    fun `TC-ANL-011 popTo over an overlay only sends no screen_view`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics, listOf(HOME, SETTINGS))
        nav.open(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy))
        analytics.clear()
        nav.popTo { it == SETTINGS }
        assertEquals(SETTINGS, nav.top)
        assertEquals(emptyList(), analytics.events)
    }
}
