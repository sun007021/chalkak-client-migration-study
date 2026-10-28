package com.stonefive.chalkak.ui.settings

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.TEST_APP_VERSION
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.feature.auth.AccountUiState
import kr.chalkak.feature.auth.ConfirmDialog
import kr.chalkak.feature.auth.ConfirmKind
import kr.chalkak.feature.onboarding.SignatureCardUiState
import kr.chalkak.feature.settings.NotificationPermission
import kr.chalkak.feature.settings.PushSettingsUiState
import kr.chalkak.feature.settings.SettingsSection
import kr.chalkak.feature.settings.SettingsUiState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Stateless [SettingsScreen] (A9). States are built from the holders' own state types; the screen draws what it is given.
 * A tall window shows every row without scrolling.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class SettingsScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val images = ImageProbe()
    private val calls = CopyOnWriteArrayList<String>()

    private val member = SettingsUiState(
        isGuest = false,
        sections = SettingsSection.entries,
        showLoginButton = false,
        versionText = TEST_APP_VERSION,
    )
    private val guest = SettingsUiState(isGuest = true, sections = emptyList(), showLoginButton = true, versionText = null)
    private val allOn = mapOf(PushSetting.Topic to true, PushSetting.Moderation to true, PushSetting.AiReview to true)
    private val loaded = PushSettingsUiState(values = allOn)

    private val callbacks = SettingsCallbacks(
        onSignatureChange = { calls += "signature-change" },
        onSignatureRetry = { calls += "signature-retry" },
        onPushToggle = { setting, enabled -> calls += "toggle:${setting.name}:$enabled" },
        onPushRetry = { calls += "push-retry" },
        onFeedback = { calls += "feedback" },
        onTerms = { calls += "terms" },
        onPrivacy = { calls += "privacy" },
        onLogout = { calls += "logout" },
        onWithdraw = { calls += "withdraw" },
        onGuestLogin = { calls += "guest-login" },
        onConfirm = { calls += "confirm" },
        onCancel = { calls += "cancel" },
    )

    private fun show(
        state: SettingsUiState = member,
        signature: SignatureCardUiState = SignatureCardUiState(imageUrl = "https://cdn.example.test/sig-thumb.png"),
        signatureLoadFailed: Boolean = false,
        push: PushSettingsUiState = loaded,
        pushLoadFailed: Boolean = false,
        account: AccountUiState = AccountUiState(),
    ) = rule.setContent {
        TestApp(copy) {
            SettingsScreen(
                state = state,
                signature = signature,
                signatureLoadFailed = signatureLoadFailed,
                push = push,
                pushLoadFailed = pushLoadFailed,
                account = account,
                callbacks = callbacks,
                signatureImage = images.slot,
            )
        }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun top(t: String) = tag(t).fetchSemanticsNode().boundsInRoot.top

    private val memberTags = listOf(
        "settings.signature-card", "settings.push-section", "settings.push-topic-toggle", "settings.push-moderation-toggle",
        "settings.push-ai-toggle", "settings.logout-row", "settings.withdraw-row", "settings.feedback-row", "settings.privacy-row",
        "settings.terms-row", "settings.version-row",
    )

    // ---- 구성 (SET-001, 039, REQ-SET-002) ----------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-001 회원의 설정 화면은 사인 카드 푸시 토글 3개 계정 피드백 정보 및 약관을 이 순서로 보인다`() {
        show()
        tag("settings.root").assertIsDisplayed()
        memberTags.forEach { tag(it).assertIsDisplayed() }
        tag("settings.login-button").assertDoesNotExist()

        listOf("settings.section.app", "settings.section.push", "settings.section.account", "settings.section.feedback", "settings.section.info")
            .forEach { rule.onNodeWithText(copy[it]).assertIsDisplayed() }
        rule.onNodeWithText(copy["sign.card.title"]).assertIsDisplayed()
        tag("settings.logout-row").assertShowsAll(copy["settings.row.logout"])
        tag("settings.withdraw-row").assertShowsAll(copy["settings.row.withdraw"])
        tag("settings.feedback-row").assertShowsAll(copy["settings.row.feedback"])
        tag("settings.privacy-row").assertShowsAll(copy["settings.row.privacy"])
        tag("settings.terms-row").assertShowsAll(copy["settings.row.terms"])
        tag("settings.version-row").assertShowsAll(copy["settings.row.version"])

        val order = listOf(
            "settings.signature-card", "settings.push-section", "settings.logout-row", "settings.withdraw-row",
            "settings.feedback-row", "settings.privacy-row", "settings.terms-row", "settings.version-row",
        )
        val tops = order.map(::top)
        assertEquals(tops.sorted(), tops, "sections must be listed top to bottom in this order: $order")
    }

    @Test
    fun `REQ-SET-002 게스트의 설정 화면은 로그인 버튼만 보이고 나머지 행은 없다`() {
        show(state = guest, signature = SignatureCardUiState(), push = PushSettingsUiState())
        tag("settings.root").assertIsDisplayed()
        tag("settings.login-button").assertIsDisplayed().assertTextEquals(copy["settings.guest.login"]).performClick()
        assertEquals(listOf("guest-login"), calls.toList())
        memberTags.forEach { tag(it).assertDoesNotExist() }
        tag("settings.version-value").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-039 OS 권한 상태 행은 없고 서버 토글 3개만 있다`() {
        show(push = loaded.copy(devicePermission = NotificationPermission.Denied))
        rule.onAllNodes(isToggleable()).assertCountEquals(3)
        listOf("settings.push-topic-toggle", "settings.push-moderation-toggle", "settings.push-ai-toggle").forEach { tag(it).assertIsDisplayed() }
    }

    // ---- 푸시 토글 (SET-016, 017, 018, 023) -------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-018 토글 라벨은 세 문구이고 상태는 서버 값과 같다`() {
        show(push = loaded)
        tag("settings.push-topic-toggle").assertShowsAll(copy["settings.push.topic"]).assertIsOn()
        tag("settings.push-moderation-toggle").assertShowsAll(copy["settings.push.moderation"]).assertIsOn()
        tag("settings.push-ai-toggle").assertShowsAll(copy["settings.push.ai-review"]).assertIsOn()
    }

    @Test
    fun `TC-SET-018 꺼진 항목은 꺼진 상태로 노출되고 다른 토글은 켜져 있다`() {
        show(push = PushSettingsUiState(values = allOn + (PushSetting.AiReview to false)))
        tag("settings.push-topic-toggle").assertIsOn()
        tag("settings.push-moderation-toggle").assertIsOn()
        tag("settings.push-ai-toggle").assertIsOff()
        listOf("settings.push-topic-toggle", "settings.push-moderation-toggle", "settings.push-ai-toggle").forEach { tag(it).assertIsEnabled() }
    }

    @Test
    fun `TC-SET-017 설정 로드 중에는 토글이 눌리지 않는 상태이고 로딩 표시가 보인다`() {
        show(push = PushSettingsUiState(loading = true))
        tag("settings.push-loading").assertIsDisplayed()
        listOf("settings.push-topic-toggle", "settings.push-moderation-toggle", "settings.push-ai-toggle").forEach { tag(it).assertIsNotEnabled() }
        tag("settings.push-error").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-017 로드가 끝나면 로딩 표시가 사라진다`() {
        show(push = loaded)
        tag("settings.push-loading").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-016 설정 로드 실패면 토글은 비활성이고 오류 문구와 재시도가 보이며 재시도를 누르면 알린다`() {
        show(push = PushSettingsUiState(), pushLoadFailed = true)
        tag("settings.push-error").assertIsDisplayed().assertTextEquals(copy["settings.push.load-error"])
        listOf("settings.push-topic-toggle", "settings.push-moderation-toggle", "settings.push-ai-toggle").forEach { tag(it).assertIsNotEnabled() }
        tag("settings.push-retry-button").assertIsDisplayed().performClick()
        assertEquals(listOf("push-retry"), calls.toList())
    }

    @Test
    fun `TC-SET-023 토글을 누르면 새 값으로 콜백을 부른다`() {
        show(push = loaded)
        tag("settings.push-topic-toggle").performClick()
        tag("settings.push-ai-toggle").performClick()
        assertEquals(listOf("toggle:Topic:false", "toggle:AiReview:false"), calls.toList())
    }

    @Test
    fun `TC-SET-023 꺼진 토글을 누르면 켜는 값으로 콜백을 부른다`() {
        show(push = PushSettingsUiState(values = allOn + (PushSetting.Moderation to false)))
        tag("settings.push-moderation-toggle").performClick()
        assertEquals(listOf("toggle:Moderation:true"), calls.toList())
    }

    // ---- 사인 카드 (SET-003, 006, SIGN-040, 041) --------------------------------------------------------------------------------

    @Test
    fun `TC-SET-003 사인 카드는 받은 이미지 주소를 사인 이미지 자리에 그린다`() {
        show(signature = SignatureCardUiState(imageUrl = "https://cdn.example.test/thumb.png"))
        tag("settings.signature-image").assertIsDisplayed()
        assertTrue("https://cdn.example.test/thumb.png" in images.urls)
        tag("settings.signature-loading").assertDoesNotExist()
        tag("settings.signature-error").assertDoesNotExist()
        tag("settings.signature-change-button").assertIsDisplayed().assertTextEquals(copy["sign.card.change"])
    }

    @Test
    fun `TC-SET-003 다시 불러오는 중에도 보이던 사인을 유지하고 로딩 표시는 이미지가 없을 때만 보인다`() {
        show(signature = SignatureCardUiState(imageUrl = "https://cdn.example.test/kept.png", loading = true))
        tag("settings.signature-image").assertIsDisplayed()
        tag("settings.signature-loading").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-003 이미지가 없고 불러오는 중이면 로딩 표시가 보인다`() {
        show(signature = SignatureCardUiState(loading = true))
        tag("settings.signature-loading").assertIsDisplayed()
        tag("settings.signature-image").assertDoesNotExist()
        tag("settings.signature-error").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-006 최초 사인 조회 실패면 오류 문구와 다시 불러오기가 보이고 누르면 알린다`() {
        show(signature = SignatureCardUiState(), signatureLoadFailed = true)
        tag("settings.signature-error").assertIsDisplayed().assertTextEquals(copy["sign.load.error"])
        tag("settings.signature-retry-button").assertIsDisplayed().performClick()
        assertEquals(listOf("signature-retry"), calls.toList())
        tag("settings.signature-image").assertDoesNotExist()
        tag("settings.signature-change-button").assertIsDisplayed()
    }

    @Test
    fun `TC-SET-006 보이던 사인이 있으면 실패 표시는 사인을 가리지 않는다`() {
        show(signature = SignatureCardUiState(imageUrl = "https://cdn.example.test/kept.png"), signatureLoadFailed = true)
        tag("settings.signature-image").assertIsDisplayed()
        tag("settings.signature-error").assertDoesNotExist()
    }

    @Test
    fun `TC-SIGN-040 사인 재설정이 필요한 상태는 빈 이미지와 변경하기만 보이고 오류 표시는 없다`() {
        show(signature = SignatureCardUiState(needsRegistration = true))
        tag("settings.signature-card").assertIsDisplayed()
        tag("settings.signature-image").assertDoesNotExist()
        tag("settings.signature-error").assertDoesNotExist()
        tag("settings.signature-loading").assertDoesNotExist()
        rule.onNodeWithText(copy["sign.card.title"]).assertIsDisplayed()
        tag("settings.signature-change-button").assertIsDisplayed().assertTextEquals(copy["sign.card.change"]).performClick()
        assertEquals(listOf("signature-change"), calls.toList())
    }

    @Test
    fun `TC-SIGN-041 사인 이미지 로드가 실패해도 카드는 깨지지 않고 변경 버튼이 남는다`() {
        images.fails = { true }
        show(signature = SignatureCardUiState(imageUrl = "https://cdn.example.test/broken.png"))
        tag("settings.signature-card").assertIsDisplayed()
        tag("settings.signature-image").assertIsDisplayed()
        tag("settings.signature-change-button").assertIsDisplayed()
        tag("settings.signature-error").assertDoesNotExist()
        tag("settings.push-section").assertIsDisplayed()
    }

    // ---- 행 (SET-049, REQ-SET-005) ---------------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-049 버전정보 행은 받은 버전 문자열을 그대로 보이고 눌러도 동작이 없다`() {
        show()
        tag("settings.version-value").assertIsDisplayed().assertTextEquals(TEST_APP_VERSION)
        tag("settings.version-row").assertHasNoClickAction()
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `행을 누르면 각 콜백을 한 번씩 부른다`() {
        show()
        tag("settings.feedback-row").performClick()
        tag("settings.terms-row").performClick()
        tag("settings.privacy-row").performClick()
        tag("settings.logout-row").performClick()
        tag("settings.withdraw-row").performClick()
        tag("settings.signature-change-button").performClick()
        assertEquals(listOf("feedback", "terms", "privacy", "logout", "withdraw", "signature-change"), calls.toList())
    }

    // ---- 확인 다이얼로그 (SET-041, 044) ----------------------------------------------------------------------------------------

    private val logoutConfirm = ConfirmDialog(ConfirmKind.Logout, "auth.logout.confirm.message", "auth.logout.confirm.ok", "auth.confirm.cancel")
    private val withdrawConfirm = ConfirmDialog(ConfirmKind.Withdraw, "auth.withdraw.confirm.message", "auth.withdraw.confirm.ok", "auth.confirm.cancel")

    @Test
    fun `TC-SET-041 로그아웃 확인 다이얼로그는 문구와 확인 취소 버튼을 보인다`() {
        show(account = AccountUiState(confirm = logoutConfirm))
        tag("settings.logout-dialog").assertIsDisplayed().assertShowsAll(copy["auth.logout.confirm.message"])
        assertEquals("정말 로그아웃 하시겠습니까?", copy["auth.logout.confirm.message"])
        tag("settings.logout-confirm-button").assertIsDisplayed().assertTextEquals(copy["auth.logout.confirm.ok"]).performClick()
        tag("settings.logout-cancel-button").assertIsDisplayed().assertTextEquals(copy["auth.confirm.cancel"]).performClick()
        assertEquals(listOf("confirm", "cancel"), calls.toList())
        tag("settings.withdraw-dialog").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-044 회원탈퇴 확인 다이얼로그는 로그아웃과 다른 문구와 버튼 이름을 보인다`() {
        show(account = AccountUiState(confirm = withdrawConfirm))
        tag("settings.withdraw-dialog").assertIsDisplayed().assertShowsAll(copy["auth.withdraw.confirm.message"])
        assertEquals("정말 회원탈퇴 하시겠습니까?", copy["auth.withdraw.confirm.message"])
        tag("settings.withdraw-confirm-button").assertIsDisplayed().assertTextEquals(copy["auth.withdraw.confirm.ok"]).performClick()
        tag("settings.withdraw-cancel-button").assertIsDisplayed().assertTextEquals(copy["auth.confirm.cancel"]).performClick()
        assertEquals(listOf("confirm", "cancel"), calls.toList())
        tag("settings.logout-dialog").assertDoesNotExist()
        assertTrue(copy["auth.withdraw.confirm.message"] != copy["auth.logout.confirm.message"])
    }

    @Test
    fun `TC-SET-041 확인할 것이 없으면 두 다이얼로그 모두 없다`() {
        show(account = AccountUiState())
        tag("settings.logout-dialog").assertDoesNotExist()
        tag("settings.withdraw-dialog").assertDoesNotExist()
    }

    @Test
    fun `TC-SET-044 처리 중에는 회원탈퇴 확인 버튼이 비활성이다`() {
        show(account = AccountUiState(confirm = withdrawConfirm, busy = true))
        tag("settings.withdraw-confirm-button").assertIsNotEnabled()
    }
}
