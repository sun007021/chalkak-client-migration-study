package com.stonefive.chalkak.ui.common

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * Heart + count (testids.md "상태 노출"): the heart exposes `selected` (= [isLiked]), `enabled` and a description that names
 * the count; the count is a separate sibling element so tests and screen readers can read it on its own.
 * [buttonTag] / [countTag] are the testids.md tags.
 */
@Composable
fun LikeButton(
    isLiked: Boolean,
    count: Int,
    enabled: Boolean,
    onClick: () -> Unit,
    buttonTag: String,
    countTag: String,
    modifier: Modifier = Modifier,
    tint: Color = ChalkakTheme.colors.textPrimary,
    liked: Color = ChalkakTheme.colors.destructive,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Box(
            modifier = Modifier
                .size(48.dp) // touch target >= 48dp
                .testTag(buttonTag)
                .semantics {
                    selected = isLiked
                    contentDescription = count.toString()
                }
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(if (isLiked) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline),
                contentDescription = null,
                modifier = Modifier.size(22.dp),
                colorFilter = ColorFilter.tint(if (isLiked) liked else tint),
            )
        }
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelLarge,
            color = tint,
            modifier = Modifier.testTag(countTag),
        )
    }
}
