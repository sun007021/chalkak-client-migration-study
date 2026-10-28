package kr.chalkak.feature.settings

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.feature.auth.AccountActions
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.onboarding.DocumentOpenResult
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.LegalDocuments
import kr.chalkak.feature.onboarding.SignatureCardStateHolder
import kr.chalkak.feature.onboarding.TermsKind

/** Settings sections in display order (REQ-SET-001). */
enum class SettingsSection { App, Push, Account, Feedback, Info }

/**
 * Member: all five [sections] in order and [versionText]. Guest: no sections, only the login button (REQ-SET-002).
 * [versionText] is the bare version string without a "v" prefix (open question 4).
 */
data class SettingsUiState(
    val isGuest: Boolean,
    val sections: List<SettingsSection>,
    val showLoginButton: Boolean,
    val versionText: String?,
)

sealed interface SettingsEffect {
    /** Member tapped "피드백 보내기": open the feedback screen. */
    data object OpenFeedback : SettingsEffect

    /** Toast with [copyKey] (guest feedback: `nav.guest.feedback`). */
    data class Toast(val copyKey: String) : SettingsEffect

    /** Terms row tapped and the document can be shown in-app. */
    data class ShowDocument(val kind: TermsKind, val url: String) : SettingsEffect

    /** Document could not be opened (`onb.terms.doc.cannot-open`). */
    data class DocumentCannotOpen(val copyKey: String) : SettingsEffect
}

/**
 * Settings tab (REQ-SET-001..007). Owns no network logic itself: it fans out to the signature card, the push holder
 * and [AccountActions] (logout/withdraw/guest login are delegated, not reimplemented).
 */
class SettingsStateHolder(
    private val scope: CoroutineScope,
    private val mode: HomeMode,
    private val signatureCard: SignatureCardStateHolder,
    private val push: PushSettingsStateHolder,
    private val account: AccountActions,
    private val analytics: AnalyticsTracker,
    private val documents: LegalDocumentOpener,
    private val appVersion: String,
) {
    private val isGuest = mode == HomeMode.Guest

    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    private val _effects = Channel<SettingsEffect>(Channel.BUFFERED)
    val effects: Flow<SettingsEffect> = _effects.receiveAsFlow()

    /**
     * Settings tab became visible: `screen_view(settings)` once, then (members only) the signature GET and the push GET
     * start independently of each other. Guests make no settings API call (REQ-SET-002).
     */
    fun onTabShown() {
        analytics.screenView("settings")
        if (isGuest) return
        signatureCard.onTabShown()
        push.onTabShown()
    }

    /**
     * Signature change flow ended and the user is back on settings. Success: any GET started before the change is
     * discarded and a fresh GET replaces the card (TC-SET-009/011). Failure: nothing changes, an in-flight GET still applies (TC-SET-010).
     */
    fun onSignatureChangeFinished(success: Boolean) {
        if (success) signatureCard.reload()
    }

    /** Member -> [SettingsEffect.OpenFeedback]; guest -> toast `nav.guest.feedback`, no screen (REQ-FDBK-001). */
    fun onFeedbackClicked() {
        _effects.trySend(if (isGuest) SettingsEffect.Toast(SettingsCopyKeys.GUEST_FEEDBACK) else SettingsEffect.OpenFeedback)
    }

    /** Opens the terms/privacy document; when it is shown, `screen_view(terms_of_service | privacy_policy)` once (REQ-SET-006). */
    fun onDocumentClicked(kind: TermsKind) {
        if (isGuest) return
        when (val result = documents.open(LegalDocuments.url(kind))) {
            is DocumentOpenResult.InApp -> {
                analytics.screenView(if (kind == TermsKind.Service) "terms_of_service" else "privacy_policy")
                _effects.trySend(SettingsEffect.ShowDocument(kind, result.url))
            }
            DocumentOpenResult.OpenedExternally -> Unit
            is DocumentOpenResult.CannotOpen -> _effects.trySend(SettingsEffect.DocumentCannotOpen(result.copyKey))
        }
    }

    /** Logout / withdraw rows: delegate to [AccountActions] (confirm dialog first, REQ-SET-007). */
    fun onLogoutClicked() = account.onLogoutClicked()

    fun onWithdrawClicked() = account.onWithdrawClicked()

    /** Guest "로그인" button: delegates to [AccountActions.onGuestSignInClicked]. */
    fun onGuestLoginClicked() = account.onGuestSignInClicked()

    /** Logout / account switch: card and push state are dropped (REQ-SET-020, TC-SET-037). */
    fun onAccountChanged() {
        signatureCard.onAccountChanged()
        push.onAccountChanged()
    }

    /**
     * Tab/screen left: in-flight push saves are cancelled and rolled back, and a withdraw error of the attempt running
     * now shows no toast ([AccountActions] re-arms feedback with every later confirmation).
     */
    fun onScreenGone() {
        push.onScreenGone()
        account.onScreenGone()
    }

    private fun initialState() = SettingsUiState(
        isGuest = isGuest,
        sections = if (isGuest) emptyList() else SettingsSection.entries,
        showLoginButton = isGuest,
        versionText = if (isGuest) null else appVersion,
    )
}
