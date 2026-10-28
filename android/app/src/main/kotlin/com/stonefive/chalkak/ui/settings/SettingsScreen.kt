package com.stonefive.chalkak.ui.settings

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.BlockingLayer
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.feature.auth.AccountEffect
import kr.chalkak.feature.auth.AccountUiState
import kr.chalkak.feature.auth.ConfirmDialog
import kr.chalkak.feature.auth.ConfirmKind
import kr.chalkak.feature.onboarding.OnbCopyKeys
import kr.chalkak.feature.onboarding.SignatureCardEffect
import kr.chalkak.feature.onboarding.SignatureCardUiState
import kr.chalkak.feature.onboarding.TermsKind
import kr.chalkak.feature.settings.PushSettingsEffect
import kr.chalkak.feature.settings.PushSettingsUiState
import kr.chalkak.feature.settings.SettingsCopyKeys
import kr.chalkak.feature.settings.SettingsEffect
import kr.chalkak.feature.settings.SettingsSection
import kr.chalkak.feature.settings.SettingsUiState

private val ScreenPadding = 20.dp
private val RowMinHeight = 48.dp

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
 * Stateless settings tab (testids.md `settings.*`).
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
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Box(modifier.fillMaxSize().background(colors.background).testTag("settings.root")) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ScreenPadding, vertical = 8.dp),
        ) {
            if (state.showLoginButton) {
                ChalkakOutlinedButton(
                    text = copy["settings.guest.login"],
                    onClick = callbacks.onGuestLogin,
                    modifier = Modifier.fillMaxWidth().padding(top = 48.dp).testTag("settings.login-button"),
                )
            }
            state.sections.forEach { section ->
                when (section) {
                    SettingsSection.App -> {
                        SectionTitle(copy["settings.section.app"])
                        SignatureCard(signature, signatureLoadFailed, callbacks, signatureImage)
                    }
                    SettingsSection.Push -> {
                        SectionTitle(copy["settings.section.push"])
                        PushSection(push, pushLoadFailed, callbacks)
                    }
                    SettingsSection.Account -> {
                        SectionTitle(copy["settings.section.account"])
                        ActionRow(copy["settings.row.logout"], callbacks.onLogout, "settings.logout-row", chevron = false)
                        ActionRow(copy["settings.row.withdraw"], callbacks.onWithdraw, "settings.withdraw-row", chevron = false)
                    }
                    SettingsSection.Feedback -> {
                        SectionTitle(copy["settings.section.feedback"])
                        ActionRow(copy["settings.row.feedback"], callbacks.onFeedback, "settings.feedback-row")
                    }
                    SettingsSection.Info -> {
                        SectionTitle(copy["settings.section.info"])
                        ActionRow(copy["settings.row.privacy"], callbacks.onPrivacy, "settings.privacy-row")
                        ActionRow(copy["settings.row.terms"], callbacks.onTerms, "settings.terms-row")
                        VersionRow(state.versionText)
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
        account.confirm?.let { dialog -> ConfirmDialogCard(dialog, account.busy, callbacks) }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = ChalkakTheme.colors.textInactive,
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 8.dp),
    )
}

@Composable
private fun SignatureCard(
    signature: SignatureCardUiState,
    failed: Boolean,
    callbacks: SettingsCallbacks,
    signatureImage: RemoteImage,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.inputBackground)
            .padding(16.dp)
            .testTag("settings.signature-card"),
    ) {
        Text(copy["sign.card.title"], style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
        val url = signature.imageUrl
        Spacer(Modifier.height(12.dp))
        when {
            url != null -> Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(2.2f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.actionPrimary)
                    .testTag("settings.signature-image"),
                contentAlignment = Alignment.Center,
            ) { signatureImage(url, Modifier.fillMaxSize().padding(8.dp)) }
            failed -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = copy[OnbCopyKeys.SIGN_LOAD_ERROR],
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.destructive,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("settings.signature-error"),
                )
                TextButton(
                    onClick = callbacks.onSignatureRetry,
                    modifier = Modifier.heightIn(min = RowMinHeight).testTag("settings.signature-retry-button"),
                ) {
                    Text(copy["common.retry"], color = colors.textPrimary, style = MaterialTheme.typography.titleSmall)
                }
            }
            signature.loading -> Box(Modifier.fillMaxWidth().height(RowMinHeight), contentAlignment = Alignment.Center) {
                Loading(Modifier.testTag("settings.signature-loading"))
            }
        }
        Spacer(Modifier.height(12.dp))
        ChalkakOutlinedButton(
            text = copy["sign.card.change"],
            onClick = callbacks.onSignatureChange,
            modifier = Modifier.fillMaxWidth().testTag("settings.signature-change-button"),
        )
    }
}

@Composable
private fun PushSection(push: PushSettingsUiState, failed: Boolean, callbacks: SettingsCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(Modifier.fillMaxWidth().testTag("settings.push-section")) {
        PushToggleRow(copy["settings.push.topic"], PushSetting.Topic, "settings.push-topic-toggle", push, callbacks)
        PushToggleRow(copy["settings.push.moderation"], PushSetting.Moderation, "settings.push-moderation-toggle", push, callbacks)
        PushToggleRow(copy["settings.push.ai-review"], PushSetting.AiReview, "settings.push-ai-toggle", push, callbacks)
        if (push.loading) {
            Box(Modifier.fillMaxWidth().height(RowMinHeight), contentAlignment = Alignment.Center) {
                Loading(Modifier.testTag("settings.push-loading"))
            }
        }
        if (failed && !push.loading) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = copy[SettingsCopyKeys.PUSH_LOAD_ERROR],
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.destructive,
                    modifier = Modifier.weight(1f).testTag("settings.push-error"),
                )
                TextButton(
                    onClick = callbacks.onPushRetry,
                    modifier = Modifier.heightIn(min = RowMinHeight).testTag("settings.push-retry-button"),
                ) {
                    Text(copy["common.retry"], color = colors.textPrimary, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

@Composable
private fun PushToggleRow(label: String, setting: PushSetting, tag: String, push: PushSettingsUiState, callbacks: SettingsCallbacks) {
    val colors = ChalkakTheme.colors
    val checked = push.values[setting] == true
    val enabled = push.switchesEnabled
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = RowMinHeight)
            .testTag(tag)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = { callbacks.onPushToggle(setting, it) }),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (enabled) colors.textPrimary else colors.textInactive,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedTrackColor = colors.actionPrimary,
                checkedThumbColor = Color.White,
                uncheckedTrackColor = colors.border,
                uncheckedThumbColor = Color.White,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

@Composable
private fun ActionRow(text: String, onClick: () -> Unit, tag: String, chevron: Boolean = true) {
    val colors = ChalkakTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = RowMinHeight)
            .testTag(tag)
            .clickable(role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.bodyLarge, color = colors.textPrimary, modifier = Modifier.weight(1f))
        if (chevron) Image(painter = painterResource(R.drawable.ic_chevron_right), contentDescription = null, modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun VersionRow(version: String?) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = RowMinHeight).testTag("settings.version-row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(copy["settings.row.version"], style = MaterialTheme.typography.bodyLarge, color = colors.textPrimary, modifier = Modifier.weight(1f))
        if (version != null) {
            Text(version, style = MaterialTheme.typography.bodyMedium, color = colors.textNeutral, modifier = Modifier.testTag("settings.version-value"))
        }
    }
}

@Composable
private fun ConfirmDialogCard(dialog: ConfirmDialog, busy: Boolean, callbacks: SettingsCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val prefix = if (dialog.kind == ConfirmKind.Logout) "settings.logout" else "settings.withdraw"
    BackHandler(onBack = callbacks.onCancel)
    BlockingLayer(scrim = Color(0x66000000)) {
        Column(
            Modifier
                .padding(horizontal = 36.dp)
                .fillMaxWidth()
                .background(colors.inputBackground, RoundedCornerShape(20.dp))
                .padding(start = 24.dp, top = 24.dp, end = 24.dp, bottom = 12.dp)
                .testTag("$prefix-dialog"),
        ) {
            Text(copy[dialog.messageKey], style = MaterialTheme.typography.bodyMedium, color = colors.textPrimary)
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = callbacks.onCancel, modifier = Modifier.testTag("$prefix-cancel-button")) {
                    Text(copy[dialog.cancelKey], color = colors.textPrimary, style = MaterialTheme.typography.titleSmall)
                }
                TextButton(onClick = callbacks.onConfirm, enabled = !busy, modifier = Modifier.testTag("$prefix-confirm-button")) {
                    Text(
                        copy[dialog.okKey],
                        color = if (busy) colors.textInactive else colors.destructive,
                        style = MaterialTheme.typography.titleSmall,
                    )
                }
            }
        }
    }
}

/**
 * Connects [SettingsScreen] to [holders].
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
    val copy = LocalCopy.current
    val settings = holders.settings
    val state by settings.state.collectAsState()
    val signature by holders.signatureCard.state.collectAsState()
    val push by holders.push.state.collectAsState()
    val account by holders.account.state.collectAsState()
    val latestToast by rememberUpdatedState(showToast)
    val latestFeedback by rememberUpdatedState(onOpenFeedback)
    val latestDocument by rememberUpdatedState(onShowDocument)
    val latestSystem by rememberUpdatedState(onOpenSystemNotificationSettings)
    val latestEnded by rememberUpdatedState(onAccountEnded)
    val latestLogin by rememberUpdatedState(onLoginRequired)
    val latestChange by rememberUpdatedState(onChangeSignature)

    LaunchedEffect(settings) {
        settings.effects.collect { effect ->
            when (effect) {
                SettingsEffect.OpenFeedback -> latestFeedback()
                is SettingsEffect.Toast -> latestToast(copy[effect.copyKey])
                is SettingsEffect.ShowDocument -> latestDocument(effect.kind, effect.url)
                is SettingsEffect.DocumentCannotOpen -> latestToast(copy[effect.copyKey])
            }
        }
    }
    LaunchedEffect(holders.signatureCard) {
        holders.signatureCard.effects.collect { effect ->
            when (effect) {
                is SignatureCardEffect.Toast -> {
                    holders.signatureLoadFailed = true
                    latestToast(copy[effect.copyKey])
                }
                SignatureCardEffect.GoLogin -> latestLogin()
            }
        }
    }
    LaunchedEffect(holders.push) {
        holders.push.effects.collect { effect ->
            when (effect) {
                is PushSettingsEffect.Toast -> {
                    if (effect.copyKey == SettingsCopyKeys.PUSH_LOAD_ERROR) holders.pushLoadFailed = true
                    latestToast(copy[effect.copyKey])
                }
                PushSettingsEffect.GoLogin -> latestLogin()
                PushSettingsEffect.OpenSystemNotificationSettings -> latestSystem()
            }
        }
    }
    LaunchedEffect(holders.account) {
        holders.account.effects.collect { effect ->
            when (effect) {
                AccountEffect.GoToLogin -> latestEnded()
            }
        }
    }
    // The inline errors stand until the next load starts or data arrives.
    LaunchedEffect(signature.loading, signature.imageUrl, signature.needsRegistration) {
        if (signature.loading || signature.imageUrl != null || signature.needsRegistration) holders.signatureLoadFailed = false
    }
    LaunchedEffect(push.loading, push.values) {
        if (push.loading || push.values.isNotEmpty()) holders.pushLoadFailed = false
    }
    LaunchedEffect(account.toastId) {
        val key = account.toastKey
        if (key != null) {
            latestToast(copy[key])
            holders.account.onToastShown()
        }
    }
    LaunchedEffect(settings) { settings.onTabShown() }
    ScreenGoneEffect(settings) { settings.onScreenGone() }
    ForegroundEffect(holders.push::onAppForegrounded)

    val callbacks = remember(holders) {
        SettingsCallbacks(
            onSignatureChange = { latestChange() },
            onSignatureRetry = holders.signatureCard::onTabShown,
            onPushToggle = holders.push::onToggled,
            onPushRetry = holders.push::onTabShown,
            onFeedback = settings::onFeedbackClicked,
            onTerms = { settings.onDocumentClicked(TermsKind.Service) },
            onPrivacy = { settings.onDocumentClicked(TermsKind.Privacy) },
            onLogout = settings::onLogoutClicked,
            onWithdraw = settings::onWithdrawClicked,
            onGuestLogin = settings::onGuestLoginClicked,
            onConfirm = holders.account::onConfirmed,
            onCancel = holders.account::onConfirmCancelled,
        )
    }
    SettingsScreen(
        state = state,
        signature = signature,
        signatureLoadFailed = holders.signatureLoadFailed,
        push = push,
        pushLoadFailed = holders.pushLoadFailed,
        account = account,
        callbacks = callbacks,
        signatureImage = signatureImage,
        modifier = modifier,
    )
}

/** Calls [onForeground] when the Activity comes back after having been paused (not for the resume that follows the first show). */
@Composable
private fun ForegroundEffect(onForeground: () -> Unit) {
    val owner = LocalActivity.current as? LifecycleOwner ?: return
    val latest by rememberUpdatedState(onForeground)
    DisposableEffect(owner) {
        var paused = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> paused = true
                Lifecycle.Event.ON_RESUME -> if (paused) {
                    paused = false
                    latest()
                }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}
