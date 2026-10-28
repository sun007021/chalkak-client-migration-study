package com.stonefive.chalkak.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.semantics.Role
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.theme.ChalkakTheme

private val ButtonHeight = 52.dp
private val ButtonShape = RoundedCornerShape(14.dp)

/** Primary filled button. Disabled state keeps the dark brand fill, dimmed. */
@Composable
fun ChalkakButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val colors = ChalkakTheme.colors
    Button(
        onClick = onClick,
        modifier = modifier.height(ButtonHeight),
        enabled = enabled,
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.actionPrimary,
            contentColor = colors.onActionPrimary,
            disabledContainerColor = colors.actionPrimary.copy(alpha = 0.28f),
            disabledContentColor = colors.onActionPrimary,
        ),
    ) {
        Text(text = text, style = MaterialTheme.typography.titleMedium)
    }
}

/** Secondary outlined button. */
@Composable
fun ChalkakOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
) {
    val colors = ChalkakTheme.colors
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(ButtonHeight),
        enabled = enabled,
        shape = ButtonShape,
        border = BorderStroke(1.dp, if (enabled) colors.actionPrimary else colors.border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.textPrimary, disabledContentColor = colors.textInactive),
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(10.dp))
        }
        Text(text = text, style = MaterialTheme.typography.titleMedium)
    }
}

/** Arrow-back / close icon button of the full-screen flows. [iconRes] is `R.drawable.ic_arrow_back` or `ic_close`. */
@Composable
fun IconAction(iconRes: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Image(painter = painterResource(iconRes), contentDescription = null, modifier = Modifier.size(24.dp))
    }
}

@Composable
fun BackAction(onClick: () -> Unit, modifier: Modifier = Modifier) = IconAction(R.drawable.ic_arrow_back, onClick, modifier)

/** Indeterminate progress. The caller passes the testids.md tag in [modifier]. */
@Composable
fun Loading(modifier: Modifier = Modifier) {
    CircularProgressIndicator(
        modifier = modifier.size(32.dp),
        color = ChalkakTheme.colors.actionPrimary,
        strokeWidth = 3.dp,
    )
}

/** Full-screen layer that swallows every touch and the back press: used by blocking dialogs and sheets. */
@Composable
fun BlockingLayer(modifier: Modifier = Modifier, scrim: Color = Color.Transparent, content: @Composable () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(scrim)
            .pointerInput(Unit) { detectTapGestures { } },
        contentAlignment = Alignment.Center,
        content = { content() },
    )
}

/**
 * In-tree alert (title optional, one confirm button). It is part of the screen tree rather than a platform dialog window, so it
 * is testable, tagged for Maestro, and a back press confirms (= dismisses) it. [tag] is on the card, [confirmTag] on the button.
 */
@Composable
fun ChalkakAlert(
    title: String?,
    message: String,
    onConfirm: () -> Unit,
    tag: String,
    confirmTag: String,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    BackHandler(onBack = onConfirm)
    BlockingLayer(modifier = modifier, scrim = Color(0x66000000)) {
        Column(
            modifier = Modifier
                .padding(horizontal = 36.dp)
                .fillMaxWidth()
                .background(ChalkakTheme.colors.inputBackground, RoundedCornerShape(20.dp))
                .padding(start = 24.dp, top = 24.dp, end = 24.dp, bottom = 12.dp)
                .testTag(tag),
        ) {
            if (title != null) {
                Text(text = title, style = MaterialTheme.typography.titleLarge, color = ChalkakTheme.colors.textPrimary)
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = ChalkakTheme.colors.textPrimary,
                textAlign = TextAlign.Start,
                modifier = Modifier.padding(top = if (title != null) 12.dp else 0.dp, bottom = 12.dp),
            )
            TextButton(
                onClick = onConfirm,
                modifier = Modifier
                    .align(Alignment.End)
                    .testTag(confirmTag),
            ) {
                Text(text = copy["common.confirm"], color = ChalkakTheme.colors.textPrimary, style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

/** Status-bar aware top row used by the flows with a back button. */
@Composable
fun TopBar(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier = modifier.fillMaxWidth().statusBarsPadding().padding(start = 8.dp, top = 4.dp)) { content() }
}

/**
 * Runs [onGone] when this composition part leaves, except while the Activity is only being recreated (rotation, theme, locale):
 * the holder survives that and its in-flight work must go on. Use it for `holder.onScreenGone()`.
 */
@Composable
fun ScreenGoneEffect(key: Any, onGone: () -> Unit) {
    val activity = androidx.activity.compose.LocalActivity.current
    val latest by androidx.compose.runtime.rememberUpdatedState(onGone)
    androidx.compose.runtime.DisposableEffect(key) {
        onDispose { if (activity?.isChangingConfigurations != true) latest() }
    }
}
