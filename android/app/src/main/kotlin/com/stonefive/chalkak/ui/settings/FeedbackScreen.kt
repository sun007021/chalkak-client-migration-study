package com.stonefive.chalkak.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.IconAction
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.core.common.AppConstants
import kr.chalkak.feature.settings.FeedbackEffect
import kr.chalkak.feature.settings.FeedbackStateHolder
import kr.chalkak.feature.settings.FeedbackUiState
import kr.chalkak.feature.settings.SettingsCopyKeys

/**
 * Stateless feedback screen (testids.md `feedback.*`).
 *
 * `feedback.root`, `feedback.close-button`, `feedback.guide-text` (`fdbk.intro.title`), `feedback.guide-body` (`fdbk.intro.body`),
 * `feedback.input` (placeholder `fdbk.field.placeholder` while empty; every edit calls [onInputChange] with the whole new text),
 * `feedback.counter` ("`count`/1000"), `feedback.submit-button` (`fdbk.send`, or `fdbk.sending` while sending; enabled =
 * [FeedbackUiState.sendEnabled]), `feedback.validation-message` (error copy key `fdbk.error.invalid`) or `feedback.error-message`
 * (any other error copy key); an error shows [FlowError.serverMessage] when present, else the copy of its key.
 */
@Composable
fun FeedbackScreen(
    state: FeedbackUiState,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(
        modifier
            .fillMaxSize()
            .background(colors.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .testTag("feedback.root"),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, top = 4.dp, end = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            IconAction(R.drawable.ic_close, onClose, Modifier.testTag("feedback.close-button"))
            Text(
                text = copy["fdbk.title"],
                style = MaterialTheme.typography.titleMedium,
                color = colors.textPrimary,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp)) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = copy["fdbk.intro.title"],
                style = MaterialTheme.typography.headlineMedium,
                color = colors.textPrimary,
                modifier = Modifier.testTag("feedback.guide-text"),
            )
            Text(
                text = copy["fdbk.intro.body"],
                style = MaterialTheme.typography.bodySmall,
                color = colors.textNeutral,
                modifier = Modifier.padding(top = 12.dp).testTag("feedback.guide-body"),
            )
            Spacer(Modifier.height(24.dp))
            BasicTextField(
                value = state.input,
                onValueChange = onInputChange,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.textPrimary),
                cursorBrush = SolidColor(colors.inputCursor),
                modifier = Modifier.fillMaxWidth().testTag("feedback.input"),
                decorationBox = { inner ->
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 200.dp)
                            .background(colors.inputBackground, RoundedCornerShape(16.dp))
                            .border(1.dp, colors.border, RoundedCornerShape(16.dp))
                            .padding(16.dp),
                    ) {
                        if (state.input.isEmpty()) {
                            Text(copy["fdbk.field.placeholder"], style = MaterialTheme.typography.bodyLarge, color = colors.textInactive)
                        }
                        inner()
                    }
                },
            )
            Spacer(Modifier.height(16.dp))
        }
        Text(
            text = "${state.count}/${AppConstants.FEEDBACK_MAX}",
            style = MaterialTheme.typography.labelMedium,
            color = colors.textInactive,
            textAlign = TextAlign.End,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp).testTag("feedback.counter"),
        )
        state.error?.let { error ->
            val invalid = error.copyKey == SettingsCopyKeys.FEEDBACK_ERROR_INVALID
            Text(
                text = error.serverMessage ?: error.copyKey?.let { copy[it] } ?: copy[SettingsCopyKeys.FEEDBACK_ERROR_GENERIC],
                style = MaterialTheme.typography.labelMedium,
                color = colors.destructive,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 12.dp)
                    .testTag(if (invalid) "feedback.validation-message" else "feedback.error-message"),
            )
        }
        ChalkakButton(
            text = copy[if (state.sending) "fdbk.sending" else "fdbk.send"],
            onClick = onSend,
            enabled = state.sendEnabled,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 18.dp).testTag("feedback.submit-button"),
        )
    }
}

/**
 * Connects [FeedbackScreen] to [holder].
 *
 * - shown: `holder.onScreenShown()` once; left: `holder.onScreenGone()` (not while the Activity is only recreated).
 * - `FeedbackEffect.Done` -> [showToast] (copy of its key) and then [onClose] once; `FeedbackEffect.GoLogin` -> [onLoginRequired], no toast.
 * - close button -> [onClose]; the screen itself never navigates anywhere else.
 */
@Composable
fun FeedbackRoute(
    holder: FeedbackStateHolder,
    showToast: (String) -> Unit,
    onClose: () -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val state by holder.state.collectAsState()
    val latestToast by rememberUpdatedState(showToast)
    val latestClose by rememberUpdatedState(onClose)
    val latestLogin by rememberUpdatedState(onLoginRequired)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is FeedbackEffect.Done -> {
                    latestToast(copy[effect.toastCopyKey])
                    latestClose()
                }
                FeedbackEffect.GoLogin -> latestLogin()
            }
        }
    }
    LaunchedEffect(holder) { holder.onScreenShown() }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    FeedbackScreen(
        state = state,
        onInputChange = holder::onInputChanged,
        onSend = holder::onSendClicked,
        onClose = onClose,
        modifier = modifier,
    )
}
