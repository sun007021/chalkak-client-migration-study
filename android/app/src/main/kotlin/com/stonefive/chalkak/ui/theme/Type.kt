package com.stonefive.chalkak.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.stonefive.chalkak.R

val Pretendard = FontFamily(
    Font(R.font.pretendard_regular, FontWeight.Normal),
    Font(R.font.pretendard_semibold, FontWeight.SemiBold),
    Font(R.font.pretendard_bold, FontWeight.Bold),
)

/** Logo / brand wordmark face. */
val Continuous = FontFamily(Font(R.font.continuous_regular, FontWeight.Normal))

/** Handwriting face (today's topic, photo-card titles). */
val GriunHangeulBanguri = FontFamily(Font(R.font.griun_hangeul_banguri_regular, FontWeight.Normal))

private fun style(
    weight: FontWeight,
    size: Int,
    line: Int,
    family: FontFamily = Pretendard,
    letterSpacing: TextUnit = 0.sp,
) = TextStyle(fontFamily = family, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp, letterSpacing = letterSpacing)

/** Named text styles (`shared/design/tokens.json` `font.styles`). */
@Immutable
data class ChalkakTypography(
    val display: TextStyle = style(FontWeight.Bold, 32, 41),
    val title1: TextStyle = style(FontWeight.Bold, 28, 34),
    val title2: TextStyle = style(FontWeight.Bold, 24, 28),
    val title3: TextStyle = style(FontWeight.SemiBold, 20, 25),
    val headline: TextStyle = style(FontWeight.SemiBold, 18, 22),
    val body: TextStyle = style(FontWeight.Normal, 17, 22),
    val callout: TextStyle = style(FontWeight.Normal, 16, 21),
    val subheadline: TextStyle = style(FontWeight.Normal, 14, 20),
    val footnote: TextStyle = style(FontWeight.Normal, 13, 18),
    val caption: TextStyle = style(FontWeight.Normal, 12, 16),
    val brand: TextStyle = style(FontWeight.Normal, 30, 36, Continuous, (-0.42).sp),
    val handwriting: TextStyle = style(FontWeight.Normal, 20, 17, GriunHangeulBanguri),
    val photoCardTitle: TextStyle = style(FontWeight.Normal, 19, 22, GriunHangeulBanguri),
)

/** Material text styles that still-unconverted `MaterialTheme.typography` call sites resolve to. */
internal fun ChalkakTypography.toMaterial(): Typography = Typography(
    displayLarge = display,
    displayMedium = display,
    displaySmall = display,
    headlineLarge = title1,
    headlineMedium = title2,
    headlineSmall = title3,
    titleLarge = headline,
    titleMedium = headline,
    titleSmall = callout,
    bodyLarge = body,
    bodyMedium = callout,
    bodySmall = subheadline,
    labelLarge = callout,
    labelMedium = footnote,
    labelSmall = caption,
)
