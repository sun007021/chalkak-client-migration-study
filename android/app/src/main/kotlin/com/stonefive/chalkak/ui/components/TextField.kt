package com.stonefive.chalkak.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * Brand text field (screens-a 1.6): `inputBackground` fill, `shapes.input` (14), 1dp outline that turns `actionPrimary` on focus,
 * 16dp padding, `inputCursor` caret, `textInactive` placeholder. With a [counter] ("N / max") it sits at the bottom end in
 * subheadline `textInactive` and the text gets 24dp more room below. The caller owns the value and any length rule.
 */
@Composable
fun ChalkakTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    enabled: Boolean = true,
    textStyle: TextStyle = ChalkakTheme.typography.body,
    singleLine: Boolean = false,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    counter: String? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    placeholderModifier: Modifier = Modifier,
    counterModifier: Modifier = Modifier,
) {
    val colors = ChalkakTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val style = textStyle.copy(color = if (enabled) colors.textPrimary else colors.textMuted)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .background(colors.inputBackground, ChalkakTheme.shapes.input)
            .border(1.dp, if (focused) colors.actionPrimary else colors.border, ChalkakTheme.shapes.input)
            .padding(ChalkakTheme.spacing.lg),
        enabled = enabled,
        textStyle = style,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        interactionSource = interaction,
        cursorBrush = SolidColor(colors.inputCursor),
        decorationBox = { inner ->
            Box {
                Box(if (counter != null) Modifier.padding(bottom = ChalkakTheme.spacing.xl) else Modifier) {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(placeholder, color = colors.textInactive, style = style, modifier = placeholderModifier)
                    }
                    inner()
                }
                if (counter != null) {
                    Text(
                        text = counter,
                        color = colors.textInactive,
                        style = ChalkakTheme.typography.subheadline,
                        modifier = counterModifier.align(Alignment.BottomEnd),
                    )
                }
            }
        },
    )
}
