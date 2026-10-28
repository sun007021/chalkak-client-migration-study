package com.stonefive.chalkak.ui.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.ChalkakAlert
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.auth.LoginEffect
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.auth.LoginUiState
import kr.chalkak.feature.auth.PendingSignup

private const val GENERIC_ERROR_KEY = "auth.login.error.generic"

/**
 * Stateless login screen: `login.root`, `.tagline`, `.kakao-button`, `.guest-button`, `.loading` (only while [LoginUiState.busy]),
 * `.error-dialog` + `.error-dialog-confirm-button` (only while [LoginUiState.error] != null). Both buttons are disabled while busy.
 * No Apple/Google button.
 */
@Composable
fun LoginScreen(
    state: LoginUiState,
    onKakaoClick: () -> Unit,
    onGuestClick: () -> Unit,
    onErrorConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Box(modifier = modifier.fillMaxSize().background(colors.background).testTag("login.root")) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.weight(1.2f).fillMaxWidth()) {
                Text(
                    text = copy["auth.login.tagline"],
                    color = colors.textPrimary,
                    style = MaterialTheme.typography.displayLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .statusBarsPadding()
                        .padding(start = 24.dp, top = 110.dp, end = 24.dp)
                        .testTag("login.tagline"),
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                KakaoButton(text = copy["auth.login.kakao"], enabled = !state.busy, onClick = onKakaoClick)
                TextButton(
                    onClick = onGuestClick,
                    enabled = !state.busy,
                    modifier = Modifier.testTag("login.guest-button"),
                ) {
                    Text(
                        text = copy["auth.login.guest"],
                        color = if (state.busy) colors.textInactive else colors.textNeutral,
                        style = MaterialTheme.typography.bodySmall,
                        textDecoration = TextDecoration.Underline,
                    )
                }
            }
        }
        if (state.busy) {
            // Overlay, not part of the button column: it must stay visible on any screen height and never take touches.
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Loading(Modifier.testTag("login.loading")) }
        }
        state.error?.let { error ->
            val message = error.serverMessage ?: copy[error.copyKey ?: GENERIC_ERROR_KEY]
            ChalkakAlert(
                title = copy["auth.login.error.title"],
                message = message,
                onConfirm = onErrorConfirm,
                tag = "login.error-dialog",
                confirmTag = "login.error-dialog-confirm-button",
            )
        }
    }
}

@Composable
private fun KakaoButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    // Kakao's own button colours are brand rules; the logo mark is the legacy asset.
    ChalkakOutlinedButton(
        text = text,
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().testTag("login.kakao-button"),
        leading = { Image(painter = painterResource(R.drawable.img_kakao_logo), contentDescription = null, modifier = Modifier.size(20.dp)) },
    )
}

/** Wraps [LoginStateHolder]: collects state, forwards clicks, turns `LoginEffect`s into the callbacks. */
@Composable
fun LoginRoute(
    holder: LoginStateHolder,
    onGoHome: (HomeMode) -> Unit,
    onGoTerms: (PendingSignup) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by holder.state.collectAsState()
    val goHome by rememberUpdatedState(onGoHome)
    val goTerms by rememberUpdatedState(onGoTerms)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is LoginEffect.GoHome -> goHome(effect.mode)
                is LoginEffect.GoTerms -> goTerms(effect.pending)
            }
        }
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    LoginScreen(
        state = state,
        onKakaoClick = holder::onKakaoClicked,
        onGuestClick = holder::onGuestClicked,
        onErrorConfirm = holder::onErrorShown,
        modifier = modifier,
    )
}
