package com.stonefive.chalkak.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.home.RemoteImage
import com.stonefive.chalkak.ui.issue.IssueWebContent
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Tab

/**
 * Upload entry gate port: the host calls it once per accepted upload-button tap (`GET /posts/today` lives behind it) and reports the
 * result to `NavigationController.onUploadGateFinished(opened)`. `true` = the upload screen may open.
 */
fun interface UploadEntryGate {
    suspend fun enter(): Boolean
}

/** "Scroll the visible list of this tab to the top" request: every [request] increments [count]; the tab content scrolls on a change. */
class ScrollToTopSignal {
    var count: Int by mutableIntStateOf(0)
        private set

    fun request() {
        count++
    }
}

/** Tab content of the tabs this PR does not build (display, record, settings): a box tagged `<tab>.root`. */
@Composable
fun TabPlaceholder(tab: Tab, modifier: Modifier = Modifier) {
}

/**
 * Everything [MainHost] needs from the app. Factories/ports so JVM tests inject fakes.
 *
 * - [newHomeHolder]: built once per home screen with the holder scope. The home holder's `LikeToggler` is a `LikeControllerToggler(likes)`.
 * - [likes] / [postChanges]: shared like state; the APP resets both on account switch (logout, login as another user).
 * - [otherTab]: content of display / record / settings (default [TabPlaceholder]); gets the tab's [ScrollToTopSignal].
 * - [issueWeb]: the WebView adapter slot for the banner web screen.
 */
class MainDependencies(
    val newHomeHolder: (scope: CoroutineScope, mode: HomeMode) -> HomeStateHolder,
    val likes: LikeController,
    val postChanges: PostChanges,
    val uploadGate: UploadEntryGate,
    val issueOpener: ExternalLinkOpener,
    val image: RemoteImage = { _, _ -> },
    val issueWeb: IssueWebContent = { _, _, _, _ -> },
    val otherTab: @Composable (tab: Tab, scrollToTop: ScrollToTopSignal) -> Unit = { tab, _ -> TabPlaceholder(tab) },
)

/**
 * Main area host (everything behind the boot gate except login / sign-up screens). STUB (TDD step 1): renders nothing yet.
 *
 * Collects `nav.state` and renders [MainShell]; executes every `NavOutcome` of the controller:
 * - tab tap -> `nav.onTabSelected`. `Blocked(key)` -> `showToast(copy[key])` (no tab change). `ScrollToTop(Display)` ->
 *   the display tab's [ScrollToTopSignal].request(). Re-tapping HOME while home is selected scrolls home to the top
 *   (TC-NAV-009; the controller answers Ignored for it). Re-tapping record/settings does nothing.
 * - upload button / hero upload (`HomeEffect.OpenUpload`) -> `nav.onUploadButton()`; `Blocked` -> toast; `StartUploadGate` -> run
 *   `deps.uploadGate.enter()` exactly once (further taps while it runs are Ignored by the controller) -> `nav.onUploadGateFinished(opened)`.
 * - system back (BackHandler inside the host) -> `nav.onSystemBack()`; `ExitApp` -> [onExitApp].
 * - routes: TabRoot(Home) -> HomeRoute (home.root); other TabRoot -> `deps.otherTab`; Notifications -> `notifications.root`,
 *   Feed -> `feed.root`, PhotoUpload -> `upload.root`, PhotoUploadSuccess -> `upload-success.root`, NotificationDetail ->
 *   `notification-detail.root`, Feedback -> `feedback.root` (placeholders, presence only); BannerWeb -> IssueWebRoute (`issue.root`) for
 *   the banner of the last `HomeEffect.OpenIssue`.
 * - HomeEffect: ShowToast -> `showToast(copy[key])`; OpenFeed -> `nav.open(Feed(postId, Display))`; OpenNotifications ->
 *   `nav.open(Notifications)`; OpenIssue -> `nav.open(BannerWeb)`; OpenDisplay / OpenRecord -> tab selection; `Blocked` -> toast.
 * - the host NEVER sends `screen_view` / analytics itself (the controller does).
 * - likes: on every home list load merge the ranking/popular posts into `deps.likes` (`merge(id, LikeSnapshot, revision taken before the load)`),
 *   show the displayed like state from `deps.likes.states`, collect `deps.likes.events`: `Failed` -> toast `copy[failure.copyKey]`;
 *   `PostGone` -> the post disappears from both home rows (also via `deps.postChanges.removed`).
 */
@Composable
fun MainHost(
    nav: NavigationController,
    deps: MainDependencies,
    showToast: (String) -> Unit,
    onExitApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
}
