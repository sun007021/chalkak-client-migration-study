package com.stonefive.chalkak.ui.boot

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BlockingLayer
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * Forced-update dialog (D-15): `update-gate.dialog` / `.title` / `.message` / `.update-button`, copy keys `boot.update.*`.
 * Not dismissible by back press, outside tap or swipe; the only clickable element is the update button. It is an in-tree overlay
 * (a [BlockingLayer] plus `BackHandler {}`), so the back press stays inside the app and nothing behind it is reachable.
 */
@Composable
fun UpdateGateDialog(onUpdateClick: () -> Unit, modifier: Modifier = Modifier) {
    val copy = LocalCopy.current
    BackHandler { }
    BlockingLayer(modifier = modifier, scrim = Color(0x66000000)) {
        Column(
            modifier = Modifier
                .padding(horizontal = 36.dp)
                .fillMaxWidth()
                .background(ChalkakTheme.colors.inputBackground, RoundedCornerShape(20.dp))
                .padding(24.dp)
                .testTag("update-gate.dialog"),
        ) {
            Text(
                text = copy["boot.update.title"],
                style = MaterialTheme.typography.titleLarge,
                color = ChalkakTheme.colors.textPrimary,
                modifier = Modifier.testTag("update-gate.title"),
            )
            Text(
                text = copy["boot.update.body"],
                style = MaterialTheme.typography.bodyMedium,
                color = ChalkakTheme.colors.textNeutral,
                modifier = Modifier.padding(top = 12.dp, bottom = 24.dp).testTag("update-gate.message"),
            )
            ChalkakButton(
                text = copy["boot.update.button"],
                onClick = onUpdateClick,
                modifier = Modifier.fillMaxWidth().testTag("update-gate.update-button"),
            )
        }
    }
}
