package kr.chalkak.core.common.analytics

import kr.chalkak.core.common.AppConstants

/** One analytics event as it reaches the SDK: [name] plus string [params] (D-22). */
data class AnalyticsEvent(val name: String, val params: Map<String, String>)

/** The only two events the app sends (REQ-ANL-007). Pure builders, no SDK. */
object AnalyticsEvents {
    const val SCREEN_VIEW: String = "screen_view"
    const val BOTTOM_NAVIGATION_SELECTED: String = "bottom_navigation_selected"
    const val PARAM_SCREEN_NAME: String = "screen_name"
    const val PARAM_SCREEN_CLASS: String = "screen_class"
    const val PARAM_DESTINATION: String = "destination"

    /**
     * `screen_view {screen_name, screen_class?}` (REQ-ANL-003). [screenName] must be one of `AppConstants.ANALYTICS_SCREEN_NAMES`,
     * otherwise [IllegalArgumentException]. `screen_class` is present only when [screenClass] is non-null. No other param is ever added
     * (no user id, token or post content: REQ-ANL-008).
     */
    fun screenView(screenName: String, screenClass: String? = null): AnalyticsEvent {
        require(screenName in AppConstants.ANALYTICS_SCREEN_NAMES) { "Unknown analytics screen_name: '$screenName'" }
        val params = buildMap {
            put(PARAM_SCREEN_NAME, screenName)
            if (screenClass != null) put(PARAM_SCREEN_CLASS, screenClass)
        }
        return AnalyticsEvent(SCREEN_VIEW, params)
    }

    /**
     * `bottom_navigation_selected {destination}` (REQ-ANL-006). [destination] must be one of `AppConstants.ANALYTICS_TAB_DESTINATIONS`
     * (the upload button is not a tab, TC-ANL-015), otherwise [IllegalArgumentException].
     */
    fun bottomNavigationSelected(destination: String): AnalyticsEvent {
        require(destination in AppConstants.ANALYTICS_TAB_DESTINATIONS) { "Unknown analytics destination: '$destination'" }
        return AnalyticsEvent(BOTTOM_NAVIGATION_SELECTED, mapOf(PARAM_DESTINATION to destination))
    }
}
