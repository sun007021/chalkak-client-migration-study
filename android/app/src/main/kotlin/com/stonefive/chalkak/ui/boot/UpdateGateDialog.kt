package com.stonefive.chalkak.ui.boot

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BlockingLayer
import com.stonefive.chalkak.ui.components.ChalkakDialogButton
import com.stonefive.chalkak.ui.components.ChalkakDialogCard
import com.stonefive.chalkak.ui.components.DialogButtonStyle
import com.stonefive.chalkak.ui.components.scrimColor


/**
 * Forced-update dialog (D-15): `update-gate.dialog` / `.title` / `.message` / `.update-button` / `.cancel-button` (exits the app), copy keys `boot.update.*`.
 * Not dismissible by back press, outside tap or swipe; the clickable elements are the update and cancel buttons. It is an in-tree overlay
 * (a [BlockingLayer] plus `BackHandler {}`), so the back press stays inside the app and nothing behind it is reachable.
 */
@Composable
fun UpdateGateDialog(onUpdateClick: () -> Unit, onCancelClick: () -> Unit, modifier: Modifier = Modifier) {
    val copy = LocalCopy.current
    BackHandler { }
    BlockingLayer(modifier = modifier, scrim = scrimColor()) {
        // screens-c 1.1: the shared dialog card, secondary (exit) on the left and the primary update action on the right.
        ChalkakDialogCard(
            title = copy["boot.update.title"],
            message = copy["boot.update.body"],
            modifier = Modifier.testTag("update-gate.dialog"),
            titleModifier = Modifier.testTag("update-gate.title"),
            messageModifier = Modifier.testTag("update-gate.message"),
        ) {
            ChalkakDialogButton(
                text = copy["boot.update.cancel"],
                onClick = onCancelClick,
                style = DialogButtonStyle.Secondary,
                modifier = Modifier.weight(1f).testTag("update-gate.cancel-button"),
            )
            ChalkakDialogButton(
                text = copy["boot.update.button"],
                onClick = onUpdateClick,
                style = DialogButtonStyle.Primary,
                modifier = Modifier.weight(1f).testTag("update-gate.update-button"),
            )
        }
    }
}
