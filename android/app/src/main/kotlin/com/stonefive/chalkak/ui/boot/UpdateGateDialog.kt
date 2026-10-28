package com.stonefive.chalkak.ui.boot

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Forced-update dialog (D-15): `update-gate.dialog` / `.title` / `.message` / `.update-button`, copy keys `boot.update.*`.
 * Not dismissible by back press, outside tap or swipe; the only clickable element is the update button. STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun UpdateGateDialog(onUpdateClick: () -> Unit, modifier: Modifier = Modifier) {
}
