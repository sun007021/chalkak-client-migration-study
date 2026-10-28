package kr.chalkak.feature.navigation

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/** `screen_view` and `bottom_navigation_selected` produced by the navigation controller (D-22). */
class AnalyticsFlowTest {
    /** Events of one case of an `anl/events__journey-*.json` fixture as `name:value`. */
    private fun fixtureEvents(file: String, case: String): List<String> {
        val cases = Fixtures.json(file).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }
        val events = cases.first { it.getValue("name").jsonPrimitive.content == case }.getValue("events").jsonArray
        return events.map {
            val e = it.jsonObject
            val params = e.getValue("params").jsonObject
            "${e.getValue("name").jsonPrimitive.content}:${params.values.first().jsonPrimitive.content}"
        }
    }

    @Test
    fun `TC-ANL-005 REQ-NAV-010 the main sends home on start and each new tab root once`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Display)
        nav.onTabSelected(Tab.Record)
        nav.onTabSelected(Tab.Settings)
        assertEquals(
            listOf("home", "display", "record", "settings"),
            analytics.events.filter { it.startsWith("screen_view:") }.map { it.removePrefix("screen_view:") },
        )
    }

    @Test
    fun `TC-ANL-013 each tab tap sends bottom_navigation_selected before the screen_view of that tab`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        nav.onTabSelected(Tab.Display)
        nav.onTabSelected(Tab.Record)
        nav.onTabSelected(Tab.Settings)
        nav.onTabSelected(Tab.Home)
        assertEquals(
            listOf(
                "bottom_navigation_selected:display", "screen_view:display",
                "bottom_navigation_selected:record", "screen_view:record",
                "bottom_navigation_selected:settings", "screen_view:settings",
                "bottom_navigation_selected:home", "screen_view:home",
            ),
            analytics.events,
        )
    }

    @Test
    fun `TC-ANL-014 reselecting the selected tab sends bottom_navigation_selected again but no second screen_view`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Display)
        analytics.clear()
        nav.onTabSelected(Tab.Display)
        assertEquals(listOf("bottom_navigation_selected:display"), analytics.events)
    }

    @Test
    fun `TC-ANL-015 the upload button sends no bottom_navigation_selected`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        nav.onUploadButton()
        nav.onUploadGateFinished(opened = false)
        assertEquals(emptyList(), analytics.events.filter { it.startsWith("bottom_navigation_selected") })
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-ANL-016 a tab blocked by the guest toast sends neither event`() {
        val analytics = RecordingAnalytics()
        val nav = guest(analytics)
        analytics.clear()
        nav.onTabSelected(Tab.Record)
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-ANL-017 popping a screen sends the screen_view of the screen revealed`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Display)
        nav.open(Route.Feed(POST_A, FeedSource.Display))
        analytics.clear()
        nav.onSystemBack()
        assertEquals(listOf("screen_view:display"), analytics.events)
    }

    @Test
    fun `TC-ANL-006 the bell, the notification detail and the banner web send their names`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        nav.open(Route.Notifications)
        nav.open(Route.NotificationDetail(NOTI_A))
        nav.onSystemBack()
        nav.onSystemBack()
        nav.open(Route.BannerWeb)
        assertEquals(
            listOf(
                "screen_view:notifications", "screen_view:notification_detail", "screen_view:notifications",
                "screen_view:home", "screen_view:issue",
            ),
            analytics.events,
        )
    }

    @Test
    fun `TC-ANL-007 a feed opened by id from a push sends feed like one opened from the list`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        nav.open(Route.Feed(POST_A, FeedSource.ById), OpenVia.Push)
        assertEquals(listOf("screen_view:feed"), analytics.events)
    }

    @Test
    fun `TC-ANL-008 the upload and the success screen send one screen_view each`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onUploadButton()
        analytics.clear()
        nav.onUploadGateFinished(opened = true)
        nav.onUploadSubmitted(LocalDate.of(2026, 10, 27))
        assertEquals(listOf("screen_view:photo_upload", "screen_view:photo_upload_success"), analytics.events)
    }

    @Test
    fun `TC-ANL-009 the feedback screen sends feedback`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Settings)
        analytics.clear()
        nav.open(Route.Feedback)
        assertEquals(listOf("screen_view:feedback"), analytics.events)
    }

    @Test
    fun `TC-ANL-003 the sign-up entry sends login, terms, onboarding_signature and its preview once each`() {
        val analytics = RecordingAnalytics()
        val nav = guest(analytics, initial = listOf(Route.Login))
        nav.open(Route.Terms)
        nav.open(Route.OnboardingSignature)
        nav.open(Route.OnboardingSignaturePreview)
        assertEquals(fixtureEvents("anl/events__journey-signup.json", "signup-entry"), analytics.events)
    }

    @Test
    fun `TC-ANL-004 the signature change sends change_signature then change_signature_preview`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Settings)
        analytics.clear()
        nav.open(Route.ChangeSignature)
        nav.open(Route.ChangeSignaturePreview)
        assertEquals(listOf("screen_view:change_signature", "screen_view:change_signature_preview"), analytics.events)
    }

    @Test
    fun `TC-ANL-010 and TC-ANL-011 a terms document sends its own name when opened and nothing when closed`() {
        val analytics = RecordingAnalytics()
        val nav = guest(analytics, initial = listOf(Route.Login, Route.Terms))
        analytics.clear()
        nav.open(Route.TermsDocument(TermsDocumentKind.TermsOfService))
        nav.onSystemBack()
        nav.open(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy))
        nav.onSystemBack()
        assertEquals(listOf("screen_view:terms_of_service", "screen_view:privacy_policy"), analytics.events)
        assertEquals(Route.Terms, nav.top)
    }

    @Test
    fun `TC-ANL-018 asking for the same top again does not repeat the screen_view`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        nav.onTabSelected(Tab.Display)
        val feed = Route.Feed(POST_A, FeedSource.Display)
        nav.open(feed)
        analytics.clear()
        nav.open(feed) // double tap, dropped
        assertEquals(emptyList(), analytics.events)
    }

    @Test
    fun `TC-ANL-021 a throwing tracker does not change navigation`() {
        val analytics = RecordingAnalytics(failure = IllegalStateException("sdk down"))
        val nav = member(analytics)
        assertEquals(NavOutcome.TabSelected(Tab.Display, restoreState = true), nav.onTabSelected(Tab.Display))
        assertEquals(NavOutcome.Navigated(Route.Notifications), nav.open(Route.Notifications))
        nav.onSystemBack()
        assertEquals(DISPLAY, nav.top)
    }

    @Test
    fun `TC-ANL-022 guests and members send the same events for the same screens`() {
        val memberEvents = RecordingAnalytics()
        val guestEvents = RecordingAnalytics()
        listOf(member(memberEvents), guest(guestEvents)).forEach {
            it.onTabSelected(Tab.Display)
            it.onTabSelected(Tab.Settings)
            it.onTabSelected(Tab.Home)
            it.open(Route.BannerWeb)
        }
        assertEquals(memberEvents.events, guestEvents.events)
    }

    @Test
    fun `TC-ANL-005 and TC-ANL-013 the tabs fixture is replayed after the start`() {
        val analytics = RecordingAnalytics()
        val nav = member(analytics)
        analytics.clear()
        listOf(Tab.Display, Tab.Record, Tab.Settings).forEach { nav.onTabSelected(it) }
        // The fixture begins with a tap on the already selected home tab (bottom_navigation_selected:home, screen_view:home); the
        // controller treats the start as the home screen_view, so only the events after that are replayed here.
        assertEquals(fixtureEvents("anl/events__journey-tabs.json", "tabs").drop(2), analytics.events)
    }

    @Test
    fun `TC-ANL-024 the representative journey login to home to display to settings`() {
        val analytics = RecordingAnalytics()
        val nav = guest(analytics, initial = listOf(Route.Login))
        nav.onAuthenticated()
        nav.onTabSelected(Tab.Display)
        nav.onTabSelected(Tab.Settings)
        assertEquals(fixtureEvents("anl/events__journey-tabs.json", "representative-journey"), analytics.events)
    }
}
