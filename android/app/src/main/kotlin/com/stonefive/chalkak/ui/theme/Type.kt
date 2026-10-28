package com.stonefive.chalkak.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.stonefive.chalkak.R

val Pretendard = FontFamily(
    Font(R.font.pretendard_regular, FontWeight.Normal),
    Font(R.font.pretendard_semibold, FontWeight.SemiBold),
    Font(R.font.pretendard_bold, FontWeight.Bold),
)

/** Logo / brand wordmark face. */
val Continuous = FontFamily(Font(R.font.continuous_regular, FontWeight.Normal))

/** Handwriting face for photo-card titles. */
val GriunHangeulBanguri = FontFamily(Font(R.font.griun_hangeul_banguri_regular, FontWeight.Normal))

private fun style(weight: FontWeight, size: Int, line: Int) =
    TextStyle(fontFamily = Pretendard, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp, letterSpacing = 0.sp)

val ChalkakTypography = Typography(
    displayLarge = style(FontWeight.Bold, 32, 41),
    headlineLarge = style(FontWeight.Bold, 28, 34),
    headlineMedium = style(FontWeight.Bold, 24, 28),
    headlineSmall = style(FontWeight.SemiBold, 20, 25),
    titleLarge = style(FontWeight.SemiBold, 18, 22),
    titleMedium = style(FontWeight.SemiBold, 18, 22),
    titleSmall = style(FontWeight.Normal, 16, 21),
    bodyLarge = style(FontWeight.Normal, 17, 22),
    bodyMedium = style(FontWeight.Normal, 16, 21),
    bodySmall = style(FontWeight.Normal, 14, 20),
    labelLarge = style(FontWeight.Normal, 16, 21),
    labelMedium = style(FontWeight.Normal, 13, 18),
    labelSmall = style(FontWeight.Normal, 12, 16),
)
