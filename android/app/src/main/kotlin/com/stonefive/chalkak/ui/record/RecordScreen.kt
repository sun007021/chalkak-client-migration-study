package com.stonefive.chalkak.ui.record

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import java.time.LocalDate
import java.time.YearMonth
import kr.chalkak.feature.record.RecordUiState

/** What the stateless [RecordScreen] reports; [RecordRoute] forwards each one to the `RecordStateHolder`. */
data class RecordCallbacks(
    val onPreviousMonth: () -> Unit = {},
    val onNextMonth: () -> Unit = {},
    /** Month picker item chosen (the sheet closes itself). */
    val onMonthPicked: (YearMonth) -> Unit = {},
    val onDateSelected: (LocalDate) -> Unit = {},
    val onPendingBadgeTapped: () -> Unit = {},
    val onOpenFeed: () -> Unit = {},
    val onOpenDisplay: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onLoginTapped: () -> Unit = {},
    val onSaveImage: () -> Unit = {},
)

/** TODO(A7): stateless record screen (tags `record.*` of testids.md). Stub so the tests compile. */
@Composable
fun RecordScreen(
    state: RecordUiState,
    callbacks: RecordCallbacks,
    image: RemoteImage,
    today: LocalDate,
    modifier: Modifier = Modifier,
) {
}
