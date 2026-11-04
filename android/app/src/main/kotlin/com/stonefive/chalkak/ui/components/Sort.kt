package com.stonefive.chalkak.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * Text sort selector (screens-b 1.1): subheadline items 16dp apart, the selected one in `textPrimary` with a 1dp underline
 * 4.5dp below the text, the others in `textInactive`. No ripple; the touch area spans 12dp above and 22dp below the text.
 */
@Composable
fun <T> ChalkakSortSelector(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    tag: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.lg),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            val color = if (isSelected) ChalkakTheme.colors.textPrimary else ChalkakTheme.colors.textInactive
            Box(
                modifier = Modifier
                    .testTag(tag(option))
                    .selectable(selected = isSelected, interactionSource = null, indication = null, role = Role.Tab) { onSelect(option) }
                    .padding(top = 12.dp, bottom = 22.dp),
            ) {
                Text(
                    text = label(option),
                    color = color,
                    style = ChalkakTheme.typography.subheadline,
                    modifier = Modifier.drawBehind {
                        if (isSelected) {
                            val stroke = 1.dp.toPx()
                            val y = size.height + 4.5.dp.toPx() + stroke / 2
                            drawLine(color, Offset(0f, y), Offset(size.width, y), stroke)
                        }
                    },
                )
            }
        }
    }
}
