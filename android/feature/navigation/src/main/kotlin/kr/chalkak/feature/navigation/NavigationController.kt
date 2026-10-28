package kr.chalkak.feature.navigation

import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.analytics.SafeAnalyticsTracker
import kr.chalkak.core.common.analytics.ScreenViewReporter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.LocalDate

/** What the UI must do after a navigation request. */
sealed interface NavOutcome {
    /** [top] is now on top of the stack. [toastCopyKey] is shown on it (e.g. `nav.post-deleted`). */
    data class Navigated(val top: Route, val toastCopyKey: String? = null) : NavOutcome

    /** The top was replaced by [top] instead of stacking a second one (REQ-NAV-031, REQ-NAV-037). */
    data class Replaced(val top: Route) : NavOutcome

    /** [tab] is selected. [restoreState] false = start from the initial state (home, REQ-NAV-004). */
    data class TabSelected(val tab: Tab, val restoreState: Boolean) : NavOutcome

    /** The selected [tab] was tapped again and wants to scroll to top (display only, REQ-NAV-007). */
    data class ScrollToTop(val tab: Tab) : NavOutcome

    /** Nothing moves; show the toast [copyKey] (guest restriction). No network request. */
    data class Blocked(val copyKey: String) : NavOutcome

    /** Member tapped the upload button: start `GET /posts/today` (once). */
    data object StartUploadGate : NavOutcome

    /** Nothing happens (double tap, reselect of a non-display tab, gate already running). */
    data object Ignored : NavOutcome

    /** System back on the home root: leave the app. */
    data object ExitApp : NavOutcome
}

/**
 * Immutable snapshot of the navigation state for a Compose host (collect [NavigationController.state]).
 * [selectedTab] is null while on login / sign-up screens; [displayDateRequest] is the pending display date (see
 * [NavigationController.consumeDisplayDateRequest]).
 */
data class NavState(
    val stack: List<Route>,
    val accessMode: AccessMode,
    val displayDateRequest: LocalDate? = null,
) {
    val top: Route get() = stack.last()
    val selectedTab: Tab? get() = stack.lastOrNull { it is Route.TabRoot }?.let { (it as Route.TabRoot).tab }
    val bottomBarVisible: Boolean get() = RouteRules.showsBottomBar(top)
}

/** How a request to open a screen arrived. */
enum class OpenVia {
    /** A tap: a second request for the same screen already on top is a double tap and is dropped (REQ-NAV-032). */
    UserTap,

    /** A push tap: the same post/notification detail on top is replaced, not stacked (REQ-NAV-031). */
    Push,
}

/**
 * Back stack, bottom bar, guest gates and `screen_view` / `bottom_navigation_selected` of the main navigation. Pure state machine:
 * the Compose host renders [stack] and executes the [NavOutcome]s.
 *
 * Stack model: main = `[TabRoot(Home)]` or `[TabRoot(Home), TabRoot(other tab)]` (tab moves pop up to Home, REQ-NAV-026), plus stacked
 * screens on top. Login / sign-up flows are stacks that start with [Route.Login] / [Route.Terms]. [selectedTab] is the topmost
 * tab root of the stack.
 *
 * Analytics: after every change of the top screen the controller reports `screen_view` through a ScreenViewReporter (once per visible
 * period). Popping a normal screen re-sends the screen revealed below (TC-ANL-017); closing an overlay does not (TC-ANL-011). A tab tap
 * sends `bottom_navigation_selected` BEFORE the tab's `screen_view` (fixtures `anl/events__journey-tabs.json`). Guests send the same events.
 * Analytics failures never reach the caller (TC-ANL-021).
 *
 * @param initial starting stack, e.g. `[TabRoot(Home)]` or `[Login]`. Nothing is reported until [start].
 */
class NavigationController(
    analytics: AnalyticsTracker,
    private var mode: AccessMode,
    initial: List<Route> = listOf(Route.TabRoot(Tab.Home)),
) {
    private val backStack = BackStack(initial)

    // SafeAnalyticsTracker makes every send exception-proof (TC-ANL-021); the reporter adds the once-per-visible-period rule (D-22).
    private val tracker: AnalyticsTracker = SafeAnalyticsTracker(analytics)
    private val reporter = ScreenViewReporter(tracker)
    private var uploadGateRunning = false

    private val _state = MutableStateFlow(snapshot())

    /** Observable state (stack, selected tab, bottom bar, access mode). Updated after every change; the plain properties below read the same data. */
    val state: StateFlow<NavState> = _state.asStateFlow()

    /** Bottom to top. Never empty. */
    val stack: List<Route> get() = backStack.snapshot
    val top: Route get() = backStack.top
    val accessMode: AccessMode get() = mode

    /** Topmost tab root of the stack; null while on login / sign-up screens. */
    val selectedTab: Tab? get() = backStack.selectedTab

    /** True only when [top] is a tab root (REQ-NAV-023/024). */
    val bottomBarVisible: Boolean get() = RouteRules.showsBottomBar(top)

    /** Date the display tab must open on after the upload success confirmation (`topicDate`), consumed by the display screen. */
    var displayDateRequest: LocalDate? = null
        private set

    /** Returns [displayDateRequest] and clears it, so the display screen applies the date once. */
    fun consumeDisplayDateRequest(): LocalDate? {
        val date = displayDateRequest
        displayDateRequest = null
        publish()
        return date
    }

    val tabStates: TabStateStore = TabStateStore()

    /** Reports the `screen_view` of the initial top (the app arrives on it; no `bottom_navigation_selected`). */
    fun start() = reporter.shown(RouteRules.screenName(top))

    /**
     * Bottom bar tab tap (REQ-NAV-003..009).
     *  - Guest on [Tab.Record] -> [NavOutcome.Blocked] `nav.guest.record`; stack and analytics unchanged (TC-ANL-016).
     *  - [tab] already selected -> `bottom_navigation_selected` is sent again (TC-ANL-014); [Tab.Display] -> [NavOutcome.ScrollToTop],
     *    other tabs -> [NavOutcome.Ignored]; no new stack entry, no `screen_view`.
     *  - Otherwise the stack becomes `[Home]` or `[Home, tab]` (any stacked screens are dropped), [NavOutcome.TabSelected] with
     *    `restoreState = tab != Home`, then `bottom_navigation_selected {destination}` and the tab's `screen_view`.
     */
    fun onTabSelected(tab: Tab): NavOutcome {
        if (tab == Tab.Record) blocked(GuestAction.RecordTab)?.let { return it }
        tracker.bottomNavigationSelected(tab.analyticsName)
        if (top == Route.TabRoot(tab)) {
            return if (tab == Tab.Display) NavOutcome.ScrollToTop(tab) else NavOutcome.Ignored
        }
        val root = Route.TabRoot(tab)
        if (tab == Tab.Home) backStack.reset(root) else backStack.reset(Route.TabRoot(Tab.Home), root)
        reportTop()
        return NavOutcome.TabSelected(tab, restoreState = tab != Tab.Home)
    }

    /**
     * Center upload button (REQ-NAV-014, 035). Never changes the selected tab and never sends `bottom_navigation_selected` (TC-ANL-015).
     * Guest -> [NavOutcome.Blocked] `nav.guest.upload`, no gate. Member -> [NavOutcome.StartUploadGate]; while a gate is running
     * further taps return [NavOutcome.Ignored] (one `GET /posts/today`).
     */
    fun onUploadButton(): NavOutcome {
        blocked(GuestAction.UploadButton)?.let { return it }
        if (uploadGateRunning) return NavOutcome.Ignored
        uploadGateRunning = true
        return NavOutcome.StartUploadGate
    }

    /**
     * The gate finished. Clears the "running" flag. A result that arrives when no gate is running (e.g. after [onSessionEnded])
     * is stale and returns [NavOutcome.Ignored], so it can never push the upload screen over a login screen. [opened] true -> push
     * [Route.PhotoUpload] (ignored if already on top); false -> [NavOutcome.Ignored] (the upload track shows its own dialog/toast).
     */
    fun onUploadGateFinished(opened: Boolean): NavOutcome {
        if (!uploadGateRunning) return NavOutcome.Ignored
        uploadGateRunning = false
        if (!opened || top == Route.PhotoUpload) return NavOutcome.Ignored
        return pushAndReport(Route.PhotoUpload)
    }

    /**
     * Open a screen on top of the current one.
     *  - Guest + [Route.Feed] / [Route.Notifications] / [Route.Feedback] -> [NavOutcome.Blocked] with the matching toast (REQ-NAV-015/017/018).
     *  - Same destination as the top: [OpenVia.UserTap] -> [NavOutcome.Ignored]; [OpenVia.Push] -> [NavOutcome.Replaced].
     *  - Otherwise [NavOutcome.Navigated], with `screen_view` of the new top.
     * [Route.TabRoot] is pushed as a stacked tab root (e.g. display opened from record, back returns to record: REQ-NAV-030).
     */
    fun open(route: Route, via: OpenVia = OpenVia.UserTap): NavOutcome {
        guestActionFor(route)?.let { action -> blocked(action)?.let { return it } }
        if (RouteRules.sameDestination(top, route)) {
            if (via == OpenVia.UserTap) return NavOutcome.Ignored
            backStack.replaceTop(route) // same screen, same visible period (D-22): no new screen_view
            publish()
            return NavOutcome.Replaced(route)
        }
        return pushAndReport(route)
    }

    /** Guest check for actions that do not navigate (like). Member -> [NavOutcome.Ignored] (the caller proceeds). */
    fun onGuardedAction(action: GuestAction): NavOutcome = blocked(action) ?: NavOutcome.Ignored

    /**
     * System back (Android) / browser back. Stacked screen or overlay -> popped ([NavOutcome.Navigated] with the revealed top,
     * REQ-NAV-025); non-home tab root -> Home; Home root, login, or sign-up root -> [NavOutcome.ExitApp] (REQ-NAV-026).
     */
    fun onSystemBack(): NavOutcome {
        if (!backStack.canPop) return NavOutcome.ExitApp
        val closed = top
        val revealed = backStack.pop()
        if (RouteRules.isOverlay(closed)) {
            reporter.hidden() // the screen below was never left: no new screen_view (TC-ANL-011)
        } else {
            reportTop()
        }
        publish()
        return NavOutcome.Navigated(revealed)
    }

    /** Login or sign-up succeeded: mode becomes [AccessMode.Member], the stack becomes `[Home]` (login/sign-up screens are gone, REQ-NAV-021). */
    fun onAuthenticated(): NavOutcome {
        mode = AccessMode.Member
        return resetTo(Route.TabRoot(Tab.Home))
    }

    /**
     * Logout, withdrawal, REAUTHENTICATION_REQUIRED, or a 401 that survived the refresh: the stack becomes `[Login]`, [tabStates] are
     * cleared (REQ-NAV-022, TC-NAV-050), the mode stays as it was until the next [onAuthenticated].
     */
    fun onSessionEnded(): NavOutcome {
        tabStates.clear()
        displayDateRequest = null
        uploadGateRunning = false
        return resetTo(Route.Login)
    }

    /** Guest taps "로그인" in settings: stack becomes `[Login]` (guest flag is cleared by the caller, REQ-NAV-020). */
    fun onGuestLoginClicked(): NavOutcome = resetTo(Route.Login)

    /** Upload submit succeeded: [Route.PhotoUpload] on top is replaced by [Route.PhotoUploadSuccess] (REQ-NAV-037). */
    fun onUploadSubmitted(topicDate: LocalDate): NavOutcome {
        if (top != Route.PhotoUpload) return NavOutcome.Ignored
        val success = Route.PhotoUploadSuccess(topicDate)
        backStack.replaceTop(success)
        reportTop()
        return NavOutcome.Replaced(success)
    }

    /**
     * "확인했어요." on the success screen (REQ-NAV-038): stack becomes `[Home, TabRoot(Display)]`, [displayDateRequest] = the success
     * screen's `topicDate`, outcome [NavOutcome.TabSelected] (Display, restoreState = false). Upload and success screens are gone.
     */
    fun onUploadSuccessConfirmed(): NavOutcome {
        val success = top as? Route.PhotoUploadSuccess ?: return NavOutcome.Ignored
        displayDateRequest = success.topicDate
        backStack.reset(Route.TabRoot(Tab.Home), Route.TabRoot(Tab.Display))
        reportTop()
        return NavOutcome.TabSelected(Tab.Display, restoreState = false)
    }

    /** Post deleted: the feed on top is popped, [NavOutcome.Navigated] carries `nav.post-deleted` (REQ-NAV-039/040). */
    fun onPostDeleted(): NavOutcome {
        if (top !is Route.Feed) return NavOutcome.Ignored
        val revealed = backStack.pop()
        reportTop()
        return NavOutcome.Navigated(revealed, toastCopyKey = POST_DELETED_COPY)
    }

    /** Signature changed: both [Route.ChangeSignaturePreview] and [Route.ChangeSignature] are removed, settings is on top (REQ-NAV-033). */
    fun onSignatureChanged(): NavOutcome {
        backStack.popWhile { it == Route.ChangeSignaturePreview || it == Route.ChangeSignature }
        reportTop()
        return NavOutcome.Navigated(top)
    }

    private fun blocked(action: GuestAction): NavOutcome.Blocked? =
        GuestPolicy.blockingToast(mode, action)?.let { NavOutcome.Blocked(it) }

    private fun guestActionFor(route: Route): GuestAction? = when (route) {
        is Route.Feed -> GuestAction.FeedDetail
        Route.Notifications -> GuestAction.NotificationEntry
        Route.Feedback -> GuestAction.FeedbackEntry
        else -> null
    }

    private fun pushAndReport(route: Route): NavOutcome {
        backStack.push(route)
        reportTop()
        return NavOutcome.Navigated(route)
    }

    private fun resetTo(route: Route): NavOutcome {
        backStack.reset(route)
        reportTop()
        return NavOutcome.Navigated(route)
    }

    /** A new visible period starts for the current top, so it is reported even if the same screen name was shown before. */
    private fun reportTop() {
        reporter.hidden()
        reporter.shown(RouteRules.screenName(top))
        publish()
    }

    private fun snapshot() = NavState(backStack.snapshot, mode, displayDateRequest)

    private fun publish() {
        _state.value = snapshot()
    }

    private companion object {
        const val POST_DELETED_COPY = "nav.post-deleted"
    }
}
