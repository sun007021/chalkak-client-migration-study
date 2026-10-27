package kr.chalkak.feature.settings

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.onboarding.SignatureImages
import kr.chalkak.core.data.onboarding.testing.FakeSignatureRepository
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.core.data.settings.testing.FakeNotificationSettingsRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.auth.AccountActions
import kr.chalkak.feature.auth.AccountEffect
import kr.chalkak.feature.auth.ConfirmKind
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignatureCardEffect
import kr.chalkak.feature.onboarding.SignatureCardStateHolder
import kr.chalkak.feature.onboarding.TermsKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The settings tab as a whole: fan-out to the signature card / push holder / account actions, rows and analytics. */
class SettingsStateHolderTest {
    private class Rig(
        val holder: SettingsStateHolder,
        val signatures: FakeSignatureRepository,
        val push: PushSettingsStateHolder,
        val pushRepo: FakeNotificationSettingsRepository,
        val card: SignatureCardStateHolder,
        val account: AccountActions,
        val auth: FakeAuthRepository,
        val guestFlags: RecordingGuestFlags,
        val analytics: RecordingAnalytics,
        val effects: List<SettingsEffect>,
        val cardEffects: List<SignatureCardEffect>,
        val accountEffects: List<AccountEffect>,
    ) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(mode: HomeMode = HomeMode.Member, version: String = "1.1.1"): Rig {
        val scope = holderScope()
        val signatures = FakeSignatureRepository()
        val pushRepo = FakeNotificationSettingsRepository()
        val auth = FakeAuthRepository()
        val guestFlags = RecordingGuestFlags()
        val analytics = RecordingAnalytics()
        val card = SignatureCardStateHolder(scope, signatures, isGuest = mode == HomeMode.Guest)
        val push = PushSettingsStateHolder(scope, pushRepo, FakeDeviceNotificationSettings())
        val account = AccountActions(scope, auth, guestFlags)
        val holder = SettingsStateHolder(scope, mode, card, push, account, analytics, LegalDocumentOpener(FakeBrowser()), version)
        return Rig(
            holder, signatures, push, pushRepo, card, account, auth, guestFlags, analytics,
            collectAll(holder.effects), collectAll(card.effects), collectAll(account.effects),
        )
    }

    private fun TestScope.show(r: Rig) {
        r.holder.onTabShown()
        advanceUntilIdle()
    }

    private fun images(name: String, thumbnail: Boolean = true) =
        ApiResult.Success(SignatureImages("https://cdn.example.test/$name-original.png", if (thumbnail) "https://cdn.example.test/$name-thumb.png" else null))

    private fun url(name: String) = "https://cdn.example.test/$name-thumb.png"

    // ---- layout / basics --------------------------------------------------------------------

    @Test
    fun `TC-SET-001 a member sees app, push, account, feedback and info sections in that order`() = runTest {
        val r = rig()
        assertFalse(r.state.isGuest)
        assertEquals(
            listOf(SettingsSection.App, SettingsSection.Push, SettingsSection.Account, SettingsSection.Feedback, SettingsSection.Info),
            r.state.sections,
        )
        assertFalse(r.state.showLoginButton)
    }

    @Test
    fun `TC-SET-049 the version row shows the app version string as given`() = runTest {
        val r = rig(version = "1.1.1")
        assertEquals("1.1.1", r.state.versionText)
    }

    @Test
    fun `TC-SET-052 screen_view settings is sent once each time the tab is shown`() = runTest {
        val r = rig()
        show(r)
        assertEquals(listOf("settings"), r.analytics.screens.toList())
        show(r)
        assertEquals(listOf("settings", "settings"), r.analytics.screens.toList())
    }

    // ---- guest ------------------------------------------------------------------------------

    @Test
    fun `TC-SET-008 a guest sees only the login button and no signature or push API is called`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        assertTrue(r.state.isGuest)
        assertTrue(r.state.sections.isEmpty())
        assertTrue(r.state.showLoginButton)
        assertEquals(0, r.signatures.currentCalls)
        assertTrue(r.pushRepo.loadCalls.isEmpty())
        assertTrue(r.pushRepo.updateCalls.isEmpty())
    }

    @Test
    fun `TC-SET-008 the guest login button clears the guest flag and opens login`() = runTest {
        val r = rig(HomeMode.Guest)
        r.holder.onGuestLoginClicked()
        advanceUntilIdle()
        assertEquals(1, r.guestFlags.clearCalls)
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.accountEffects)
    }

    // ---- load fan-out -----------------------------------------------------------------------

    @Test
    fun `TC-SET-002 signature and push loads start independently, neither waits for the other`() = runTest {
        val r = rig()
        val g = gate()
        r.signatures.currentGate = g
        r.holder.onTabShown()
        runCurrent()
        assertEquals(1, r.signatures.currentCalls)
        assertEquals(1, r.pushRepo.loadCalls.size)
        assertTrue(r.push.state.value.switchesEnabled, "push finished while the signature GET is still pending")
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals("https://cdn.example.test/thumbnail.png", r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-002 a failing signature GET does not block the push switches`() = runTest {
        val r = rig()
        r.signatures.currentResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        show(r)
        assertTrue(r.push.state.value.switchesEnabled)
        assertEquals(listOf<SignatureCardEffect>(SignatureCardEffect.Toast("sign.load.error")), r.cardEffects)
    }

    @Test
    fun `TC-SET-002 a failing push GET does not block the signature card`() = runTest {
        val r = rig()
        r.pushRepo.loadResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        r.signatures.currentResults += images("sig")
        show(r)
        assertFalse(r.push.state.value.switchesEnabled)
        assertEquals(url("sig"), r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-051 offline - signature and push are in error states while account, feedback, terms and version still work`() = runTest {
        val r = rig(version = "2.0.0")
        r.signatures.currentResults += networkFailure(NetworkKind.OFFLINE)
        r.pushRepo.loadResults += networkFailure(NetworkKind.OFFLINE)
        show(r)
        assertNull(r.card.state.value.imageUrl)
        assertFalse(r.push.state.value.switchesEnabled)
        assertEquals("2.0.0", r.state.versionText)

        r.holder.onLogoutClicked()
        runCurrent()
        assertEquals(ConfirmKind.Logout, r.account.state.value.confirm?.kind)
        r.holder.onFeedbackClicked()
        r.holder.onDocumentClicked(TermsKind.Service)
        runCurrent()
        assertEquals(
            listOf<SettingsEffect>(
                SettingsEffect.OpenFeedback,
                SettingsEffect.ShowDocument(TermsKind.Service, AppConstants.TERMS_URLS.getValue("service")),
            ),
            r.effects,
        )
    }

    // ---- signature card (SIGN reused) -------------------------------------------------------

    @Test
    fun `TC-SET-003 the card shows the thumbnail and falls back to the original when the thumbnail is null`() = runTest {
        val r = rig()
        r.signatures.currentResults += images("a")
        show(r)
        assertEquals(url("a"), r.card.state.value.imageUrl)
        r.signatures.currentResults += images("b", thumbnail = false)
        show(r)
        assertEquals("https://cdn.example.test/b-original.png", r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-004 showing the tab again keeps the old signature while re-reading and replaces it when the answer comes`() = runTest {
        val r = rig()
        r.signatures.currentResults += images("old")
        show(r)
        val g = gate()
        r.signatures.currentGate = g
        r.signatures.currentResults += images("new")
        r.holder.onTabShown()
        runCurrent()
        assertEquals(url("old"), r.card.state.value.imageUrl)
        assertEquals(2, r.signatures.currentCalls)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(url("new"), r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-005 a failed re-read keeps the visible signature`() = runTest {
        val r = rig()
        r.signatures.currentResults += images("kept")
        show(r)
        r.signatures.currentResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        show(r)
        assertEquals(url("kept"), r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-006 a failed first load shows the load error and showing the tab again retries`() = runTest {
        val r = rig()
        r.signatures.currentResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        show(r)
        assertNull(r.card.state.value.imageUrl)
        assertEquals(listOf<SignatureCardEffect>(SignatureCardEffect.Toast("sign.load.error")), r.cardEffects)
        assertEquals("사인을 불러오지 못했어요. 다시 시도해 주세요.", Copy["sign.load.error"])
        r.signatures.currentResults += images("again")
        show(r)
        assertEquals(2, r.signatures.currentCalls)
        assertEquals(url("again"), r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-007 showing the tab again while the signature GET is in flight sends no second request`() = runTest {
        val r = rig()
        val g = gate()
        r.signatures.currentGate = g
        r.holder.onTabShown()
        r.holder.onTabShown()
        runCurrent()
        r.holder.onTabShown()
        runCurrent()
        assertEquals(1, r.signatures.currentCalls)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.signatures.currentCalls)
    }

    @Test
    fun `TC-SET-009 a GET started before a successful change is not applied when it answers late`() = runTest {
        val r = rig()
        val g = gate()
        r.signatures.currentGate = g
        // Results are taken after the gate: the fresh GET (no gate) takes the first one, the late stale GET the second.
        r.signatures.currentResults += images("fresh")
        r.signatures.currentResults += images("stale")
        r.holder.onTabShown()
        runCurrent()
        r.signatures.currentGate = null
        r.holder.onSignatureChangeFinished(success = true)
        runCurrent()
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(url("fresh"), r.card.state.value.imageUrl)
        assertFalse(r.card.state.value.loading)
    }

    @Test
    fun `TC-SET-010 a GET started before a failed change is still applied when it answers`() = runTest {
        val r = rig()
        val g = gate()
        r.signatures.currentGate = g
        r.signatures.currentResults += images("loaded")
        r.holder.onTabShown()
        runCurrent()
        r.holder.onSignatureChangeFinished(success = false)
        runCurrent()
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(url("loaded"), r.card.state.value.imageUrl)
        assertEquals(1, r.signatures.currentCalls, "a failed change triggers no extra GET")
    }

    @Test
    fun `TC-SET-011 after a successful change the card re-reads with GET and shows its thumbnail, not an uploaded original URL`() = runTest {
        val r = rig()
        r.signatures.currentResults += images("before")
        show(r)
        r.signatures.currentResults += images("after")
        r.holder.onSignatureChangeFinished(success = true)
        advanceUntilIdle()
        assertEquals(2, r.signatures.currentCalls)
        assertEquals(url("after"), r.card.state.value.imageUrl)
    }

    @Test
    fun `TC-SET-012 a signature GET that ends in 401 goes to login`() = runTest {
        val r = rig()
        r.signatures.currentResults += httpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        show(r)
        assertEquals(listOf<SignatureCardEffect>(SignatureCardEffect.GoLogin), r.cardEffects)
    }

    // ---- account switch ---------------------------------------------------------------------

    @Test
    fun `TC-SET-037 after another account logs in nothing of the previous account is shown and everything is read anew`() = runTest {
        val r = rig()
        r.signatures.currentResults += images("alice")
        r.pushRepo.loadResults += ApiResult.Success(NotificationSettings(topic = false, moderation = true, aiReview = true))
        show(r)
        assertEquals(false, r.push.state.value.values[PushSetting.Topic])

        r.holder.onAccountChanged()
        runCurrent()
        assertNull(r.card.state.value.imageUrl)
        assertTrue(r.push.state.value.values.isEmpty())

        r.signatures.currentResults += images("bob")
        r.pushRepo.loadResults += ApiResult.Success(FakeNotificationSettingsRepository.ALL_ON)
        show(r)
        assertEquals(2, r.signatures.currentCalls)
        assertEquals(2, r.pushRepo.loadCalls.size)
        assertEquals(url("bob"), r.card.state.value.imageUrl)
        assertEquals(true, r.push.state.value.values[PushSetting.Topic])
    }

    // ---- account rows (delegated to AccountActions) -----------------------------------------

    @Test
    fun `TC-SET-042 cancelling the logout dialog makes no API call and keeps settings`() = runTest {
        val r = rig()
        r.holder.onLogoutClicked()
        runCurrent()
        val dialog = r.account.state.value.confirm
        assertEquals(ConfirmKind.Logout, dialog?.kind)
        assertEquals("정말 로그아웃 하시겠습니까?", Copy[dialog!!.messageKey])
        r.account.onConfirmCancelled()
        advanceUntilIdle()
        assertNull(r.account.state.value.confirm)
        assertEquals(0, r.auth.logoutCalls)
        assertTrue(r.accountEffects.isEmpty())
    }

    @Test
    fun `TC-SET-043 confirming logout logs out once and opens the login screen`() = runTest {
        val r = rig()
        r.holder.onLogoutClicked()
        runCurrent()
        r.account.onConfirmed()
        advanceUntilIdle()
        assertEquals(1, r.auth.logoutCalls)
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.accountEffects)
    }

    @Test
    fun `TC-SET-045 cancelling the withdraw dialog makes no DELETE call`() = runTest {
        val r = rig()
        r.holder.onWithdrawClicked()
        runCurrent()
        val dialog = r.account.state.value.confirm
        assertEquals(ConfirmKind.Withdraw, dialog?.kind)
        assertEquals("정말 회원탈퇴 하시겠습니까?", Copy[dialog!!.messageKey])
        r.account.onConfirmCancelled()
        advanceUntilIdle()
        assertEquals(0, r.auth.withdrawCalls)
    }

    @Test
    fun `TC-SET-046 a successful withdrawal opens login, a failed one stays on settings with the error toast`() = runTest {
        val ok = rig()
        ok.holder.onWithdrawClicked()
        runCurrent()
        ok.account.onConfirmed()
        advanceUntilIdle()
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), ok.accountEffects)

        val failed = rig()
        failed.auth.withdrawResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        failed.holder.onWithdrawClicked()
        runCurrent()
        failed.account.onConfirmed()
        advanceUntilIdle()
        assertTrue(failed.accountEffects.isEmpty())
        assertEquals("auth.withdraw.error", failed.account.state.value.toastKey)
        assertEquals("요청을 처리하지 못했어요. 다시 시도해 주세요.", Copy["auth.withdraw.error"])
    }

    // ---- documents / feedback entry ---------------------------------------------------------

    @Test
    fun `TC-SET-047 the privacy row shows the privacy document and sends screen_view privacy_policy once`() = runTest {
        val r = rig()
        r.holder.onDocumentClicked(TermsKind.Privacy)
        runCurrent()
        assertEquals(
            listOf<SettingsEffect>(SettingsEffect.ShowDocument(TermsKind.Privacy, AppConstants.TERMS_URLS.getValue("privacy"))),
            r.effects,
        )
        assertEquals(listOf("privacy_policy"), r.analytics.screens.toList())
    }

    @Test
    fun `TC-SET-047 the terms row shows the service document and sends screen_view terms_of_service once`() = runTest {
        val r = rig()
        r.holder.onDocumentClicked(TermsKind.Service)
        runCurrent()
        assertEquals(
            listOf<SettingsEffect>(SettingsEffect.ShowDocument(TermsKind.Service, AppConstants.TERMS_URLS.getValue("service"))),
            r.effects,
        )
        assertEquals(listOf("terms_of_service"), r.analytics.screens.toList())
    }

    @Test
    fun `TC-SET-050 a member tapping send feedback opens the feedback screen`() = runTest {
        val r = rig()
        r.holder.onFeedbackClicked()
        runCurrent()
        assertEquals(listOf<SettingsEffect>(SettingsEffect.OpenFeedback), r.effects)
    }

    @Test
    fun `TC-FDBK-001 opening feedback from settings does not itself send screen_view feedback (the feedback screen does)`() = runTest {
        val r = rig()
        r.holder.onFeedbackClicked()
        runCurrent()
        assertFalse("feedback" in r.analytics.screens)
    }

    @Test
    fun `TC-FDBK-035 a guest tapping feedback gets the guest toast and no screen`() = runTest {
        val r = rig(HomeMode.Guest)
        r.holder.onFeedbackClicked()
        runCurrent()
        assertEquals(listOf<SettingsEffect>(SettingsEffect.Toast("nav.guest.feedback")), r.effects)
        assertEquals("피드백을 보내려면 로그인이 필요해요", Copy["nav.guest.feedback"])
        assertFalse("feedback" in r.analytics.screens)
    }

    @Test
    fun `leaving the settings tab does not mute the withdraw error toast of a later attempt`() = runTest {
        val r = rig()
        show(r)
        r.holder.onScreenGone()
        r.holder.onTabShown()
        advanceUntilIdle()
        r.auth.withdrawResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        r.holder.onWithdrawClicked()
        r.account.onConfirmed()
        advanceUntilIdle()
        assertEquals("auth.withdraw.error", r.account.state.value.toastKey)
    }

    @Test
    fun `leaving the settings tab while a withdraw runs shows no error toast for it`() = runTest {
        val r = rig()
        show(r)
        r.auth.withdrawResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        r.holder.onWithdrawClicked()
        r.account.onConfirmed()
        r.holder.onScreenGone()
        advanceUntilIdle()
        assertNull(r.account.state.value.toastKey)
    }
}
