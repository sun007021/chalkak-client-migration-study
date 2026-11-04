package com.stonefive.chalkak.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import com.stonefive.chalkak.ui.theme.LocalSkeletonShimmer

/** Shimmer band width as a share of the view width, and the sweep time (screens-a 1.8: 0.6 x width, linear 1.2 s, no reverse). */
private const val BandFraction = 0.6f
private const val SweepMillis = 1200

/**
 * Loading placeholder: a `skeletonBase` fill with a `skeletonHighlight` band sweeping left to right. Clipping is the caller's job
 * (`Modifier.clip(...)` before it). The sweep only runs where [LocalSkeletonShimmer] is on (the app); tests see a still base fill.
 */
@Composable
fun ChalkakSkeleton(modifier: Modifier = Modifier) {
    val colors = ChalkakTheme.colors
    if (!LocalSkeletonShimmer.current) {
        Box(modifier.background(colors.skeletonBase))
        return
    }
    val transition = rememberInfiniteTransition(label = "skeleton")
    val progress = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(SweepMillis, easing = LinearEasing), RepeatMode.Restart),
        label = "skeleton-sweep",
    )
    Box(
        modifier
            .background(colors.skeletonBase)
            .drawWithContent {
                drawContent()
                val band = size.width * BandFraction
                val start = -band + (size.width + band) * progress.value
                drawRect(
                    brush = Brush.horizontalGradient(
                        colors = listOf(Color.Transparent, colors.skeletonHighlight, Color.Transparent),
                        startX = start,
                        endX = start + band,
                    ),
                    topLeft = Offset.Zero,
                    size = size,
                )
            },
    )
}

/**
 * Tile for an image that is missing or failed (screens-a 1.8): `inputBackground` with a 24dp `iconSecondary` photo glyph.
 */
@Composable
fun ImagePlaceholder(modifier: Modifier = Modifier) {
    Box(modifier.background(ChalkakTheme.colors.inputBackground), contentAlignment = Alignment.Center) {
        Icon(
            painter = painterResource(R.drawable.ic_photo_library),
            contentDescription = null,
            tint = ChalkakTheme.colors.iconSecondary,
            modifier = Modifier.size(24.dp),
        )
    }
}
