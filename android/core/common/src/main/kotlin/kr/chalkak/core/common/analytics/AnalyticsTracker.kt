package kr.chalkak.core.common.analytics

/** D-22 analytics events. Screen names are AppConstants.ANALYTICS_SCREEN_NAMES. */
interface AnalyticsTracker {
    fun screenView(screen: String)

    /** `bottom_navigation_selected {destination: home|display|record|settings}`. */
    fun bottomNavigationSelected(destination: String) {}
}

/** `screen_view` must never affect the screen (TC-ANL-021). */
fun AnalyticsTracker.screenViewSafely(name: String) = SafeAnalyticsTracker(this).screenView(name)
