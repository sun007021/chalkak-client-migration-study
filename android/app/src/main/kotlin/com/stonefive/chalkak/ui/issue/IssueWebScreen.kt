package com.stonefive.chalkak.ui.issue

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.TopBar
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.core.data.home.Banner
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.IssueLinkPolicy
import kr.chalkak.feature.home.LinkDecision
import kr.chalkak.feature.home.LinkNavigation

enum class IssueWebLoad { Loading, Loaded, Failed }

/**
 * Banner web screen (stateless, testids.md "배너 웹 화면", TC-BANR-024): title `home.banner.title`, back button (also the system
 * back), the [web] content unless [load] is Failed, a progress indicator while Loading, and the error text with a retry button
 * while Failed. [linkMessage] (a link that cannot be opened) is shown only when non-null.
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
    val copy = LocalCopy.current
    BackHandler(onBack = onBack)
    Column(modifier = modifier.fillMaxSize().testTag("issue.root")) {
        TopBar {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BackAction(onClick = onBack, modifier = Modifier.testTag("issue.back-button"))
                Text(
                    text = copy["home.banner.title"],
                    style = MaterialTheme.typography.titleLarge,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.padding(start = 8.dp).testTag("issue.title"),
                )
            }
        }
        if (linkMessage != null) {
            Text(
                text = linkMessage,
                style = MaterialTheme.typography.bodySmall,
                color = ChalkakTheme.colors.destructive,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("issue.link-open-failed-message"),
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (load != IssueWebLoad.Failed) {
                Box(modifier = Modifier.fillMaxSize().testTag("issue.web-content")) { web() }
            }
            when (load) {
                IssueWebLoad.Loading -> Loading(Modifier.align(Alignment.Center).testTag("issue.loading"))
                IssueWebLoad.Failed -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = copy["banner.web.load-error"],
                        style = MaterialTheme.typography.bodyMedium,
                        color = ChalkakTheme.colors.textNeutral,
                        modifier = Modifier.testTag("issue.error-state"),
                    )
                    ChalkakOutlinedButton(text = copy["banner.web.retry"], onClick = onRetry, modifier = Modifier.testTag("issue.retry-button"))
                }
                IssueWebLoad.Loaded -> Unit
            }
        }
    }
}

/** The real WebView adapter is a slot so JVM tests need no WebView. [onNavigate] answers synchronously, like `shouldOverrideUrlLoading`. */
typealias IssueWebContent = @Composable (
    url: String,
    onNavigate: (LinkNavigation) -> LinkDecision,
    onLoaded: () -> Unit,
    onFailed: () -> Unit,
) -> Unit

/**
 * Stateful wrapper (TC-BANR-019/023/024): keeps the [IssueWebLoad]; retry resets it to Loading and builds the web content afresh
 * (a new attempt, same url). Every navigation the web view reports goes through [IssueLinkPolicy.decide]; `OpenExternal` is handed to
 * [opener] and a failure shows its toast. A non-https initial address is not loaded at all: only the link message is shown.
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
    val copy = LocalCopy.current
    var load by remember(banner.id) { mutableStateOf(IssueWebLoad.Loading) }
    var attempt by remember(banner.id) { mutableIntStateOf(0) }
    val initial = remember(banner.id) { IssueLinkPolicy.decide(LinkNavigation(url = banner.webViewUrl, isInitialLoad = true)) }
    val loadable = initial == LinkDecision.AllowInApp
    IssueWebScreen(
        load = if (loadable) load else IssueWebLoad.Loaded,
        onBack = onBack,
        onRetry = {
            attempt++
            load = IssueWebLoad.Loading
        },
        modifier = modifier,
        linkMessage = if (loadable) null else copy["banner.web.link-unavailable"],
    ) {
        if (loadable) {
            key(attempt) {
                web(
                    banner.webViewUrl,
                    { navigation ->
                        val decision = IssueLinkPolicy.decide(navigation)
                        if (decision == LinkDecision.OpenExternal) opener.open(navigation.url)?.let { showToast(copy[it]) }
                        decision
                    },
                    { if (load == IssueWebLoad.Loading) load = IssueWebLoad.Loaded },
                    { if (load == IssueWebLoad.Loading) load = IssueWebLoad.Failed },
                )
            }
        }
    }
}
