package kr.chalkak.feature.navigation

import java.time.LocalDate

/** Bottom bar tabs, left to right (REQ-NAV-001). The upload button is not a tab (REQ-NAV-002). */
enum class Tab(val analyticsName: String, val labelCopyKey: String) {
    Home("home", "nav.tab.home"),
    Display("display", "nav.tab.display"),
    Record("record", "nav.tab.record"),
    Settings("settings", "nav.tab.settings"),
}

enum class TermsDocumentKind { TermsOfService, PrivacyPolicy }

/** Where a feed detail was opened from (REQ-NAV-027/028). */
enum class FeedSource {
    /** Display list or home ranking: show the tapped post immediately, then revalidate with the detail response. */
    Display,

    /** Record, push or inbox: only the `postId` is known, load the detail by id. */
    ById,
}

/** Every screen of the screen map in `navigation.md`. Pure data; behaviour lives in [RouteRules]. */
sealed interface Route {
    // Full screens outside the main bar (login / sign-up).
    data object Login : Route
    data object Terms : Route
    data object OnboardingSignature : Route
    data object OnboardingSignaturePreview : Route

    /** One of the four tab roots. */
    data class TabRoot(val tab: Tab) : Route

    // Screens stacked above a tab root.
    data class Feed(val postId: String, val source: FeedSource) : Route
    data object Notifications : Route
    data class NotificationDetail(val notificationId: String) : Route
    data object BannerWeb : Route
    data object PhotoUpload : Route
    data class PhotoUploadSuccess(val topicDate: LocalDate) : Route
    data object Feedback : Route
    data object ChangeSignature : Route
    data object ChangeSignaturePreview : Route

    /** Sheet / dialog over the current screen (terms and privacy documents). */
    data class TermsDocument(val kind: TermsDocumentKind) : Route
}

/** Static facts about a [Route]. */
object RouteRules {
    /** Analytics `screen_name` of the route (D-22 table). Feed is `feed` whatever the source (TC-ANL-007). */
    fun screenName(route: Route): String = when (route) {
        Route.Login -> "login"
        Route.Terms -> "terms"
        Route.OnboardingSignature -> "onboarding_signature"
        Route.OnboardingSignaturePreview -> "onboarding_signature_preview"
        is Route.TabRoot -> route.tab.analyticsName
        is Route.Feed -> "feed"
        Route.Notifications -> "notifications"
        is Route.NotificationDetail -> "notification_detail"
        Route.BannerWeb -> "issue"
        Route.PhotoUpload -> "photo_upload"
        is Route.PhotoUploadSuccess -> "photo_upload_success"
        Route.Feedback -> "feedback"
        Route.ChangeSignature -> "change_signature"
        Route.ChangeSignaturePreview -> "change_signature_preview"
        is Route.TermsDocument -> when (route.kind) {
            TermsDocumentKind.TermsOfService -> "terms_of_service"
            TermsDocumentKind.PrivacyPolicy -> "privacy_policy"
        }
    }

    /** True only for the four tab roots (REQ-NAV-023/024). Login and sign-up screens hide the bar too. */
    fun showsBottomBar(route: Route): Boolean = route is Route.TabRoot

    /**
     * True for sheets/dialogs ([Route.TermsDocument]): opening one sends its `screen_view`, closing one does not re-send the
     * screen below (TC-ANL-011), unlike popping a normal screen (TC-ANL-017).
     */
    fun isOverlay(route: Route): Boolean = route is Route.TermsDocument

    /**
     * True when [a] and [b] are the same destination: same type and same identity (feed `postId`, notification id, tab, document
     * kind). `source` and `topicDate` are not part of the identity. Used to drop double taps (REQ-NAV-032) and to replace instead
     * of stacking (REQ-NAV-031).
     */
    fun sameDestination(a: Route, b: Route): Boolean = when (a) {
        is Route.TabRoot -> b is Route.TabRoot && a.tab == b.tab
        is Route.Feed -> b is Route.Feed && a.postId == b.postId
        is Route.NotificationDetail -> b is Route.NotificationDetail && a.notificationId == b.notificationId
        is Route.TermsDocument -> b is Route.TermsDocument && a.kind == b.kind
        is Route.PhotoUploadSuccess -> b is Route.PhotoUploadSuccess
        else -> a == b // data objects: identity is the type
    }
}
