package com.stonefive.chalkak.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** Brand colors carried over from the legacy app (values only; names are this app's). */
@Immutable
data class ChalkakColors(
    val background: Color = Color(0xFFF7F6F3),
    val inputBackground: Color = Color(0xFFFCFAF6),
    val actionPrimary: Color = Color(0xFF2B2724),
    val onActionPrimary: Color = Color.White,
    val bottomBar: Color = Color(0xFF8C8479),
    val textPrimary: Color = Color(0xFF2B2724),
    val textInactive: Color = Color(0xFF9A968D),
    val textNeutral: Color = Color(0xFF6B7280),
    val border: Color = Color(0x26888888),
    val inputCursor: Color = Color(0xFFB0563B),
    val destructive: Color = Color(0xFFFF5A5F),
    val toastBackground: Color = Color(0xE62B2724),
    val onToast: Color = Color.White,
)
