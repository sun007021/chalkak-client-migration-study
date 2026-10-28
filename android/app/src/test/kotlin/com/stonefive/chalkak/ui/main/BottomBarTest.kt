package com.stonefive.chalkak.ui.main

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.feature.navigation.Tab
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Stateless bottom bar: render `selected`, report taps. Routing lives in [MainHostTest]. */
@RunWith(RobolectricTestRunner::class)
class BottomBarTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val taps = mutableListOf<Tab>()
    private var uploads = 0

    private fun show(selected: Tab?) = rule.setContent {
        TestApp(copy) { BottomBar(selected = selected, onTabClick = { taps += it }, onUploadClick = { uploads++ }) }
    }

    private val tabTags = mapOf(
        Tab.Home to "bottom-bar.tab-home",
        Tab.Display to "bottom-bar.tab-display",
        Tab.Record to "bottom-bar.tab-record",
        Tab.Settings to "bottom-bar.tab-settings",
    )

    @Test
    fun `TC-NAV-001 하단바는 홈 전시 업로드 기록 설정 순서로 5개 요소를 보이고 탭 라벨은 ko json 값이다`() {
        show(Tab.Home)
        rule.onNodeWithTag("bottom-bar.root").assertIsDisplayed()
        val order = listOf(
            "bottom-bar.tab-home", "bottom-bar.tab-display", "bottom-bar.upload-button",
            "bottom-bar.tab-record", "bottom-bar.tab-settings",
        )
        order.forEach { rule.onNodeWithTag(it).assertIsDisplayed() }
        val lefts = order.map { rule.onNodeWithTag(it).getBoundsInRoot().left.value }
        assertEquals(lefts.sorted(), lefts, "left to right: $order")
        assertEquals(lefts.distinct().size, lefts.size, "five distinct positions")
        rule.onNodeWithTag("bottom-bar.tab-home").assertTextEquals(copy["nav.tab.home"])
        rule.onNodeWithTag("bottom-bar.tab-display").assertTextEquals(copy["nav.tab.display"])
        rule.onNodeWithTag("bottom-bar.tab-record").assertTextEquals(copy["nav.tab.record"])
        rule.onNodeWithTag("bottom-bar.tab-settings").assertTextEquals(copy["nav.tab.settings"])
    }

    @Test
    fun `TC-NAV-001 업로드 버튼은 글자 없이 접근성 이름 추가를 가진다`() {
        show(Tab.Home)
        rule.onNodeWithTag("bottom-bar.upload-button").assertContentDescriptionEquals(copy["nav.tab.upload.a11y"])
        rule.onNodeWithTag("bottom-bar.upload-button").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Text))
    }

    @Test
    fun `TC-NAV-002 홈이 선택되면 홈만 selected다`() = assertOnlySelected(Tab.Home)

    @Test
    fun `TC-NAV-002 전시가 선택되면 전시만 selected다`() = assertOnlySelected(Tab.Display)

    @Test
    fun `TC-NAV-002 기록이 선택되면 기록만 selected다`() = assertOnlySelected(Tab.Record)

    @Test
    fun `TC-NAV-002 설정이 선택되면 설정만 selected다`() = assertOnlySelected(Tab.Settings)

    private fun assertOnlySelected(selected: Tab) {
        show(selected)
        tabTags.forEach { (tab, tag) ->
            if (tab == selected) rule.onNodeWithTag(tag).assertIsSelected() else rule.onNodeWithTag(tag).assertIsNotSelected()
        }
        // The upload button is not a tab: it has no selected state at all (REQ-NAV-002).
        rule.onNodeWithTag("bottom-bar.upload-button").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun `TC-NAV-002 선택된 탭이 없으면 어떤 탭도 selected가 아니다`() {
        show(null)
        tabTags.values.forEach { rule.onNodeWithTag(it).assertIsNotSelected() }
    }

    @Test
    fun `TC-NAV-005 탭을 누르면 그 탭이 보고되고 업로드 버튼은 업로드 콜백만 부르며 선택 표시를 바꾸지 않는다`() {
        show(Tab.Home)
        rule.onNodeWithTag("bottom-bar.tab-record").performClick()
        rule.onNodeWithTag("bottom-bar.tab-home").performClick() // already selected: still reported (re-selection)
        assertEquals(listOf(Tab.Record, Tab.Home), taps)
        rule.onNodeWithTag("bottom-bar.upload-button").performClick()
        assertEquals(1, uploads)
        assertEquals(2, taps.size, "the upload button is not a tab")
        rule.onNodeWithTag("bottom-bar.tab-home").assertIsSelected()
        assertTrue(uploads == 1)
    }
}
