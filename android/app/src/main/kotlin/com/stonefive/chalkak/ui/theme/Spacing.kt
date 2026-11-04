package com.stonefive.chalkak.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** `shared/design/tokens.json` `spacing`. */
@Immutable
data class ChalkakSpacing(
    val none: Dp = 0.dp,
    val xs: Dp = 4.dp,
    val sm: Dp = 8.dp,
    val md: Dp = 12.dp,
    val lg: Dp = 16.dp,
    val xl: Dp = 24.dp,
    val xxl: Dp = 40.dp,
    val screenHorizontal: Dp = 25.dp,
)
