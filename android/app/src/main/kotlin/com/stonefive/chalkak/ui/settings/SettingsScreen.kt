package com.stonefive.chalkak.ui.settings

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import com.stonefive.chalkak.ui.theme.ChalkakRadius
import com.stonefive.chalkak.ui.components.ChalkakSkeleton
import com.stonefive.chalkak.ui.components.DialogButtonStyle
import com.stonefive.chalkak.ui.components.ChalkakDialogCard
import com.stonefive.chalkak.ui.components.ChalkakDialogButton
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.material3.Icon
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.ColumnScope
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
                .padding(horizontal = ChalkakTheme.spacing.screenHorizontal)
                .padding(top = 48.dp, bottom = ChalkakTheme.spacing.xxl),
        ) {
            if (state.showLoginButton) {
                GuestLoginRow(copy["settings.guest.login"], callbacks.onGuestLogin)
            }
            var first = true
            state.sections.forEach { section ->
                // Section label (callout, textMuted), 16 above its card; 36 between the app / push / account blocks, 40 after.
                val gap = if (first) 0.dp else if (section == SettingsSection.Feedback || section == SettingsSection.Info) 40.dp else 36.dp
                first = false
                when (section) {
                    SettingsSection.App -> {
                        SectionTitle(copy["settings.section.app"], gap)
                        SignatureCard(signature, signatureLoadFailed, callbacks, signatureImage)
                    }
                    SettingsSection.Push -> {
                        SectionTitle(copy["settings.section.push"], gap)
                        PushSection(push, pushLoadFailed, callbacks)
                    }
                    SettingsSection.Account -> {
                        SectionTitle(copy["settings.section.account"], gap)
                        SettingsCard {
                            ActionRow(copy["settings.row.logout"], callbacks.onLogout, "settings.logout-row", trailingIcon = R.drawable.ic_log_out)
                            CardDivider()
                            ActionRow(copy["settings.row.withdraw"], callbacks.onWithdraw, "settings.withdraw-row", color = colors.error)
                        }
                    }
                    SettingsSection.Feedback -> {
                        SectionTitle(copy["settings.section.feedback"], gap)
                        SettingsCard { ActionRow(copy["settings.row.feedback"], callbacks.onFeedback, "settings.feedback-row", trailingIcon = R.drawable.ic_display_arrow_right) }
                    }
                    SettingsSection.Info -> {
                        SectionTitle(copy["settings.section.info"], gap)
                        SettingsCard {
                            ActionRow(copy["settings.row.privacy"], callbacks.onPrivacy, "settings.privacy-row", trailingIcon = R.drawable.ic_display_arrow_right)
                            CardDivider()
                            ActionRow(copy["settings.row.terms"], callbacks.onTerms, "settings.terms-row", trailingIcon = R.drawable.ic_display_arrow_right)
                            CardDivider()
                            VersionRow(state.versionText)
                        }
                    }
                }
            }
        }
        account.confirm?.let { dialog -> ConfirmDialogCard(dialog, account.busy, callbacks) }
    }
}

/** Card (screens-c 1.5): `surfaceElevated`, `shapes.large`, a very light shadow (black 8%, 2dp). */
@Composable
private fun SettingsCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = ChalkakTheme.shapes.large
    Column(
        modifier
            .fillMaxWidth()
            .shadow(2.dp, shape, ambientColor = Color.Black.copy(alpha = 0.08f), spotColor = Color.Black.copy(alpha = 0.08f))
            .background(ChalkakTheme.colors.surfaceElevated, shape)
            .clip(shape),
        content = content,
    )
}

/** Hairline between card rows, inset 20dp on both sides. */
@Composable
private fun CardDivider() {
    HorizontalDivider(Modifier.padding(horizontal = ScreenPadding), thickness = 1.dp, color = ChalkakTheme.colors.border)
}

@Composable
private fun SectionTitle(text: String, gap: androidx.compose.ui.unit.Dp) {
    Text(
        text = text,
        style = ChalkakTheme.typography.callout,
        color = ChalkakTheme.colors.textMuted,
        modifier = Modifier.fillMaxWidth().padding(top = gap, bottom = ChalkakTheme.spacing.lg),
    )
}

/** Guest entry (screens-c 4.6): a full dark row with the label and a chevron, `shapes.large`. */
@Composable
private fun GuestLoginRow(text: String, onClick: () -> Unit) {
    val colors = ChalkakTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(2.dp, ChalkakTheme.shapes.large, ambientColor = Color.Black.copy(alpha = 0.08f), spotColor = Color.Black.copy(alpha = 0.08f))
            .clip(ChalkakTheme.shapes.large)
            .background(colors.actionPrimary)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = ScreenPadding, vertical = ChalkakTheme.spacing.lg)
            .testTag("settings.login-button"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = ChalkakTheme.typography.callout, color = colors.onActionPrimary, modifier = Modifier.weight(1f))
        Icon(painterResource(R.drawable.ic_display_arrow_right), contentDescription = null, tint = colors.onActionPrimary, modifier = Modifier.size(24.dp))
    }
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
    SettingsCard(Modifier.testTag("settings.signature-card")) {
        // Header row (screens-c 4.2): "사인 재설정" and an underlined "변경하기" link.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = ScreenPadding).padding(top = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.md),
        ) {
            Text(copy["sign.card.title"], style = ChalkakTheme.typography.callout, color = colors.textPrimary, modifier = Modifier.weight(1f))
            Text(
                copy["sign.card.change"],
                style = ChalkakTheme.typography.callout,
                color = colors.textSecondary,
                textDecoration = TextDecoration.Underline,
                modifier = Modifier
                    .heightIn(min = RowMinHeight)
                    .clickable(role = Role.Button, onClick = callbacks.onSignatureChange)
                    .wrapContentHeight(Alignment.CenterVertically)
                    .testTag("settings.signature-change-button"),
            )
        }
        val url = signature.imageUrl
        // Signature canvas: 112 high, actionPrimary, `shapes.button`, dashed 1dp textOnImage 28% outline.
        Box(
            Modifier
                .padding(horizontal = ScreenPadding)
                .padding(top = ChalkakTheme.spacing.sm, bottom = ScreenPadding)
                .fillMaxWidth()
                .height(112.dp)
                .clip(ChalkakTheme.shapes.button)
                .background(colors.actionPrimary)
                .drawWithContent {
                    drawContent()
                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.28f),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(ChalkakRadius.button.toPx()),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 1.dp.toPx(),
                            pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())),
                        ),
                    )
                }
                .then(if (url != null) Modifier.testTag("settings.signature-image") else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            when {
                url != null -> signatureImage(url, Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 12.dp))
                failed -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = copy[OnbCopyKeys.SIGN_LOAD_ERROR],
                        style = ChalkakTheme.typography.footnote,
                        color = colors.photoEditContent,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.testTag("settings.signature-error"),
                    )
                    Text(
                        copy["common.retry"],
                        style = ChalkakTheme.typography.footnote,
                        color = colors.photoEditContent,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier
                            .heightIn(min = RowMinHeight)
                            .clickable(role = Role.Button, onClick = callbacks.onSignatureRetry)
                            .wrapContentHeight(Alignment.CenterVertically)
                            .padding(horizontal = ChalkakTheme.spacing.lg)
                            .testTag("settings.signature-retry-button"),
                    )
                }
                signature.loading -> ChalkakSkeleton(Modifier.fillMaxSize().testTag("settings.signature-loading"))
            }
        }
    }
}

@Composable
private fun PushSection(push: PushSettingsUiState, failed: Boolean, callbacks: SettingsCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    SettingsCard(Modifier.testTag("settings.push-section")) {
        PushToggleRow(copy["settings.push.topic"], PushSetting.Topic, "settings.push-topic-toggle", push, callbacks)
        CardDivider()
        PushToggleRow(copy["settings.push.moderation"], PushSetting.Moderation, "settings.push-moderation-toggle", push, callbacks)
        CardDivider()
        PushToggleRow(copy["settings.push.ai-review"], PushSetting.AiReview, "settings.push-ai-toggle", push, callbacks)
        if (push.loading) {
            Box(Modifier.fillMaxWidth().height(RowMinHeight), contentAlignment = Alignment.Center) {
                Loading(Modifier.size(24.dp).testTag("settings.push-loading"))
            }
        }
        if (failed && !push.loading) {
            // Inline load error (screens-c 4.3): caption in `error`, then an underlined retry link.
            Column(Modifier.fillMaxWidth().padding(horizontal = ScreenPadding).padding(bottom = ChalkakTheme.spacing.sm)) {
                Text(
                    text = copy[SettingsCopyKeys.PUSH_LOAD_ERROR],
                    style = ChalkakTheme.typography.caption,
                    color = colors.error,
                    modifier = Modifier.testTag("settings.push-error"),
                )
                Text(
                    copy["common.retry"],
                    style = ChalkakTheme.typography.caption,
                    color = colors.textSecondary,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier
                        .padding(top = ChalkakTheme.spacing.xs)
                        .heightIn(min = 44.dp)
                        .clickable(role = Role.Button, onClick = callbacks.onPushRetry)
                        .wrapContentHeight(Alignment.CenterVertically)
                        .testTag("settings.push-retry-button"),
                )
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
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = { callbacks.onPushToggle(setting, it) })
            .padding(horizontal = ScreenPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = ChalkakTheme.typography.callout,
            color = if (enabled) colors.textPrimary else colors.textInactive,
            modifier = Modifier.weight(1f),
        )
        // The whole row toggles; the switch is the 75% size of the original with brand colors (screens-c 1.4).
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            modifier = Modifier.scale(0.75f),
            colors = SwitchDefaults.colors(
                checkedTrackColor = colors.actionPrimary,
                checkedThumbColor = colors.onActionPrimary,
                checkedBorderColor = colors.actionPrimary,
                uncheckedTrackColor = colors.calendarCell,
                uncheckedThumbColor = colors.onActionPrimary,
                uncheckedBorderColor = colors.textMuted,
                disabledCheckedTrackColor = colors.actionPrimary.copy(alpha = 0.4f),
                disabledCheckedThumbColor = colors.onActionPrimary,
                disabledCheckedBorderColor = Color.Transparent,
                disabledUncheckedTrackColor = colors.calendarCell,
                disabledUncheckedThumbColor = colors.onActionPrimary,
                disabledUncheckedBorderColor = colors.textMuted.copy(alpha = 0.5f),
            ),
        )
    }
}

@Composable
private fun ActionRow(text: String, onClick: () -> Unit, tag: String, color: Color = ChalkakTheme.colors.textPrimary, trailingIcon: Int? = null) {
    val colors = ChalkakTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = RowMinHeight)
            .testTag(tag)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = ScreenPadding, vertical = ChalkakTheme.spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = ChalkakTheme.typography.callout, color = color, modifier = Modifier.weight(1f))
        if (trailingIcon != null) {
            // The log-out glyph is small (13dp); the chevrons are 24dp (screens-c 1.5 / 4.4).
            val size = if (trailingIcon == R.drawable.ic_log_out) 13.dp else 24.dp
            Icon(painterResource(trailingIcon), contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(size))
        }
    }
}

@Composable
private fun VersionRow(version: String?) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = RowMinHeight).padding(horizontal = ScreenPadding, vertical = ChalkakTheme.spacing.lg).testTag("settings.version-row"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(copy["settings.row.version"], style = ChalkakTheme.typography.callout, color = colors.textPrimary, modifier = Modifier.weight(1f))
        if (version != null) {
            Text(version, style = ChalkakTheme.typography.callout, color = colors.textMuted, modifier = Modifier.testTag("settings.version-value"))
        }
    }
}

@Composable
private fun ConfirmDialogCard(dialog: ConfirmDialog, busy: Boolean, callbacks: SettingsCallbacks) {
    val copy = LocalCopy.current
    val prefix = if (dialog.kind == ConfirmKind.Logout) "settings.logout" else "settings.withdraw"
    BackHandler(onBack = callbacks.onCancel)
    BlockingLayer(scrim = ChalkakTheme.colors.scrim) {
        // screens-c 1.2: title (the action name), message, grey cancel + primary / destructive confirm.
        ChalkakDialogCard(
            title = copy[dialog.okKey],
            message = copy[dialog.messageKey],
            modifier = Modifier.testTag("$prefix-dialog"),
        ) {
            ChalkakDialogButton(copy[dialog.cancelKey], callbacks.onCancel, Modifier.weight(1f).testTag("$prefix-cancel-button"), DialogButtonStyle.Secondary)
            ChalkakDialogButton(
                copy[dialog.okKey],
                callbacks.onConfirm,
                Modifier.weight(1f).testTag("$prefix-confirm-button"),
                if (dialog.kind == ConfirmKind.Logout) DialogButtonStyle.Primary else DialogButtonStyle.Destructive,
                enabled = !busy,
            )
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
 *   `OpenSystemNotificationSettings` -> [onOpenSystemNotificationSettings]),
 *   the account effect (`GoToLogin`) is collected by the host, which stays composed while another tab is open.
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
