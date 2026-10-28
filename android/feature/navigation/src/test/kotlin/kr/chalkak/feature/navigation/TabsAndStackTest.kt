package kr.chalkak.feature.navigation

import kr.chalkak.core.common.testing.Copy
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TabsTest {
    @Test
    fun `TC-NAV-003 the main starts on the home tab`() {
        val nav = member()
        assertEquals(Tab.Home, nav.selectedTab)
        assertEquals(HOME, nav.top)
        assertEquals(listOf<Route>(HOME), nav.stack)
        assertTrue(nav.bottomBarVisible)
    }

    @Test
    fun `TC-NAV-004 display record and settings can be opened in turn and the selected tab follows`() {
        val nav = member()
        for (tab in listOf(Tab.Display, Tab.Record, Tab.Settings)) {
            assertIs<NavOutcome.TabSelected>(nav.onTabSelected(tab))
            assertEquals(tab, nav.selectedTab)
            assertEquals(listOf(HOME, Route.TabRoot(tab)), nav.stack)
        }
        nav.onTabSelected(Tab.Home)
        assertEquals(listOf<Route>(HOME), nav.stack)
    }

    @Test
    fun `TC-NAV-004 and TC-NAV-011 REQ-NAV-004 home starts fresh while the other tabs restore their state`() {
        val nav = member()
        assertEquals(NavOutcome.TabSelected(Tab.Display, restoreState = true), nav.onTabSelected(Tab.Display))
        assertEquals(NavOutcome.TabSelected(Tab.Record, restoreState = true), nav.onTabSelected(Tab.Record))
        assertEquals(NavOutcome.TabSelected(Tab.Settings, restoreState = true), nav.onTabSelected(Tab.Settings))
        assertEquals(NavOutcome.TabSelected(Tab.Home, restoreState = false), nav.onTabSelected(Tab.Home))
    }

    @Test
    fun `TC-NAV-010 display and record keep the saved scroll and selection over a round trip, home never restores`() {
        val nav = member()
        nav.tabStates.save(Tab.Display, TabViewState(scrollOffset = 640, selection = "2026-10-25|popular"))
        nav.tabStates.save(Tab.Record, TabViewState(scrollOffset = 0, selection = "2026-09"))
        nav.tabStates.save(Tab.Home, TabViewState(scrollOffset = 900))
        nav.onTabSelected(Tab.Settings)
        nav.onTabSelected(Tab.Display)
        assertEquals(TabViewState(640, "2026-10-25|popular"), nav.tabStates.restore(Tab.Display))
        assertEquals(TabViewState(0, "2026-09"), nav.tabStates.restore(Tab.Record))
        assertNull(nav.tabStates.restore(Tab.Home))
        assertNull(nav.tabStates.restore(Tab.Settings))
    }

    @Test
    fun `TC-NAV-008 selecting display again scrolls to top without stacking a second root`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        val before = nav.stack
        assertEquals(NavOutcome.ScrollToTop(Tab.Display), nav.onTabSelected(Tab.Display))
        assertEquals(before, nav.stack)
    }

    @Test
    fun `TC-NAV-009 REQ-NAV-006 and REQ-NAV-008 reselecting a non-display tab changes nothing and stacks nothing`() {
        val nav = member()
        for (tab in listOf(Tab.Home, Tab.Record, Tab.Settings)) {
            nav.onTabSelected(tab)
            val before = nav.stack
            assertEquals(NavOutcome.Ignored, nav.onTabSelected(tab), "$tab")
            assertEquals(before, nav.stack, "$tab")
        }
    }

    @Test
    fun `TC-NAV-016 a guest on the record tab stays where it is and gets the toast`() {
        val nav = guest()
        nav.onTabSelected(Tab.Display)
        val before = nav.stack
        assertEquals(NavOutcome.Blocked("nav.guest.record"), nav.onTabSelected(Tab.Record))
        assertEquals(before, nav.stack)
        assertEquals(Tab.Display, nav.selectedTab)
        assertEquals("기록을 보려면 로그인이 필요해요", Copy["nav.guest.record"])
    }

    @Test
    fun `REQ-NAV-012 a guest can use home, display and settings`() {
        val nav = guest()
        assertIs<NavOutcome.TabSelected>(nav.onTabSelected(Tab.Display))
        assertIs<NavOutcome.TabSelected>(nav.onTabSelected(Tab.Home))
        assertIs<NavOutcome.TabSelected>(nav.onTabSelected(Tab.Settings))
    }

    @Test
    fun `TC-NAV-024 a member can open every tab`() {
        val nav = member()
        listOf(Tab.Display, Tab.Record, Tab.Settings, Tab.Home).forEach { assertIs<NavOutcome.TabSelected>(nav.onTabSelected(it), "$it") }
    }

    @Test
    fun `TC-NAV-005 the upload button starts the gate for a member and does not change the selected tab`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Settings)
        analytics.clear()
        assertEquals(NavOutcome.StartUploadGate, nav.onUploadButton())
        assertEquals(Tab.Settings, nav.selectedTab)
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-NAV-007 tapping the upload button repeatedly while the gate runs starts it once and opens one upload screen`() {
        val nav = member()
        assertEquals(NavOutcome.StartUploadGate, nav.onUploadButton())
        assertEquals(NavOutcome.Ignored, nav.onUploadButton())
        assertEquals(NavOutcome.Ignored, nav.onUploadButton())
        assertEquals(NavOutcome.Navigated(Route.PhotoUpload), nav.onUploadGateFinished(opened = true))
        assertEquals(listOf<Route>(HOME, Route.PhotoUpload), nav.stack)
        assertEquals(NavOutcome.Ignored, nav.onUploadGateFinished(opened = true))
        assertEquals(listOf<Route>(HOME, Route.PhotoUpload), nav.stack)
    }

    @Test
    fun `TC-NAV-007 after a finished gate that did not open the upload the button works again`() {
        val nav = member()
        nav.onUploadButton()
        assertEquals(NavOutcome.Ignored, nav.onUploadGateFinished(opened = false))
        assertEquals(NavOutcome.StartUploadGate, nav.onUploadButton())
    }

    @Test
    fun `TC-NAV-017 a guest on the upload button gets the toast and no gate`() {
        val nav = guest()
        assertEquals(NavOutcome.Blocked("nav.guest.upload"), nav.onUploadButton())
        assertEquals(NavOutcome.Blocked("nav.guest.upload"), nav.onUploadButton())
        assertEquals(listOf<Route>(HOME), nav.stack)
    }

    @Test
    fun `TC-NAV-018 a guest cannot open a feed detail, nothing is stacked`() {
        val nav = guest()
        nav.onTabSelected(Tab.Display)
        assertEquals(NavOutcome.Blocked("nav.guest.feed"), nav.open(Route.Feed(POST_A, FeedSource.Display)))
        assertEquals(listOf(HOME, DISPLAY), nav.stack)
    }

    @Test
    fun `TC-NAV-019 a guest like is blocked, a member like is left to the caller`() {
        assertEquals(NavOutcome.Blocked("nav.guest.like"), guest().onGuardedAction(GuestAction.Like))
        assertEquals(NavOutcome.Ignored, member().onGuardedAction(GuestAction.Like))
    }

    @Test
    fun `TC-NAV-020 a guest cannot open the inbox from the bell`() {
        val nav = guest()
        assertEquals(NavOutcome.Blocked("nav.guest.notification"), nav.open(Route.Notifications))
        assertEquals(listOf<Route>(HOME), nav.stack)
    }

    @Test
    fun `TC-NAV-022 a guest cannot open the feedback screen`() {
        val nav = guest()
        nav.onTabSelected(Tab.Settings)
        assertEquals(NavOutcome.Blocked("nav.guest.feedback"), nav.open(Route.Feedback))
        assertEquals(listOf(HOME, SETTINGS), nav.stack)
    }

    @Test
    fun `TC-NAV-049 after a guest logs in everything is open`() {
        val nav = guest()
        assertEquals(NavOutcome.Blocked("nav.guest.record"), nav.onTabSelected(Tab.Record))
        nav.onGuestLoginClicked()
        nav.onAuthenticated()
        assertEquals(AccessMode.Member, nav.accessMode)
        assertIs<NavOutcome.TabSelected>(nav.onTabSelected(Tab.Record))
        assertEquals(NavOutcome.StartUploadGate, nav.onUploadButton())
        assertEquals(NavOutcome.Navigated(Route.Notifications), nav.open(Route.Notifications))
        assertIs<NavOutcome.Navigated>(nav.open(Route.Feed(POST_A, FeedSource.ById)))
    }
}

class BackStackTest {
    @Test
    fun `TC-NAV-012 REQ-NAV-023 and 024 the bar hides on a stacked feed and comes back on return`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        assertTrue(nav.bottomBarVisible)
        assertEquals(NavOutcome.Navigated(Route.Feed(POST_A, FeedSource.Display)), nav.open(Route.Feed(POST_A, FeedSource.Display)))
        assertFalse(nav.bottomBarVisible)
        assertEquals(NavOutcome.Navigated(DISPLAY), nav.onSystemBack())
        assertTrue(nav.bottomBarVisible)
    }

    @Test
    fun `TC-NAV-030 pressing the bell then back returns to home`() {
        val nav = member()
        assertEquals(NavOutcome.Navigated(Route.Notifications), nav.open(Route.Notifications))
        assertFalse(nav.bottomBarVisible)
        assertEquals(NavOutcome.Navigated(HOME), nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-031 a bell double tap stacks one inbox and one back reaches home`() {
        val nav = member()
        assertEquals(NavOutcome.Navigated(Route.Notifications), nav.open(Route.Notifications))
        assertEquals(NavOutcome.Ignored, nav.open(Route.Notifications))
        assertEquals(listOf<Route>(HOME, Route.Notifications), nav.stack)
        nav.onSystemBack()
        assertEquals(HOME, nav.top)
    }

    @Test
    fun `TC-NAV-032 a double tap on a display card stacks one feed`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        val feed = Route.Feed(POST_A, FeedSource.Display)
        assertEquals(NavOutcome.Navigated(feed), nav.open(feed))
        assertEquals(NavOutcome.Ignored, nav.open(feed))
        assertEquals(listOf(HOME, DISPLAY, feed), nav.stack)
    }

    @Test
    fun `REQ-NAV-031 the same post opened from a push replaces the top instead of stacking`() {
        val nav = member()
        nav.onTabSelected(Tab.Record)
        val feed = Route.Feed(POST_A, FeedSource.ById)
        nav.open(feed)
        assertEquals(NavOutcome.Replaced(feed), nav.open(feed, OpenVia.Push))
        assertEquals(listOf(HOME, RECORD, feed), nav.stack)
        val other = Route.Feed(POST_B, FeedSource.ById)
        assertEquals(NavOutcome.Navigated(other), nav.open(other, OpenVia.Push))
        assertEquals(listOf(HOME, RECORD, feed, other), nav.stack)
    }

    @Test
    fun `TC-NAV-034 the display opened from record returns to record and tabs stay usable`() {
        val nav = member()
        nav.onTabSelected(Tab.Record)
        assertEquals(NavOutcome.Navigated(DISPLAY), nav.open(DISPLAY))
        assertEquals(Tab.Display, nav.selectedTab)
        assertTrue(nav.bottomBarVisible)
        assertEquals(NavOutcome.Navigated(RECORD), nav.onSystemBack())
        assertEquals(Tab.Record, nav.selectedTab)
        assertIs<NavOutcome.TabSelected>(nav.onTabSelected(Tab.Settings))
    }

    @Test
    fun `TC-NAV-037 back from the notification detail returns to the inbox`() {
        val nav = member()
        nav.open(Route.Notifications)
        nav.open(Route.NotificationDetail(NOTI_A))
        assertEquals(NavOutcome.Navigated(Route.Notifications), nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-036 the banner web opens over home and back returns home`() {
        val nav = member()
        nav.open(Route.BannerWeb)
        assertEquals(HOME.let { NavOutcome.Navigated(it) }, nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-043 system back goes from a tab to home, then leaves the app`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        nav.onTabSelected(Tab.Settings)
        assertEquals(NavOutcome.Navigated(HOME), nav.onSystemBack())
        assertEquals(NavOutcome.ExitApp, nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-006 closing the upload screen opened from settings returns to settings`() {
        val nav = member()
        nav.onTabSelected(Tab.Settings)
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = true)
        assertEquals(NavOutcome.Navigated(SETTINGS), nav.onSystemBack())
        assertEquals(Tab.Settings, nav.selectedTab)
    }

    @Test
    fun `TC-NAV-033 submit replaces the upload with the success screen and the confirmation opens the display on the topic date`() {
        val nav = member()
        nav.onTabSelected(Tab.Record)
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = true)
        val date = LocalDate.of(2026, 10, 27)
        assertEquals(NavOutcome.Replaced(Route.PhotoUploadSuccess(date)), nav.onUploadSubmitted(date))
        assertEquals(listOf(HOME, RECORD, Route.PhotoUploadSuccess(date)), nav.stack)
        assertFalse(nav.bottomBarVisible)
        assertEquals(NavOutcome.TabSelected(Tab.Display, restoreState = false), nav.onUploadSuccessConfirmed())
        assertEquals(listOf(HOME, DISPLAY), nav.stack)
        assertEquals(date, nav.displayDateRequest)
        assertEquals(NavOutcome.Navigated(HOME), nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-033 the upload screen is not reachable by back from the success screen`() {
        val nav = member()
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = true)
        nav.onUploadSubmitted(LocalDate.of(2026, 10, 27))
        assertEquals(NavOutcome.Navigated(HOME), nav.onSystemBack())
        assertFalse(nav.stack.contains(Route.PhotoUpload))
    }

    @Test
    fun `TC-NAV-033 deleting the post on top goes back with the nav-post-deleted toast`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        nav.open(Route.Feed(POST_A, FeedSource.Display))
        assertEquals(NavOutcome.Navigated(DISPLAY, toastCopyKey = "nav.post-deleted"), nav.onPostDeleted())
        assertEquals("게시물을 삭제했어요", Copy["nav.post-deleted"])
        assertEquals(listOf(HOME, DISPLAY), nav.stack)
    }

    @Test
    fun `TC-NAV-038 a successful signature change pops both signature screens back to settings`() {
        val nav = member()
        nav.onTabSelected(Tab.Settings)
        nav.open(Route.ChangeSignature)
        nav.open(Route.ChangeSignaturePreview)
        assertEquals(NavOutcome.Navigated(SETTINGS), nav.onSignatureChanged())
        assertEquals(listOf(HOME, SETTINGS), nav.stack)
        assertEquals(NavOutcome.Navigated(HOME), nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-039 after login the stack is only home and back leaves the app`() {
        val nav = guest(initial = listOf(Route.Login))
        assertEquals(listOf<Route>(Route.Login), nav.stack)
        assertFalse(nav.bottomBarVisible)
        nav.onAuthenticated()
        assertEquals(listOf<Route>(HOME), nav.stack)
        assertEquals(Tab.Home, nav.selectedTab)
        assertEquals(NavOutcome.ExitApp, nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-040 after sign-up the terms and signature screens are gone`() {
        val nav = member(initial = listOf(Route.Login, Route.Terms, Route.OnboardingSignature, Route.OnboardingSignaturePreview))
        nav.onAuthenticated()
        assertEquals(listOf<Route>(HOME), nav.stack)
    }

    @Test
    fun `TC-NAV-041 after logout the login screen is the only entry`() {
        val nav = member()
        nav.onTabSelected(Tab.Settings)
        nav.open(Route.Feedback)
        nav.onSessionEnded()
        assertEquals(listOf<Route>(Route.Login), nav.stack)
        assertEquals(NavOutcome.ExitApp, nav.onSystemBack())
    }

    @Test
    fun `TC-NAV-042 a reauthentication-required from any depth leaves only the login screen`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        nav.open(Route.Feed(POST_A, FeedSource.Display))
        nav.open(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy))
        assertEquals(NavOutcome.Navigated(Route.Login), nav.onSessionEnded())
        assertEquals(listOf<Route>(Route.Login), nav.stack)
        assertNull(nav.selectedTab)
    }

    @Test
    fun `REQ-NAV-020 the guest login button clears the stack and shows login`() {
        val nav = guest()
        nav.onTabSelected(Tab.Settings)
        assertEquals(NavOutcome.Navigated(Route.Login), nav.onGuestLoginClicked())
        assertEquals(listOf<Route>(Route.Login), nav.stack)
    }

    @Test
    fun `TC-NAV-050 a second account starts on home with no state of the first one`() {
        val nav = member()
        nav.onTabSelected(Tab.Display)
        nav.tabStates.save(Tab.Display, TabViewState(500, "2026-10-20"))
        nav.tabStates.save(Tab.Settings, TabViewState(10))
        nav.onSessionEnded()
        nav.onAuthenticated()
        assertEquals(Tab.Home, nav.selectedTab)
        assertEquals(listOf<Route>(HOME), nav.stack)
        Tab.entries.forEach { assertNull(nav.tabStates.restore(it), "$it") }
    }
}
