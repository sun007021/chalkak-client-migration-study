package com.stonefive.chalkak.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.material3.Button
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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

/** Spec 1.1: callout, padding 24 / 17, `shapes.button`. Disabled keeps a faint dark fill with the primary text color. */
private val ButtonPadding = PaddingValues(horizontal = 24.dp, vertical = 17.dp)

/** Primary filled button (screens-a 1.1). Pressed feedback is the themed ripple. */
@Composable
fun ChalkakButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val colors = ChalkakTheme.colors
    Button(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = ChalkakTheme.shapes.button,
        contentPadding = ButtonPadding,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.actionPrimary,
            contentColor = colors.onActionPrimary,
            disabledContainerColor = colors.actionPrimary.copy(alpha = 0.12f),
            disabledContentColor = colors.textPrimary,
        ),
        elevation = null,
    ) {
        Text(text = text, style = ChalkakTheme.typography.callout)
    }
}

/** Secondary outlined button (screens-a 1.2): 1dp `border` outline in every state, muted text when disabled. */
@Composable
fun ChalkakOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    containerColor: Color = Color.Transparent,
    leading: (@Composable () -> Unit)? = null,
) {
    val colors = ChalkakTheme.colors
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = ChalkakTheme.shapes.button,
        border = BorderStroke(1.dp, colors.border),
        contentPadding = ButtonPadding,
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = containerColor,
            contentColor = colors.textPrimary,
            disabledContainerColor = containerColor,
            disabledContentColor = colors.textMuted,
        ),
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(ChalkakTheme.spacing.md))
        }
        Text(text = text, style = ChalkakTheme.typography.callout)
    }
}

/** Round dark icon button (retry). Disabled: 12% fill, muted icon (screens-a 1.4). */
@Composable
fun ChalkakFilledIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: Dp = 40.dp,
    content: @Composable () -> Unit,
) {
    val colors = ChalkakTheme.colors
    FilledIconButton(
        onClick = onClick,
        modifier = modifier.size(size),
        enabled = enabled,
        shape = ChalkakTheme.shapes.pill,
        colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = colors.actionPrimary,
            contentColor = colors.onActionPrimary,
            disabledContainerColor = colors.actionPrimary.copy(alpha = 0.12f),
            disabledContentColor = colors.textMuted,
        ),
        content = content,
    )
}

/** Round retry button with the refresh glyph. [description] is the accessibility label; put the testids tag in [modifier]. */
@Composable
fun ChalkakRetryButton(description: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    ChalkakFilledIconButton(onClick = onClick, modifier = modifier, size = size) {
        Icon(
            painter = painterResource(R.drawable.ic_refresh),
            contentDescription = description,
            modifier = Modifier.size(size * 0.45f),
        )
    }
}

/** Brand checkbox (screens-a 1.5): the original-color 22dp `ic_checkbox_*` drawables, swapped without animation. */
@Composable
fun ChalkakCheckbox(checked: Boolean, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(if (checked) R.drawable.ic_checkbox_selected else R.drawable.ic_checkbox_unselected),
        contentDescription = null,
        modifier = modifier.size(22.dp),
    )
}

/** Brand wordmark (screens-a 1.7): "Chalkak" in the Continuous face. */
@Composable
fun ChalkakLogo(modifier: Modifier = Modifier, text: String = "Chalkak") {
    Text(text = text, modifier = modifier, color = ChalkakTheme.colors.textPrimary, style = ChalkakTheme.typography.brand)
}

/** Arrow-back / close icon button of the full-screen flows (48dp round target, 24dp glyph). [iconRes] is `ic_arrow_back` or `ic_close`. */
@Composable
fun IconAction(iconRes: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            tint = ChalkakTheme.colors.iconPrimary,
            modifier = Modifier.size(24.dp),
        )
    }
}

@Composable
fun BackAction(onClick: () -> Unit, modifier: Modifier = Modifier) = IconAction(R.drawable.ic_arrow_back, onClick, modifier)

/**
 * Top bar of the full-screen flows (screens-c 1.3): 72dp, back at the start, centered headline [title], optional [trailing] at the
 * end. The status bar inset is added on top. [backModifier] / [titleModifier] carry the testids tags.
 */
@Composable
fun ChalkakTopBar(
    title: String?,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    backModifier: Modifier = Modifier,
    titleModifier: Modifier = Modifier,
    backIcon: Int = R.drawable.ic_arrow_back,
    trailing: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .height(72.dp)
            .padding(horizontal = 20.dp),
    ) {
        if (onBack != null) {
            IconAction(backIcon, onBack, backModifier.align(Alignment.CenterStart))
        }
        if (title != null) {
            Text(
                text = title,
                style = ChalkakTheme.typography.headline,
                color = ChalkakTheme.colors.textPrimary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = titleModifier.align(Alignment.Center).padding(horizontal = 48.dp),
            )
        }
        if (trailing != null) {
            Box(Modifier.align(Alignment.CenterEnd)) { trailing() }
        }
    }
}

/** Indeterminate spinner for small in-place waits (refresh, load more, busy). Whole-screen loads use skeletons (`Skeleton.kt`). */
@Composable
fun Loading(modifier: Modifier = Modifier) {
    CircularProgressIndicator(
        modifier = modifier.size(32.dp),
        color = ChalkakTheme.colors.actionPrimary,
        trackColor = Color.Transparent,
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

/** Dim layer behind in-tree dialogs and sheets (`colors.scrim`, black 40%). */
@Composable
fun scrimColor(): Color = ChalkakTheme.colors.scrim

enum class DialogButtonStyle { Primary, Secondary, Destructive }

/** Dialog action button (screens-c 1.2): `shapes.button`, callout, 9.5dp vertical padding. */
@Composable
fun ChalkakDialogButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: DialogButtonStyle = DialogButtonStyle.Primary) {
    val colors = ChalkakTheme.colors
    val (container, content) = when (style) {
        DialogButtonStyle.Primary -> colors.actionPrimary to colors.onActionPrimary
        DialogButtonStyle.Secondary -> colors.actionSecondary to colors.onActionSecondary
        DialogButtonStyle.Destructive -> colors.destructive to colors.onActionPrimary
    }
    Button(
        onClick = onClick,
        modifier = modifier,
        shape = ChalkakTheme.shapes.button,
        contentPadding = PaddingValues(vertical = 9.5.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content),
        elevation = null,
    ) {
        Text(text = text, style = ChalkakTheme.typography.callout)
    }
}

/**
 * Dialog card (screens-c 1.2, `ChalkakConfirmDialog`): `surfaceElevated`, `shapes.large`, centered title3 + callout message in
 * `textNeutral`, then [actions] in a row (equal weights, 10dp apart). Padding 40 / 24 / 40 / 26, width 81% of the screen.
 */
@Composable
fun ChalkakDialogCard(
    title: String?,
    message: String,
    modifier: Modifier = Modifier,
    titleModifier: Modifier = Modifier,
    messageModifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth(0.81f)
            .background(ChalkakTheme.colors.surfaceElevated, ChalkakTheme.shapes.large)
            .padding(start = 40.dp, top = 24.dp, end = 40.dp, bottom = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (title != null) {
            Text(
                text = title,
                style = ChalkakTheme.typography.title3,
                color = ChalkakTheme.colors.textPrimary,
                textAlign = TextAlign.Center,
                modifier = titleModifier,
            )
            Spacer(Modifier.height(8.dp))
        }
        Text(
            text = message,
            style = ChalkakTheme.typography.callout,
            color = ChalkakTheme.colors.textNeutral,
            textAlign = TextAlign.Center,
            modifier = messageModifier,
        )
        Spacer(Modifier.height(23.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), content = actions)
    }
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
    BlockingLayer(modifier = modifier, scrim = scrimColor()) {
        ChalkakDialogCard(title = title, message = message, modifier = Modifier.testTag(tag)) {
            ChalkakDialogButton(copy["common.confirm"], onConfirm, Modifier.weight(1f).testTag(confirmTag))
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
