package com.stonefive.chalkak.ui.theme

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Radius values in dp (`shared/design/tokens.json` `radius`). `pill` is a capsule (any value >= half the height). */
object ChalkakRadius {
    val small: Dp = 7.dp
    val button: Dp = 12.dp
    val input: Dp = 14.dp
    val photoCard: Dp = 12.dp
    val large: Dp = 16.dp
    val xlarge: Dp = 18.dp
    val sheet: Dp = 28.dp
}

@Immutable
data class ChalkakShapes(
    val small: CornerBasedShape = RoundedCornerShape(ChalkakRadius.small),
    val button: CornerBasedShape = RoundedCornerShape(ChalkakRadius.button),
    val input: CornerBasedShape = RoundedCornerShape(ChalkakRadius.input),
    val photoCard: CornerBasedShape = RoundedCornerShape(ChalkakRadius.photoCard),
    val large: CornerBasedShape = RoundedCornerShape(ChalkakRadius.large),
    val xlarge: CornerBasedShape = RoundedCornerShape(ChalkakRadius.xlarge),
    val sheet: CornerBasedShape = RoundedCornerShape(ChalkakRadius.sheet),
    val pill: CornerBasedShape = CircleShape,
)

/** Material components that are not replaced by a Chalkak one still get Chalkak corners. */
internal fun ChalkakShapes.toMaterial(): Shapes = Shapes(
    extraSmall = small,
    small = small,
    medium = button,
    large = large,
    extraLarge = sheet,
)
