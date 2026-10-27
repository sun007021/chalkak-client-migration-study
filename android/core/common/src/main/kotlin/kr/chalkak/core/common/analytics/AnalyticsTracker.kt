package kr.chalkak.core.common.analytics

/** D-22 analytics events. Screen names are AppConstants.ANALYTICS_SCREEN_NAMES. */
interface AnalyticsTracker {
    fun screenView(screen: String)

    /** `bottom_navigation_selected {destination: home|display|record|settings}`. */
    fun bottomNavigationSelected(destination: String) {}
}
