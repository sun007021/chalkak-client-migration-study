package com.stonefive.chalkak.ui.terms

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FakeBrowser
import com.stonefive.chalkak.testing.RecordingAnalytics
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.TermsStateHolder
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class LegalDocSheetTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private var retries = 0
    private var closes = 0

    private fun show(load: LegalDocLoad) = rule.setContent {
        TestApp(copy) { LegalDocSheet(title = "doc", load = load, onClose = { closes++ }, onRetry = { retries++ }) }
    }

    @Test
    fun `TC-ONB-012 문서 로딩 실패 시트는 오류 문구와 다시 시도 버튼을 보인다`() {
        show(LegalDocLoad.Failed)
        rule.onNodeWithTag("legal-doc.sheet").assertIsDisplayed()
        rule.onNodeWithTag("legal-doc.error-state").assertTextEquals(copy["onb.terms.doc.error"])
        rule.onNodeWithTag("legal-doc.retry-button").assertTextEquals(copy["onb.terms.doc.retry"])
        rule.onNodeWithTag("legal-doc.loading").assertDoesNotExist()
    }

    @Test
    fun `TC-ONB-012 다시 시도를 누르면 재시도 콜백이 한 번 호출된다`() {
        show(LegalDocLoad.Failed)
        rule.onNodeWithTag("legal-doc.retry-button").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun `TC-ONB-012 로딩 중에는 진행 표시만 있고 오류 상태는 트리에 없다`() {
        show(LegalDocLoad.Loading)
        rule.onNodeWithTag("legal-doc.loading").assertIsDisplayed()
        rule.onNodeWithTag("legal-doc.error-state").assertDoesNotExist()
        rule.onNodeWithTag("legal-doc.retry-button").assertDoesNotExist()
    }

    @Test
    fun `TC-ONB-012 로드가 끝나면 진행 표시도 오류도 없고 닫기 버튼은 닫기 콜백을 부른다`() {
        show(LegalDocLoad.Loaded)
        rule.onNodeWithTag("legal-doc.loading").assertDoesNotExist()
        rule.onNodeWithTag("legal-doc.error-state").assertDoesNotExist()
        rule.onNodeWithTag("legal-doc.close-button").performClick()
        assertEquals(1, closes)
    }

    @Test
    fun `TC-ONB-012 약관 화면에서 문서 로딩이 실패하면 오류가 보이고 다시 시도가 웹 본문을 다시 불러온다`() {
        val holder = TermsStateHolder(SignupContext(), RecordingAnalytics())
        var loads = 0
        rule.setContent {
            TestApp(copy) {
                TermsRoute(
                    holder, LegalDocumentOpener(FakeBrowser()), onGoSignature = {}, onBackToLogin = {},
                    legalWeb = { _, onLoaded, onFailed ->
                        // The slot is composed afresh for every load attempt; the first attempt fails, the next succeeds.
                        LaunchedEffect(Unit) { if (++loads == 1) onFailed() else onLoaded() }
                        Box(Modifier.size(20.dp))
                    },
                )
            }
        }
        rule.onNodeWithTag("terms.service-view-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("legal-doc.error-state").assertTextEquals(copy["onb.terms.doc.error"])

        rule.onNodeWithTag("legal-doc.retry-button").performClick()
        rule.waitForIdle()
        assertEquals(2, loads, "retry must load the document again")
        rule.onNodeWithTag("legal-doc.error-state").assertDoesNotExist()
        rule.onNodeWithTag("legal-doc.loading").assertDoesNotExist()
        rule.onNodeWithTag("legal-doc.web-content").assertIsDisplayed()
    }
}
