package com.stonefive.chalkak.push

import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavState
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.notification.TopScreen
import org.junit.Test
import kotlin.test.assertEquals

/** What `PushTapQueue` reads from the navigation: the top screen (replace/stack decision) and the "do not interrupt" flag. */
class PushNavigationStateTest {
    private val home = Route.TabRoot(Tab.Home)
    private val post = "22222222-2222-4222-8222-222222222201"
    private val notification = "33333333-3333-4333-8333-333333333305"

    private fun stateOf(vararg stack: Route) = PushNavigationState().also { it.update(NavState(stack.toList(), AccessMode.Member)) }

    @Test
    fun `TC-PUSH-065 홈 탭 루트가 맨 위면 Home 이다`() {
        assertEquals(TopScreen.Home, stateOf(home).top)
    }

    @Test
    fun `TC-PUSH-064 게시물 상세가 맨 위면 그 postId 의 PostDetail 이다`() {
        assertEquals(TopScreen.PostDetail(post), stateOf(home, Route.Feed(post, FeedSource.ById)).top)
        assertEquals(TopScreen.PostDetail(post), stateOf(home, Route.Feed(post, FeedSource.Display)).top)
    }

    @Test
    fun `TC-PUSH-064 알림 상세가 맨 위면 그 알림 id 의 NotificationDetail 이다`() {
        assertEquals(TopScreen.NotificationDetail(notification), stateOf(home, Route.NotificationDetail(notification)).top)
    }

    @Test
    fun `알림함이 맨 위면 Inbox 이고 홈이 아닌 탭 배너 웹 등은 Other 이다`() {
        assertEquals(TopScreen.Inbox, stateOf(home, Route.Notifications).top)
        assertEquals(TopScreen.Other, stateOf(Route.TabRoot(Tab.Display)).top)
        assertEquals(TopScreen.Other, stateOf(home, Route.BannerWeb).top)
        assertEquals(TopScreen.Other, stateOf(home, Route.Feedback).top)
    }

    @Test
    fun `TC-PUSH-060 TC-PUSH-061 로그인 약관 가입 서명 업로드 피드백 서명 변경이 맨 위면 푸시 탭을 보류한다`() {
        val blocking = listOf(
            Route.Login,
            Route.Terms,
            Route.OnboardingSignature,
            Route.OnboardingSignaturePreview,
        )
        blocking.forEach { assertEquals(true, stateOf(it).blocking.value, "$it") }
        val stacked = listOf(Route.PhotoUpload, Route.Feedback, Route.ChangeSignature, Route.ChangeSignaturePreview)
        stacked.forEach { assertEquals(true, stateOf(home, it).blocking.value, "$it") }
    }

    @Test
    fun `홈 상세 알림함 알림 상세 배너 웹 탭 루트에서는 푸시 탭을 보류하지 않는다`() {
        val open = listOf(
            listOf(home),
            listOf(home, Route.Feed(post, FeedSource.ById)),
            listOf(home, Route.Notifications),
            listOf(home, Route.NotificationDetail(notification)),
            listOf(home, Route.BannerWeb),
            listOf(Route.TabRoot(Tab.Settings)),
        )
        open.forEach { stack ->
            val state = PushNavigationState()
            state.update(NavState(listOf(home, Route.Feedback), AccessMode.Member))
            assertEquals(true, state.blocking.value)
            state.update(NavState(stack, AccessMode.Member))
            assertEquals(false, state.blocking.value, "$stack")
        }
    }

    @Test
    fun `update 는 매번 최신 상태로 덮어쓴다`() {
        val state = PushNavigationState()
        state.update(NavState(listOf(home, Route.Feedback), AccessMode.Member))
        assertEquals(true, state.blocking.value)
        state.update(NavState(listOf(home), AccessMode.Member))
        assertEquals(false, state.blocking.value)
        assertEquals(TopScreen.Home, state.top)
    }
}
