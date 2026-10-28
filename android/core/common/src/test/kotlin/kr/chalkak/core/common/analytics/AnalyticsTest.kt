package kr.chalkak.core.common.analytics

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Collects what reaches a tracker, in order, as `screen_view:<name>` / `bottom_navigation_selected:<destination>`. */
private class Collector(private val failure: RuntimeException? = null) : AnalyticsTracker {
    val events = mutableListOf<String>()
    override fun screenView(screen: String) {
        failure?.let { throw it }
        events += "screen_view:$screen"
    }

    override fun bottomNavigationSelected(destination: String) {
        failure?.let { throw it }
        events += "bottom_navigation_selected:$destination"
    }
}

/** ANL event model, support classes and screen-view dedup (D-22). Feature modules own their own screen_view call sites. */
class AnalyticsEventsTest {
    @Test
    fun `TC-ANL-002 the allowed screen names are the 19 of the fixture and shared constants, spelled the same`() {
        val fixture = Fixtures.json("anl/events__expected-screen-names.json").jsonObject.getValue("cases").jsonArray.map { it.jsonPrimitive.content }
        val constants = Fixtures.constants().getValue("ANALYTICS_SCREEN_NAMES").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(19, AppConstants.ANALYTICS_SCREEN_NAMES.size)
        assertEquals(fixture, AppConstants.ANALYTICS_SCREEN_NAMES)
        assertEquals(constants, AppConstants.ANALYTICS_SCREEN_NAMES)
        AppConstants.ANALYTICS_SCREEN_NAMES.forEach { assertEquals(it, AnalyticsEvents.screenView(it).params[AnalyticsEvents.PARAM_SCREEN_NAME]) }
        assertFailsWith<IllegalArgumentException> { AnalyticsEvents.screenView("Home") }
        assertFailsWith<IllegalArgumentException> { AnalyticsEvents.screenView("") }
    }

    @Test
    fun `TC-ANL-012 screen_view has screen_name, an optional screen_class and nothing else`() {
        assertEquals(
            AnalyticsEvent("screen_view", mapOf("screen_name" to "home")),
            AnalyticsEvents.screenView("home"),
        )
        assertEquals(
            AnalyticsEvent("screen_view", mapOf("screen_name" to "feed", "screen_class" to "FeedScreen")),
            AnalyticsEvents.screenView("feed", screenClass = "FeedScreen"),
        )
    }

    @Test
    fun `TC-ANL-013 bottom_navigation_selected carries destination for the four tabs`() {
        AppConstants.ANALYTICS_TAB_DESTINATIONS.forEach {
            assertEquals(
                AnalyticsEvent("bottom_navigation_selected", mapOf("destination" to it)),
                AnalyticsEvents.bottomNavigationSelected(it),
            )
        }
        assertEquals(listOf("home", "display", "record", "settings"), AppConstants.ANALYTICS_TAB_DESTINATIONS)
    }

    @Test
    fun `TC-ANL-015 upload is not a destination, only the four tab values are accepted`() {
        assertFailsWith<IllegalArgumentException> { AnalyticsEvents.bottomNavigationSelected("upload") }
        assertFailsWith<IllegalArgumentException> { AnalyticsEvents.bottomNavigationSelected("") }
    }

    @Test
    fun `TC-ANL-023 event and parameter names equal the constants of the contract`() {
        assertEquals("screen_view", AnalyticsEvents.SCREEN_VIEW)
        assertEquals("bottom_navigation_selected", AnalyticsEvents.BOTTOM_NAVIGATION_SELECTED)
        assertEquals("screen_name", AnalyticsEvents.PARAM_SCREEN_NAME)
        assertEquals("screen_class", AnalyticsEvents.PARAM_SCREEN_CLASS)
        assertEquals("destination", AnalyticsEvents.PARAM_DESTINATION)
        assertEquals(AppConstants.ANALYTICS_TAB_DESTINATIONS, Fixtures.constants().getValue("ANALYTICS_TAB_DESTINATIONS").jsonArray.map { it.jsonPrimitive.content })
    }

    @Test
    fun `TC-ANL-020 the logging tracker writes one line per event and works without any SDK or config`() {
        val lines = mutableListOf<String>()
        val tracker: AnalyticsTracker = LoggingAnalyticsTracker { lines += it }
        tracker.screenView("home")
        tracker.bottomNavigationSelected("display")
        assertEquals(2, lines.size)
        assertTrue("screen_view" in lines[0] && "screen_name=home" in lines[0], lines[0])
        assertTrue("bottom_navigation_selected" in lines[1] && "destination=display" in lines[1], lines[1])
    }

    @Test
    fun `TC-ANL-020 without a Firebase config the logging tracker is used, a Firebase failure falls back too`() {
        val fallback = Collector()
        val noConfig = AnalyticsTrackers.create(firebase = null, fallback = fallback)
        noConfig.screenView("login")
        assertEquals(listOf("screen_view:login"), fallback.events)

        val broken = AnalyticsTrackers.create(firebase = { error("bad google-services") }, fallback = fallback)
        broken.screenView("home")
        assertEquals(listOf("screen_view:login", "screen_view:home"), fallback.events)

        val firebase = Collector()
        val configured = AnalyticsTrackers.create(firebase = { firebase }, fallback = fallback)
        configured.bottomNavigationSelected("record")
        assertEquals(listOf("bottom_navigation_selected:record"), firebase.events)
        assertEquals(2, fallback.events.size)
    }

    @Test
    fun `TC-ANL-021 a tracker that throws is swallowed on both events`() {
        val safe = SafeAnalyticsTracker(Collector(failure = IllegalStateException("sdk down")))
        safe.screenView("home")
        safe.bottomNavigationSelected("home")
        // The wrapper must also be transparent when the delegate works.
        val ok = Collector()
        SafeAnalyticsTracker(ok).screenView("feed")
        assertEquals(listOf("screen_view:feed"), ok.events)
    }

    @Test
    fun `TC-ANL-021 a tracker created through create never throws even if the SDK does`() {
        val tracker = AnalyticsTrackers.create(firebase = { Collector(failure = IllegalStateException("boom")) }, fallback = Collector())
        tracker.screenView("home")
        tracker.bottomNavigationSelected("settings")
    }

    @Test
    fun `TC-ANL-004 and TC-ANL-018 a screen is reported once while it stays shown`() {
        val tracker = Collector()
        val reporter = ScreenViewReporter(tracker)
        reporter.shown("terms")
        reporter.shown("terms") // recomposition, rotation
        reporter.shown("terms")
        assertEquals(listOf("screen_view:terms"), tracker.events)
    }

    @Test
    fun `TC-ANL-017 coming back to a screen after it was hidden reports it again`() {
        val tracker = Collector()
        val reporter = ScreenViewReporter(tracker)
        reporter.shown("display")
        reporter.hidden()
        reporter.shown("feed")
        reporter.hidden()
        reporter.shown("display")
        assertEquals(listOf("screen_view:display", "screen_view:feed", "screen_view:display"), tracker.events)
    }

    @Test
    fun `TC-ANL-017 a different screen shown without hide is reported too`() {
        val tracker = Collector()
        val reporter = ScreenViewReporter(tracker)
        reporter.shown("login")
        reporter.shown("home")
        assertEquals(listOf("screen_view:login", "screen_view:home"), tracker.events)
    }

    @Test
    fun `TC-ANL-011 hiding never sends anything`() {
        val tracker = Collector()
        val reporter = ScreenViewReporter(tracker)
        reporter.shown("terms")
        reporter.shown("terms_of_service")
        reporter.hidden() // sheet closed: the screen below is not re-sent by the reporter
        assertEquals(listOf("screen_view:terms", "screen_view:terms_of_service"), tracker.events)
    }

    @Test
    fun `TC-ANL-001 and TC-ANL-022 the reporter talks to the interface and guests and members send the same`() {
        val member = Collector()
        val guest = Collector()
        listOf(member, guest).forEach { ScreenViewReporter(it).shown("home") }
        assertEquals(member.events, guest.events)
    }
}
