package com.stonefive.chalkak.ui.signature

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.onboarding.SignatureChangeStateHolder
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadUiState
import kr.chalkak.feature.onboarding.FlowError

/**
 * Stateless drawing screen (signup and change): `signature.root` (mode exposed as state description), `.title`, `.guide-text`,
 * `.canvas`, `.canvas-hint` (only while there is no stroke), `.undo-button` (enabled = canUndo), `.clear-button` (enabled = canClear),
 * `.submit-button` (enabled = canConfirm), `.back-button`, `.error-message` (only while [SignaturePadUiState.errorCopyKey] != null).
 * STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun SignatureScreen(
    mode: SignatureMode,
    state: SignaturePadUiState,
    onUndo: () -> Unit,
    onClear: () -> Unit,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
    onBeginStroke: (x: Float, y: Float) -> Unit,
    onExtendStroke: (x: Float, y: Float) -> Unit,
    onEndStroke: () -> Unit,
    modifier: Modifier = Modifier,
) {
}

/**
 * Stateless preview screen: `signature-preview.root`, `.title`, `.image` (the [png] bytes), `.redraw-button`, `.confirm-button`
 * (signup "시작하기" / change "사인 변경하기"; disabled while [busy]), `.change-notice` (change mode only), `.loading` (only while [busy]),
 * `.error-dialog` + `.error-dialog-confirm-button` (only while [error] != null). STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun SignaturePreviewScreen(
    mode: SignatureMode,
    png: ByteArray,
    busy: Boolean,
    error: FlowError?,
    onErrorConfirm: () -> Unit,
    onRedraw: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
}

/** Change-mode preview wired to [SignatureChangeStateHolder]; effects go to the callbacks (`Done` carries the toast copy key). STUB. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun ChangeSignaturePreviewRoute(
    holder: SignatureChangeStateHolder,
    png: ByteArray,
    onDone: (toastCopyKey: String) -> Unit,
    onBackToLogin: (copyKey: String) -> Unit,
    onBackToDrawing: () -> Unit,
    onRedraw: () -> Unit,
    modifier: Modifier = Modifier,
) {
}
