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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
    val spacing = ChalkakTheme.spacing
    Box(modifier = modifier.fillMaxSize().background(colors.background).testTag("login.root")) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header (screens-a 4.4): faded photo behind the display-size tagline; 1.2 : 1 against the actions.
            Box(modifier = Modifier.weight(1.2f).fillMaxWidth()) {
                Image(
                    painter = painterResource(R.drawable.img_login_background),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alpha = 0.2f,
                    modifier = Modifier.fillMaxSize(),
                )
                Text(
                    text = copy["auth.login.tagline"],
                    color = colors.textPrimary,
                    style = ChalkakTheme.typography.display,
                    modifier = Modifier
                        .statusBarsPadding()
                        .padding(start = spacing.screenHorizontal, top = 110.dp, end = spacing.screenHorizontal)
                        .testTag("login.tagline"),
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = spacing.screenHorizontal, vertical = spacing.xxl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(spacing.lg),
            ) {
                KakaoButton(text = copy["auth.login.kakao"], enabled = !state.busy, onClick = onKakaoClick)
                Text(
                    text = copy["auth.login.guest"],
                    color = if (state.busy) colors.textInactive else colors.textSecondary,
                    style = ChalkakTheme.typography.subheadline,
                    textDecoration = TextDecoration.Underline,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .clickable(enabled = !state.busy, role = Role.Button, onClick = onGuestClick)
                        .wrapContentHeight(Alignment.CenterVertically)
                        .padding(horizontal = spacing.sm)
                        .testTag("login.guest-button"),
                )
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
        containerColor = ChalkakTheme.colors.inputBackground,
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
