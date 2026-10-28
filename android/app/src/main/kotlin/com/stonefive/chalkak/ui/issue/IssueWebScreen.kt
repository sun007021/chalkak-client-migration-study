package com.stonefive.chalkak.ui.issue

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.core.data.home.Banner
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.LinkDecision
import kr.chalkak.feature.home.LinkNavigation

enum class IssueWebLoad { Loading, Loaded, Failed }

/**
 * Banner web screen (stateless). STUB (TDD step 1): renders nothing yet.
 *
 * Required behaviour (testids.md "배너 웹 화면", TC-BANR-024): root `issue.root`; title `issue.title` = `home.banner.title`;
 * back `issue.back-button` (-> [onBack], also the system back); `issue.web-content` wraps [web] and is in the tree unless
 * [load] is Failed; `issue.loading` only while Loading; `issue.error-state` = `banner.web.load-error` and
 * `issue.retry-button` = `banner.web.retry` (-> [onRetry]) only while Failed; `issue.link-open-failed-message` shows
 * [linkMessage] only when it is non-null.
 */
@Composable
fun IssueWebScreen(
    load: IssueWebLoad,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    linkMessage: String? = null,
    web: @Composable () -> Unit = {},
) {
}

/** The real WebView adapter is a slot so JVM tests need no WebView. [onNavigate] answers synchronously, like `shouldOverrideUrlLoading`. */
typealias IssueWebContent = @Composable (
    url: String,
    onNavigate: (LinkNavigation) -> LinkDecision,
    onLoaded: () -> Unit,
    onFailed: () -> Unit,
) -> Unit

/**
 * Stateful wrapper. STUB (TDD step 1): renders nothing yet.
 *
 * Required behaviour (TC-BANR-019/023/024): keeps the [IssueWebLoad] (starts Loading; [web] reports Loaded / Failed); retry resets
 * to Loading and recomposes [web] afresh (a new attempt, same url). Every [IssueWebContent.onNavigate] goes through
 * `IssueLinkPolicy.decide`; `OpenExternal` is handed to [opener] and, when it returns a copy key, `showToast(copy[key])`; the
 * decision is returned to the web view. An initial-load `Block` (non-https) does not load: shows `issue.link-open-failed-message`
 * = `banner.web.link-unavailable`.
 */
@Composable
fun IssueWebRoute(
    banner: Banner,
    opener: ExternalLinkOpener,
    showToast: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    web: IssueWebContent = { _, _, _, _ -> },
) {
}
