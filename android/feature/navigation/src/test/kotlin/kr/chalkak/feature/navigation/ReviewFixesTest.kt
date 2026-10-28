package kr.chalkak.feature.navigation

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ReviewFixesTest {
    @Test
    fun `REQ-NAV-031 D-22 replacing the same feed sends no second screen_view`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics, listOf(HOME, RECORD))
        val feed = Route.Feed(POST_A, FeedSource.ById)
        nav.open(feed)
        analytics.clear()
        assertEquals(NavOutcome.Replaced(feed), nav.open(feed, OpenVia.Push))
        assertEquals(emptyList(), analytics.events)
        // back still reveals the tab below and re-sends it once
        nav.onSystemBack()
        assertEquals(listOf("screen_view:record"), analytics.events)
    }

    @Test
    fun `a stale gate result after the session ended cannot push the upload screen over login`() {
        val nav = member()
        nav.onUploadButton()
        nav.onSessionEnded()
        assertEquals(NavOutcome.Ignored, nav.onUploadGateFinished(opened = true))
        assertEquals(listOf<Route>(Route.Login), nav.stack)
        nav.onAuthenticated()
        assertEquals(NavOutcome.StartUploadGate, nav.onUploadButton())
    }

    @Test
    fun `a gate result without a started gate is ignored`() {
        val nav = member()
        assertEquals(NavOutcome.Ignored, nav.onUploadGateFinished(opened = true))
        assertEquals(listOf<Route>(HOME), nav.stack)
    }

    @Test
    fun `state flow follows the stack, selected tab, bottom bar and access mode`() {
        val nav = guest()
        assertEquals(listOf<Route>(HOME), nav.state.value.stack)
        assertEquals(Tab.Home, nav.state.value.selectedTab)
        nav.onTabSelected(Tab.Display)
        assertEquals(listOf(HOME, DISPLAY), nav.state.value.stack)
        assertEquals(true, nav.state.value.bottomBarVisible)
        val feedRoute = Route.Feed(POST_A, FeedSource.Display)
        nav.onAuthenticated()
        assertEquals(AccessMode.Member, nav.state.value.accessMode)
        nav.open(feedRoute)
        assertEquals(feedRoute, nav.state.value.top)
        assertEquals(false, nav.state.value.bottomBarVisible)
        nav.onSystemBack()
        assertEquals(HOME, nav.state.value.top)
        nav.onSessionEnded()
        assertEquals(listOf<Route>(Route.Login), nav.state.value.stack)
        assertNull(nav.state.value.selectedTab)
    }

    @Test
    fun `state flow publishes a same-destination replacement and an overlay close`() {
        val nav = member()
        val first = Route.Feed(POST_A, FeedSource.Display)
        nav.open(first)
        val byId = Route.Feed(POST_A, FeedSource.ById)
        nav.open(byId, OpenVia.Push)
        assertEquals(byId, nav.state.value.top)
        nav.open(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy))
        nav.onSystemBack()
        assertEquals(byId, nav.state.value.top)
    }

    @Test
    fun `the display date request is consumed once and cleared when the session ends`() {
        val nav = member()
        val date = LocalDate.of(2026, 10, 27)
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = true)
        nav.onUploadSubmitted(date)
        nav.onUploadSuccessConfirmed()
        assertEquals(date, nav.state.value.displayDateRequest)
        assertEquals(date, nav.consumeDisplayDateRequest())
        assertNull(nav.consumeDisplayDateRequest())
        assertNull(nav.state.value.displayDateRequest)
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = true)
        nav.onUploadSubmitted(date)
        nav.onUploadSuccessConfirmed()
        nav.onSessionEnded()
        assertNull(nav.displayDateRequest)
    }

    @Test
    fun `a Kakao callback needs a non-empty app key`() {
        assertEquals(ExternalUrlAction.Ignore, ExternalUrlRouter.route("kakao://oauth"))
        assertEquals(ExternalUrlAction.KakaoLoginCallback, ExternalUrlRouter.route("KAKAO0123abcd://oauth?code=1"))
    }
}
