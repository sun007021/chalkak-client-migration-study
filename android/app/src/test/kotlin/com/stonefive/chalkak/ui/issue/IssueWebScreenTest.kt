package com.stonefive.chalkak.ui.issue

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.testing.RecordingBrowser
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.feature.home.BrowserOpenResult
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.LinkDecision
import kr.chalkak.feature.home.LinkNavigation
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class IssueWebScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private var backs = 0
    private var retries = 0

    private fun showScreen(load: IssueWebLoad, linkMessage: String? = null) = rule.setContent {
        TestApp(copy) {
            IssueWebScreen(
                load = load, onBack = { backs++ }, onRetry = { retries++ }, linkMessage = linkMessage,
                web = { Box(Modifier.size(10.dp).testTag("test.web")) },
            )
        }
    }

    @Test
    fun `TC-BANR-024 로딩 중에는 제목 ISSUE와 진행 표시와 웹 본문이 있고 오류 요소는 트리에 없다`() {
        showScreen(IssueWebLoad.Loading)
        rule.onNodeWithTag("issue.root").assertIsDisplayed()
        rule.onNodeWithTag("issue.title").assertTextEquals(copy["home.banner.title"])
        rule.onNodeWithTag("issue.loading").assertIsDisplayed()
        rule.onNodeWithTag("issue.web-content").assertExists()
        rule.onNodeWithTag("issue.error-state").assertDoesNotExist()
        rule.onNodeWithTag("issue.retry-button").assertDoesNotExist()
    }

    @Test
    fun `TC-BANR-024 로드 실패 화면은 오류 문구와 다시 시도만 보이고 웹 본문과 진행 표시는 없다`() {
        showScreen(IssueWebLoad.Failed)
        rule.onNodeWithTag("issue.error-state").assertTextEquals(copy["banner.web.load-error"])
        rule.onNodeWithTag("issue.retry-button").assertTextEquals(copy["banner.web.retry"])
        rule.onNodeWithTag("issue.web-content").assertDoesNotExist()
        rule.onNodeWithTag("issue.loading").assertDoesNotExist()
        rule.onNodeWithTag("issue.retry-button").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun `TC-BANR-024 로드가 끝나면 웹 본문만 남는다`() {
        showScreen(IssueWebLoad.Loaded)
        rule.onNodeWithTag("issue.web-content").assertExists()
        listOf("issue.loading", "issue.error-state", "issue.retry-button", "issue.link-open-failed-message").forEach {
            rule.onNodeWithTag(it).assertDoesNotExist()
        }
    }

    @Test
    fun `TC-BANR-023 링크 열기 실패 메시지는 있을 때만 존재한다`() {
        showScreen(IssueWebLoad.Loaded, linkMessage = copy["banner.web.link-unavailable"])
        rule.onNodeWithTag("issue.link-open-failed-message").assertTextEquals(copy["banner.web.link-unavailable"])
    }

    @Test
    fun `TC-BANR-024 뒤로 버튼은 뒤로 콜백을 부른다`() {
        showScreen(IssueWebLoad.Loaded)
        rule.onNodeWithTag("issue.back-button").performClick()
        assertEquals(1, backs)
    }

    // ---- stateful route: link policy + retry ----------------------------------------------------------------------------------------

    private val banner: Banner = HomeFixtureModels.bannerPage("banner/banners__page1-10.json").banners.first()
    private val browser = RecordingBrowser()
    private val toasts = mutableListOf<String>()
    private val decisions = mutableListOf<LinkDecision>()
    private val loadedUrls = mutableListOf<String>()
    private var failFirstLoad = false
    private var attempts = 0

    private fun showRoute() = rule.setContent {
        TestApp(copy) {
            IssueWebRoute(
                banner = banner,
                opener = ExternalLinkOpener(browser),
                showToast = { toasts += it },
                onBack = { backs++ },
                web = { url, onNavigate, onLoaded, onFailed ->
                    val attempt = remember(url) { ++attempts }
                    LaunchedEffect(attempt) {
                        loadedUrls += url
                        if (failFirstLoad && attempt == 1) onFailed() else onLoaded()
                    }
                    Text(
                        "link",
                        Modifier.clickable {
                            decisions += onNavigate(LinkNavigation(url = "$url?next=1", currentUrl = url, isUserTap = true, opensNewWindow = true))
                        }.testTag("test.link"),
                    )
                },
            )
        }
    }

    @Test
    fun `TC-BANR-019 웹뷰 안의 일반 링크 탭은 외부 브라우저로 열리고 앱 안에서는 이동하지 않는다`() {
        showRoute()
        rule.onNodeWithTag("test.link").performClick()
        assertEquals(listOf("${banner.webViewUrl}?next=1"), browser.opened)
        assertEquals(listOf<LinkDecision>(LinkDecision.OpenExternal), decisions)
        assertEquals(emptyList(), toasts)
    }

    @Test
    fun `TC-BANR-023 외부 브라우저가 없으면 토스트 문구가 뜬다`() {
        browser.result = BrowserOpenResult.NoBrowser
        showRoute()
        rule.onNodeWithTag("test.link").performClick()
        assertEquals(listOf(copy["banner.no-browser"]), toasts)
    }

    @Test
    fun `TC-BANR-023 브라우저 열기에 실패하면 실패 토스트 문구가 뜬다`() {
        browser.result = BrowserOpenResult.Failed
        showRoute()
        rule.onNodeWithTag("test.link").performClick()
        assertEquals(listOf(copy["banner.open-failed"]), toasts)
    }

    @Test
    fun `TC-BANR-024 로드가 실패하면 오류 화면이 뜨고 다시 시도는 같은 주소를 다시 로드해 페이지를 보인다`() {
        failFirstLoad = true
        showRoute()
        rule.waitForIdle()
        rule.onNodeWithTag("issue.error-state").assertTextEquals(copy["banner.web.load-error"])
        rule.onNodeWithTag("issue.retry-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("issue.error-state").assertDoesNotExist()
        rule.onNodeWithTag("issue.web-content").assertExists()
        assertEquals(listOf(banner.webViewUrl, banner.webViewUrl), loadedUrls)
    }
}
