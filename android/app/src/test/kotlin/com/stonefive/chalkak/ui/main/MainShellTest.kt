package com.stonefive.chalkak.ui.main

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavState
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.LocalDate
import kotlin.test.assertEquals

/** Stateless shell: a NavState in, the top route's content and (on tab roots only) the bottom bar out. */
@RunWith(RobolectricTestRunner::class)
class MainShellTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val rendered = mutableListOf<Route>()

    private fun show(stack: List<Route>) = rule.setContent {
        TestApp(copy) {
            MainShell(
                navState = NavState(stack, AccessMode.Member),
                onTabClick = {},
                onUploadClick = {},
            ) { route ->
                rendered += route
                Box(androidx.compose.ui.Modifier.testTag("test.content")) { Text(route.toString()) }
            }
        }
    }

    private val home = Route.TabRoot(Tab.Home)

    @Test
    fun `TC-NAV-012 탭 루트에서는 콘텐츠와 하단바가 함께 보이고 선택 탭이 따라온다`() {
        show(listOf(home, Route.TabRoot(Tab.Display)))
        rule.onNodeWithTag("test.content").assertIsDisplayed()
        rule.onNodeWithTag("bottom-bar.root").assertIsDisplayed()
        rule.onNodeWithTag("bottom-bar.tab-display").assertIsSelected()
        assertEquals(Route.TabRoot(Tab.Display), rendered.last(), "content is rendered for the top route")
    }

    private fun assertBarGone(vararg stacked: Route) {
        show(listOf(home) + stacked)
        rule.onNodeWithTag("test.content").assertIsDisplayed()
        rule.onNodeWithTag("bottom-bar.root").assertDoesNotExist()
        rule.onNodeWithTag("bottom-bar.tab-home").assertDoesNotExist()
        rule.onNodeWithTag("bottom-bar.upload-button").assertDoesNotExist()
    }

    @Test
    fun `TC-NAV-012 게시물 상세 위에서는 하단바가 트리에 없다`() = assertBarGone(Route.Feed("p1", FeedSource.Display))

    @Test
    fun `TC-NAV-012 알림함 위에서는 하단바가 없다`() = assertBarGone(Route.Notifications)

    @Test
    fun `TC-NAV-012 알림 상세 위에서는 하단바가 없다`() = assertBarGone(Route.Notifications, Route.NotificationDetail("n1"))

    @Test
    fun `TC-NAV-012 배너 웹 위에서는 하단바가 없다`() = assertBarGone(Route.BannerWeb)

    @Test
    fun `TC-NAV-012 업로드 화면에서는 하단바가 없다`() = assertBarGone(Route.PhotoUpload)

    @Test
    fun `TC-NAV-012 업로드 성공 화면에서는 하단바가 없다`() = assertBarGone(Route.PhotoUploadSuccess(LocalDate.of(2026, 10, 27)))

    @Test
    fun `TC-NAV-012 피드백 화면에서는 하단바가 없다`() = assertBarGone(Route.Feedback)

    @Test
    fun `TC-NAV-012 사인 변경 그리기와 미리보기 화면에서는 하단바가 없다`() {
        assertBarGone(Route.ChangeSignature, Route.ChangeSignaturePreview)
    }

    @Test
    fun `TC-NAV-012 로그인 화면에서는 하단바가 없다`() {
        show(listOf(Route.Login))
        rule.onNodeWithTag("test.content").assertIsDisplayed()
        rule.onNodeWithTag("bottom-bar.root").assertDoesNotExist()
    }
}
