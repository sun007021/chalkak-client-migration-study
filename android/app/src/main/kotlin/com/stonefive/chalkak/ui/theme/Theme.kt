package com.stonefive.chalkak.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

private val LocalChalkakColors = staticCompositionLocalOf { ChalkakColors() }

@Composable
fun ChalkakTheme(colors: ChalkakColors = ChalkakColors(), content: @Composable () -> Unit) {
    val scheme = lightColorScheme(
        primary = colors.actionPrimary,
        onPrimary = colors.onActionPrimary,
        background = colors.background,
        onBackground = colors.textPrimary,
        surface = colors.background,
        onSurface = colors.textPrimary,
        error = colors.destructive,
        outline = colors.border,
    )
    CompositionLocalProvider(LocalChalkakColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = ChalkakTypography, content = content)
    }
}

object ChalkakTheme {
    val colors: ChalkakColors
        @Composable
        @ReadOnlyComposable
        get() = LocalChalkakColors.current
}
