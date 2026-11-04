package com.stonefive.chalkak.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * Color tokens. Values are `shared/design/tokens.json` (`color`); `ChalkakTokensTest` compares every one of them.
 * Light only: the original app is light-fixed, so the system dark mode never changes these.
 */
@Immutable
data class ChalkakColors(
    val background: Color = Color(0xFFF7F6F3),
    val surface: Color = Color(0xFFF7F6F3),
    val surfaceElevated: Color = Color(0xFFFFFFFF),
    val inputBackground: Color = Color(0xFFFCFAF6),
    val bottomBar: Color = Color(0xFF8C8479),
    val textPrimary: Color = Color(0xFF2B2724),
    val textSecondary: Color = Color(0xFF2B2724).copy(alpha = 0.68f),
    val textMuted: Color = Color(0xFF2B2724).copy(alpha = 0.48f),
    val textInactive: Color = Color(0xFF9A968D),
    val textNeutral: Color = Color(0xFF6B7280),
    val textOnImage: Color = Color(0xFFFFFFFF),
    val border: Color = Color(0xFF888888).copy(alpha = 0.15f),
    val divider: Color = Color(0xFF757575),
    val inputCursor: Color = Color(0xFFB0563B),
    val accent: Color = Color(0xFFB0563B),
    val actionPrimary: Color = Color(0xFF2B2724),
    val onActionPrimary: Color = Color(0xFFFFFFFF),
    val actionSecondary: Color = Color(0xFF808080),
    val onActionSecondary: Color = Color(0xFFFFFFFF),
    val photoActionText: Color = Color(0xFF7D7D7D),
    val iconPrimary: Color = Color(0xFF2B2724),
    val iconSecondary: Color = Color(0xFF2B2724).copy(alpha = 0.62f),
    val scrim: Color = Color.Black.copy(alpha = 0.40f),
    val error: Color = Color(0xFFBA1A1A),
    val destructive: Color = Color(0xFFFF5A5F),
    val calendarCell: Color = Color(0xFFEAE7DE),
    val calendarCellBorder: Color = Color(0xFFDCD8CE),
    val calendarSelection: Color = Color(0xFFB0563B),
    val skeletonBase: Color = Color(0xFFEAE7DE),
    val skeletonHighlight: Color = Color(0xFFF7F6F3),
    val logoBackground: Color = Color(0xFFFFFAF6),
    val photoEditBackground: Color = Color(0xFF141312),
    val photoEditContent: Color = Color(0xFFFFFFFF),
    val photoEditContentMuted: Color = Color(0xFFFFFFFF).copy(alpha = 0.56f),
    val photoEditScrim: Color = Color(0xFF141312).copy(alpha = 0.62f),
)
