package com.stonefive.chalkak.ui.main

import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.data.home.Banner

/**
 * What the main area keeps across configuration changes (held by `rememberStateHolder`, so it lives in a ViewModel): the scope the
 * upload gate runs in (a rotation must not cancel a gate the controller still counts as running), the "scroll to top" requests and
 * the banner whose web page is open.
 */
class MainSession(val scope: CoroutineScope) {
    val homeScroll = ScrollToTopSignal()
    val displayScroll = ScrollToTopSignal()

    /** Last home-scroll request that the home list already acted on. */
    var homeScrollHandled: Int = 0

    /** Banner of the last `HomeEffect.OpenIssue`; the `BannerWeb` route shows it. */
    var issueBanner: Banner? = null
}
