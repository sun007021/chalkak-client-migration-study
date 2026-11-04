package com.stonefive.chalkak.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.ui.theme.ChalkakRadius
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * In-tree bottom sheet (testable, like [ChalkakAlert]): `scrim` behind, a `surfaceElevated` sheet with `sheet` (28) top corners and a
 * 32 x 4 grab handle. A tap on the scrim or the back press calls [onDismiss]. [tag] is on the sheet.
 */
@Composable
fun ChalkakSheet(
    onDismiss: () -> Unit,
    tag: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(onBack = onDismiss)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ChalkakTheme.colors.scrim)
            .pointerInput(Unit) { detectTapGestures { onDismiss() } },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(ChalkakTheme.colors.surfaceElevated, RoundedCornerShape(topStart = ChalkakRadius.sheet, topEnd = ChalkakRadius.sheet))
                .pointerInput(Unit) { detectTapGestures { } }
                .navigationBarsPadding()
                .padding(horizontal = ChalkakTheme.spacing.xl)
                .testTag(tag),
        ) {
            Box(
                Modifier
                    .padding(top = ChalkakTheme.spacing.sm, bottom = ChalkakTheme.spacing.sm)
                    .align(Alignment.CenterHorizontally)
                    .size(width = 32.dp, height = 4.dp)
                    .background(ChalkakTheme.colors.textInactive.copy(alpha = 0.5f), ChalkakTheme.shapes.pill),
            )
            content()
            Box(Modifier.size(ChalkakTheme.spacing.xl))
        }
    }
}
