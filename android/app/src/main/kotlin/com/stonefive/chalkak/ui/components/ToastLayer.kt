package com.stonefive.chalkak.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.delay
import kr.chalkak.core.common.AppConstants

/**
 * Renders the current toast (`toast.container` / `toast.message`, testids.md). Nothing exists in the tree while [toast] is null.
 * It does not consume touches (D-20: toasts never block input). [toast] id changes redraw even for identical text, and after
 * `TOAST_DURATION_MS` [onExpired] is called with that id so the owner (the navigation `ToastHost`) can drop it.
 *
 * Place it once, above the screen content, inside the root `Box`.
 */
@Composable
fun ToastLayer(
    toast: ToastUi?,
    onExpired: (id: Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (toast == null) return
    key(toast.id) {
        LaunchedEffect(toast.id) {
            delay(AppConstants.TOAST_DURATION_MS)
            onExpired(toast.id)
        }
        Box(
            modifier = modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 32.dp)
                .testTag("toast.container"),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Text(
                text = toast.text,
                color = ChalkakTheme.colors.onToast,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .background(ChalkakTheme.colors.toastBackground, RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .testTag("toast.message"),
            )
        }
    }
}

/** UI-side toast value. Mapped from `kr.chalkak.feature.navigation.Toast` by the shell (same fields). */
data class ToastUi(val id: Long, val text: String)
