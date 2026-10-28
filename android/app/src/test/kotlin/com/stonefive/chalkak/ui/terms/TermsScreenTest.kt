package com.stonefive.chalkak.ui.terms

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
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
import kr.chalkak.feature.onboarding.TermsUiState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class TermsScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()

    private fun show(state: TermsUiState) = rule.setContent {
        TestApp(copy) {
            TermsScreen(
                state = state, onAgreeAllClick = {}, onServiceClick = {}, onPrivacyClick = {},
                onServiceViewClick = {}, onPrivacyViewClick = {}, onNextClick = {}, onBackClick = {},
            )
        }
    }

    @Test
    fun `TC-ONB-001 약관 화면은 환영 제목 전체 동의 필수 항목 보기 다음을 copy 문구로 보인다`() {
        show(TermsUiState())
        rule.onNodeWithTag("terms.root").assertIsDisplayed()
        rule.onNodeWithTag("terms.title").assertTextEquals(copy["onb.terms.title"])
        rule.onNodeWithTag("terms.agree-all-checkbox").assertTextContains(copy["onb.terms.agree-all"])
        rule.onNodeWithTag("terms.service-checkbox").assertTextContains(copy["onb.terms.service"])
        rule.onNodeWithTag("terms.privacy-checkbox").assertTextContains(copy["onb.terms.privacy"])
        rule.onNodeWithTag("terms.service-view-button").assertTextEquals(copy["onb.terms.view"])
        rule.onNodeWithTag("terms.privacy-view-button").assertTextEquals(copy["onb.terms.view"])
        rule.onNodeWithTag("terms.next-button").assertTextEquals(copy["onb.terms.next"])
        rule.onNodeWithTag("terms.back-button").assertIsDisplayed()
    }

    @Test
    fun `TC-ONB-002 진입 직후 체크박스는 모두 해제이고 다음은 비활성이다`() {
        show(TermsUiState())
        rule.onNodeWithTag("terms.agree-all-checkbox").assertIsOff()
        rule.onNodeWithTag("terms.service-checkbox").assertIsOff()
        rule.onNodeWithTag("terms.privacy-checkbox").assertIsOff()
        rule.onNodeWithTag("terms.next-button").assertIsNotEnabled()
        rule.onNodeWithTag("terms.service-view-button").assertIsEnabled()
        rule.onNodeWithTag("terms.privacy-view-button").assertIsEnabled()
    }

    @Test
    fun `TC-ONB-005 필수 항목 하나만 선택하면 전체 동의는 해제 표시이고 다음은 비활성이다`() {
        show(TermsUiState(agreeService = true))
        rule.onNodeWithTag("terms.service-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.privacy-checkbox").assertIsOff()
        rule.onNodeWithTag("terms.agree-all-checkbox").assertIsOff()
        rule.onNodeWithTag("terms.next-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-ONB-005 두 필수 항목이 모두 선택되면 전체 동의는 선택 표시이고 다음은 활성이다`() {
        show(TermsUiState(agreeService = true, agreePrivacy = true))
        rule.onNodeWithTag("terms.agree-all-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.next-button").assertIsEnabled()
    }

    @Test
    fun `TC-ONB-002 전체 동의를 누르면 보류 없이 세 체크가 켜지고 다음이 활성이다 holder 연결`() {
        val holder = TermsStateHolder(SignupContext(), RecordingAnalytics())
        rule.setContent {
            TestApp(copy) {
                TermsRoute(holder, LegalDocumentOpener(FakeBrowser()), onGoSignature = {}, onBackToLogin = {})
            }
        }
        rule.onNodeWithTag("terms.next-button").assertIsNotEnabled()
        rule.onNodeWithTag("terms.agree-all-checkbox").performClick()
        rule.onNodeWithTag("terms.agree-all-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.service-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.privacy-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.next-button").assertIsEnabled()
    }

    @Test
    fun `TC-ONB-014 문서 시트를 열었다 닫아도 체크 상태가 유지된다`() {
        val holder = TermsStateHolder(SignupContext(), RecordingAnalytics())
        var signatureEntered = 0
        rule.setContent {
            TestApp(copy) {
                TermsRoute(holder, LegalDocumentOpener(FakeBrowser()), onGoSignature = { signatureEntered++ }, onBackToLogin = {})
            }
        }
        rule.onNodeWithTag("terms.agree-all-checkbox").performClick()

        rule.onNodeWithTag("terms.privacy-view-button").performClick()
        rule.onNodeWithTag("legal-doc.sheet").assertIsDisplayed()
        rule.onNodeWithTag("legal-doc.title").assertTextEquals(copy["onb.terms.doc.title.privacy"])

        rule.onNodeWithTag("legal-doc.close-button").performClick()
        rule.onNodeWithTag("legal-doc.sheet").assertDoesNotExist()
        rule.onNodeWithTag("terms.root").assertIsDisplayed()
        rule.onNodeWithTag("terms.agree-all-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.service-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.privacy-checkbox").assertIsOn()
        rule.onNodeWithTag("terms.next-button").assertIsEnabled()
        assertEquals(0, signatureEntered, "closing the sheet must not move to the signature screen")
    }

    @Test
    fun `TC-ONB-014 서비스 이용약관 보기는 서비스 제목의 시트를 연다`() {
        val holder = TermsStateHolder(SignupContext(), RecordingAnalytics())
        rule.setContent {
            TestApp(copy) { TermsRoute(holder, LegalDocumentOpener(FakeBrowser()), onGoSignature = {}, onBackToLogin = {}) }
        }
        rule.onNodeWithTag("terms.service-view-button").performClick()
        rule.onNodeWithTag("legal-doc.title").assertTextEquals(copy["onb.terms.doc.title.service"])
    }

    @Test
    fun `TC-ONB-017 약관 화면의 뒤로 버튼은 로그인으로 돌아가는 콜백을 호출한다 화면 부분`() {
        val holder = TermsStateHolder(SignupContext().also { it.begin("id-token", "raw") }, RecordingAnalytics())
        var backs = 0
        rule.setContent {
            TestApp(copy) { TermsRoute(holder, LegalDocumentOpener(FakeBrowser()), onGoSignature = {}, onBackToLogin = { backs++ }) }
        }
        rule.onNodeWithTag("terms.back-button").performClick()
        rule.waitForIdle()
        assertEquals(1, backs)
    }
}
