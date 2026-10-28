package com.stonefive.chalkak.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.settings.FeedbackStateHolder
import kr.chalkak.feature.settings.FeedbackUiState

/**
 * Stateless feedback screen (testids.md `feedback.*`). STUB: the implementation lands with the PR.
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
    Box(modifier)
}

/**
 * Connects [FeedbackScreen] to [holder]. STUB.
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
    Box(modifier)
}
