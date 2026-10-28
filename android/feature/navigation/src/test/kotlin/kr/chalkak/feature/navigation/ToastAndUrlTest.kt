package kr.chalkak.feature.navigation

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.FakeClock
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ToastHostTest {
    private val clock = FakeClock()
    private val host = ToastHost(clock)

    @Test
    fun `TC-NAV-025 a toast is visible at 2_49 seconds and gone at 2_5 seconds`() {
        assertEquals(2_500L, AppConstants.TOAST_DURATION_MS)
        val toast = host.request("기록을 보려면 로그인이 필요해요", screenVisible = true)
        assertNotNull(toast)
        assertEquals(toast, host.current())
        clock.advance(Duration.ofMillis(2_490))
        assertEquals(toast, host.current())
        clock.advance(Duration.ofMillis(10))
        assertNull(host.current())
    }

    @Test
    fun `TC-NAV-026 the same text requested twice is shown again with a fresh window`() {
        val first = host.request("같은 문구", screenVisible = true)
        clock.advance(Duration.ofMillis(2_000))
        val second = host.request("같은 문구", screenVisible = true)
        assertNotNull(first)
        assertNotNull(second)
        assertNotEquals(first.id, second.id)
        assertEquals(first.text, second.text)
        clock.advance(Duration.ofMillis(1_000)) // 3 s after the first, 1 s after the second
        assertEquals(second, host.current())
        clock.advance(Duration.ofMillis(1_500))
        assertNull(host.current())
    }

    @Test
    fun `TC-NAV-027 a newer text replaces the old one and the old window never hides it early`() {
        host.request("A", screenVisible = true)
        clock.advance(Duration.ofMillis(2_000))
        val b = host.request("B", screenVisible = true)
        clock.advance(Duration.ofMillis(600)) // the window of A ended at 2.5 s
        assertEquals(b, host.current())
        assertEquals("B", host.current()?.text)
        clock.advance(Duration.ofMillis(1_900))
        assertNull(host.current())
    }

    @Test
    fun `TC-NAV-028 a toast requested while the screen is not visible is dropped and not queued`() {
        assertNull(host.request("백그라운드", screenVisible = false))
        assertNull(host.current())
        clock.advance(Duration.ofMillis(100))
        assertNull(host.current())
        val visible = host.request("보임", screenVisible = true)
        assertEquals(visible, host.current())
    }
}

class ExternalUrlRouterTest {
    @Test
    fun `TC-NAV-045 the Kakao login callback is the only external url handled`() {
        assertEquals(ExternalUrlAction.KakaoLoginCallback, ExternalUrlRouter.route("kakao0123456789abcdef://oauth?code=abc&state=s"))
        assertEquals(ExternalUrlAction.KakaoLoginCallback, ExternalUrlRouter.route("kakao0123456789abcdef://oauth"))
    }

    @Test
    fun `TC-NAV-045 app deep links, https links and garbage open nothing`() {
        listOf(
            "chalkak://post/22222222-2222-4222-8222-222222222201",
            "chalkak://home",
            "https://chalkak.app/posts/1",
            "http://example.com",
            "kakao0123456789abcdef://other",
            "kakao://",
            "intent://home#Intent;end",
            "",
            "   ",
            "not a url at all",
            "javascript:alert(1)",
        ).forEach { assertEquals(ExternalUrlAction.Ignore, ExternalUrlRouter.route(it), it) }
    }
}
