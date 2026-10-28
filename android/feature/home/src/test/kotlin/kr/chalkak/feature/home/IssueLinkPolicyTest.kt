package kr.chalkak.feature.home

import kr.chalkak.core.common.testing.Copy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class IssueLinkPolicyTest {
    private val page = "https://web.example.test/issues/1"

    private fun initial(url: String) = LinkNavigation(url = url, isInitialLoad = true)
    private fun tap(url: String, newWindow: Boolean = false, frame: Boolean = true) =
        LinkNavigation(url = url, currentUrl = page, isUserTap = true, opensNewWindow = newWindow, isMainFrame = frame)

    @Test
    fun `TC-BANR-017 the initial https load with a host is allowed in the app`() {
        assertEquals(LinkDecision.AllowInApp, IssueLinkPolicy.decide(initial(page)))
    }

    @Test
    fun `TC-BANR-017 initial http, empty and host-less addresses are blocked`() {
        for (url in listOf("http://web.example.test/issues/1", "", "https://", "https:///path", "web.example.test/issues/1")) {
            assertEquals(LinkDecision.Block, IssueLinkPolicy.decide(initial(url)), "initial load of '$url'")
        }
    }

    @Test
    fun `TC-BANR-017 the block toast text is banner link-invalid`() {
        assertEquals("링크를 열 수 없어요", Copy[HomeCopyKeys.BANNER_LINK_INVALID])
    }

    @Test
    fun `TC-BANR-018 redirects and script navigations without a user tap are blocked after the initial load`() {
        val auto = LinkNavigation(url = "https://other.example.test/redirected", currentUrl = page)
        assertEquals(LinkDecision.Block, IssueLinkPolicy.decide(auto))
        assertEquals(LinkDecision.Block, IssueLinkPolicy.decide(auto.copy(url = "$page#x")))
    }

    @Test
    fun `TC-BANR-018 a new window opened without a user tap is blocked`() {
        val popup = LinkNavigation(url = "https://other.example.test/popup", currentUrl = page, opensNewWindow = true)
        assertEquals(LinkDecision.Block, IssueLinkPolicy.decide(popup))
    }

    @Test
    fun `TC-BANR-019 a tapped http or https link opens the system browser`() {
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap("https://other.example.test/a")))
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap("http://other.example.test/a")))
    }

    @Test
    fun `TC-BANR-019 same host and same URL taps also open externally`() {
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap("https://web.example.test/issues/2")))
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap(page)))
    }

    @Test
    fun `TC-BANR-019 a tapped target blank link opens externally`() {
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap("https://other.example.test/a", newWindow = true)))
    }

    @Test
    fun `TC-BANR-020 an anchor in the same document stays in the web view`() {
        assertEquals(LinkDecision.AllowInApp, IssueLinkPolicy.decide(tap("$page#section")))
    }

    @Test
    fun `TC-BANR-020 an anchor opened in a new tab goes out to the browser`() {
        assertEquals(LinkDecision.OpenExternal, IssueLinkPolicy.decide(tap("$page#section", newWindow = true)))
    }

    @Test
    fun `TC-BANR-021 tel mailto intent javascript file and custom schemes are blocked`() {
        val urls = listOf(
            "tel:+821012345678", "mailto:a@example.test", "intent://scan/#Intent;scheme=zxing;end", "javascript:alert(1)",
            "file:///sdcard/a.html", "kakaolink://send", "market://details?id=x",
        )
        for (url in urls) assertEquals(LinkDecision.Block, IssueLinkPolicy.decide(tap(url)), url)
    }

    @Test
    fun `TC-BANR-022 subframe navigation is handled inside the frame and never opened externally`() {
        assertEquals(LinkDecision.AllowInApp, IssueLinkPolicy.decide(tap("https://embed.example.test/frame", frame = false)))
        assertEquals(
            LinkDecision.AllowInApp,
            IssueLinkPolicy.decide(LinkNavigation(url = "https://embed.example.test/frame2", currentUrl = page, isMainFrame = false)),
        )
    }

    // ---- external browser outcome (TC-BANR-023) -----------------------------------------------------

    @Test
    fun `TC-BANR-023 opening succeeds without a toast`() {
        val opener = ExternalLinkOpener { BrowserOpenResult.Opened }
        assertNull(opener.open("https://other.example.test/a"))
    }

    @Test
    fun `TC-BANR-023 no browser installed shows the no-browser toast`() {
        val opener = ExternalLinkOpener { BrowserOpenResult.NoBrowser }
        assertEquals("링크를 열 수 있는 브라우저가 없어요", Copy[opener.open("https://other.example.test/a")!!])
    }

    @Test
    fun `TC-BANR-023 a failing browser launch shows the open-failed toast and a throwing adapter does not crash`() {
        assertEquals("브라우저에서 링크를 열지 못했어요", Copy[ExternalLinkOpener { BrowserOpenResult.Failed }.open("https://other.example.test/a")!!])
        val throwing = ExternalLinkOpener { throw IllegalStateException("activity gone") }
        assertEquals(HomeCopyKeys.BANNER_OPEN_FAILED, throwing.open("https://other.example.test/a"))
    }
}
