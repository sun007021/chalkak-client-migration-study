package com.stonefive.chalkak.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.feature.auth.AccountUiState
import kr.chalkak.feature.onboarding.SignatureCardUiState
import kr.chalkak.feature.onboarding.TermsKind
import kr.chalkak.feature.settings.PushSettingsUiState
import kr.chalkak.feature.settings.SettingsUiState

/** User inputs of the settings screen; every default is a no-op so tests set only what they exercise. */
class SettingsCallbacks(
    val onSignatureChange: () -> Unit = {},
    /** "다시 불러오기" of the signature card error. */
    val onSignatureRetry: () -> Unit = {},
    val onPushToggle: (setting: PushSetting, enabled: Boolean) -> Unit = { _, _ -> },
    /** "다시 시도" of the push settings error. */
    val onPushRetry: () -> Unit = {},
    val onFeedback: () -> Unit = {},
    val onTerms: () -> Unit = {},
    val onPrivacy: () -> Unit = {},
    val onLogout: () -> Unit = {},
    val onWithdraw: () -> Unit = {},
    val onGuestLogin: () -> Unit = {},
    /** Confirm / cancel of the logout or withdraw dialog (`AccountUiState.confirm`). */
    val onConfirm: () -> Unit = {},
    val onCancel: () -> Unit = {},
)

/**
 * Stateless settings tab (testids.md `settings.*`). STUB: the implementation lands with the PR.
 *
 * Member: `settings.root`; app section with `settings.signature-card` (title `sign.card.title`, `settings.signature-image` container that
 * wraps [signatureImage] while [SignatureCardUiState.imageUrl] != null, `settings.signature-loading` while loading without an image,
 * `settings.signature-error` + `settings.signature-retry-button` when [signatureLoadFailed], `settings.signature-change-button`);
 * `settings.push-section` with the three `settings.push-*-toggle` switches (enabled = [PushSettingsUiState.switchesEnabled], on = server
 * value), `settings.push-loading` while loading, `settings.push-error` + `settings.push-retry-button` when [pushLoadFailed]; account rows
 * `settings.logout-row` / `settings.withdraw-row`; `settings.feedback-row`; `settings.privacy-row`, `settings.terms-row`,
 * `settings.version-row` with `settings.version-value`. The dialog for [AccountUiState.confirm] is `settings.logout-dialog` or
 * `settings.withdraw-dialog` with `-confirm-button` / `-cancel-button`. Guest: `settings.root` + `settings.login-button` only.
 */
@Composable
fun SettingsScreen(
    state: SettingsUiState,
    signature: SignatureCardUiState,
    signatureLoadFailed: Boolean,
    push: PushSettingsUiState,
    pushLoadFailed: Boolean,
    account: AccountUiState,
    callbacks: SettingsCallbacks,
    signatureImage: RemoteImage,
    modifier: Modifier = Modifier,
) {
    Box(modifier)
}

/**
 * Connects [SettingsScreen] to [holders]. STUB.
 *
 * - shown: `holders.settings.onTabShown()` once per composition; left: `onScreenGone()` (not while the Activity is only recreated);
 *   Activity back in the foreground after a pause: `holders.push.onAppForegrounded()`.
 * - effects: settings (`OpenFeedback` -> [onOpenFeedback], `Toast` -> [showToast], `ShowDocument` -> [onShowDocument],
 *   `DocumentCannotOpen` -> toast), signature card (`Toast` -> [showToast] and the inline error, `GoLogin` -> [onLoginRequired]),
 *   push (`Toast` -> [showToast] and, for the load error, the inline error; `GoLogin` -> [onLoginRequired];
 *   `OpenSystemNotificationSettings` -> [onOpenSystemNotificationSettings]), account (`GoToLogin` -> [onAccountEnded]).
 * - the account toast (`AccountUiState.toastKey`) is shown through [showToast] and then consumed with `account.onToastShown()`.
 * - "변경하기" -> [onChangeSignature]; the signature / push retry buttons call the respective holder's `onTabShown()`.
 */
@Composable
fun SettingsRoute(
    holders: SettingsHolders,
    signatureImage: RemoteImage,
    showToast: (String) -> Unit,
    onOpenFeedback: () -> Unit,
    onChangeSignature: () -> Unit,
    onShowDocument: (kind: TermsKind, url: String) -> Unit,
    onOpenSystemNotificationSettings: () -> Unit,
    onAccountEnded: () -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier)
}
