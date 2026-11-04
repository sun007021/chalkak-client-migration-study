package com.stonefive.chalkak.ui.theme

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

private val LocalChalkakColors = staticCompositionLocalOf { ChalkakColors() }
private val LocalChalkakTypography = staticCompositionLocalOf { ChalkakTypography() }
private val LocalChalkakShapes = staticCompositionLocalOf { ChalkakShapes() }
private val LocalChalkakSpacing = staticCompositionLocalOf { ChalkakSpacing() }

/**
 * Whether skeletons run their shimmer. The app turns it on; the default is off because an endless animation keeps a Compose UI test
 * from ever going idle (a still skeleton is drawn instead).
 */
val LocalSkeletonShimmer = staticCompositionLocalOf { false }

/** Material color scheme overridden with Chalkak tokens, so no default Material purple/tint can show (design README section 4). */
internal fun ChalkakColors.toMaterial() = lightColorScheme(
    primary = actionPrimary,
    onPrimary = onActionPrimary,
    primaryContainer = surfaceElevated,
    onPrimaryContainer = textPrimary,
    inversePrimary = bottomBar,
    secondary = bottomBar,
    onSecondary = onActionPrimary,
    secondaryContainer = background,
    onSecondaryContainer = textPrimary,
    tertiary = bottomBar,
    onTertiary = onActionPrimary,
    tertiaryContainer = background,
    onTertiaryContainer = textPrimary,
    background = background,
    onBackground = textPrimary,
    surface = surface,
    onSurface = textPrimary,
    surfaceVariant = surfaceElevated,
    onSurfaceVariant = textSecondary,
    surfaceTint = Color.Transparent,
    inverseSurface = actionPrimary,
    inverseOnSurface = background,
    error = error,
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    outline = border,
    outlineVariant = border,
    scrim = scrim,
    surfaceDim = background,
    surfaceBright = surfaceElevated,
    surfaceContainerLowest = surfaceElevated,
    surfaceContainerLow = background,
    surfaceContainer = background,
    surfaceContainerHigh = background,
    surfaceContainerHighest = surfaceElevated,
)

/** App-wide theme. Always the light tokens, whatever the system dark mode says. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChalkakTheme(
    colors: ChalkakColors = ChalkakColors(),
    shimmer: Boolean = false,
    content: @Composable () -> Unit,
) {
    val typography = remember { ChalkakTypography() }
    val shapes = remember { ChalkakShapes() }
    val spacing = remember { ChalkakSpacing() }
    val ripple = remember(colors) {
        RippleConfiguration(color = colors.textPrimary)
    }
    CompositionLocalProvider(
        LocalChalkakColors provides colors,
        LocalChalkakTypography provides typography,
        LocalChalkakShapes provides shapes,
        LocalChalkakSpacing provides spacing,
        LocalRippleConfiguration provides ripple,
        LocalSkeletonShimmer provides shimmer,
    ) {
        MaterialTheme(
            colorScheme = colors.toMaterial(),
            typography = typography.toMaterial(),
            shapes = shapes.toMaterial(),
            content = content,
        )
    }
}

object ChalkakTheme {
    val colors: ChalkakColors
        @Composable @ReadOnlyComposable get() = LocalChalkakColors.current
    val typography: ChalkakTypography
        @Composable @ReadOnlyComposable get() = LocalChalkakTypography.current
    val shapes: ChalkakShapes
        @Composable @ReadOnlyComposable get() = LocalChalkakShapes.current
    val spacing: ChalkakSpacing
        @Composable @ReadOnlyComposable get() = LocalChalkakSpacing.current
}
