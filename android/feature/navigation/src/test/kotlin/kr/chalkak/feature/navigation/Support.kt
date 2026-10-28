package kr.chalkak.feature.navigation

import kr.chalkak.core.common.analytics.AnalyticsTracker

/** Records analytics in order as `screen_view:<name>` / `bottom_navigation_selected:<destination>`. */
class RecordingAnalytics(private val failure: RuntimeException? = null) : AnalyticsTracker {
    val events = mutableListOf<String>()

    override fun screenView(screen: String) {
        events += "screen_view:$screen"
        failure?.let { throw it }
    }

    override fun bottomNavigationSelected(destination: String) {
        events += "bottom_navigation_selected:$destination"
        failure?.let { throw it }
    }

    fun clear() = events.clear()
}

internal val HOME = Route.TabRoot(Tab.Home)
internal val DISPLAY = Route.TabRoot(Tab.Display)
internal val RECORD = Route.TabRoot(Tab.Record)
internal val SETTINGS = Route.TabRoot(Tab.Settings)
internal const val POST_A = "22222222-2222-4222-8222-222222222201"
internal const val POST_B = "22222222-2222-4222-8222-222222222202"
internal const val NOTI_A = "33333333-3333-4333-8333-333333333301"

internal fun member(analytics: RecordingAnalytics = RecordingAnalytics(), initial: List<Route> = listOf(HOME)) =
    NavigationController(analytics, AccessMode.Member, initial).also { it.start() }

internal fun guest(analytics: RecordingAnalytics = RecordingAnalytics(), initial: List<Route> = listOf(HOME)) =
    NavigationController(analytics, AccessMode.Guest, initial).also { it.start() }
