package com.stonefive.chalkak.ui.login

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.auth.LoginUiState
import kr.chalkak.feature.auth.PendingSignup

/**
 * Stateless login screen: `login.root`, `.tagline`, `.kakao-button`, `.guest-button`, `.loading` (only while [LoginUiState.busy]),
 * `.error-dialog` + `.error-dialog-confirm-button` (only while [LoginUiState.error] != null). Both buttons are disabled while busy.
 * No Apple/Google button. STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun LoginScreen(
    state: LoginUiState,
    onKakaoClick: () -> Unit,
    onGuestClick: () -> Unit,
    onErrorConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
}

/** Wraps [LoginStateHolder]: collects state, forwards clicks, turns `LoginEffect`s into the callbacks. STUB. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun LoginRoute(
    holder: LoginStateHolder,
    onGoHome: (HomeMode) -> Unit,
    onGoTerms: (PendingSignup) -> Unit,
    modifier: Modifier = Modifier,
) {
}
