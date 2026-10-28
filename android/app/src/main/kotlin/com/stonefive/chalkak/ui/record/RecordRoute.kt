package com.stonefive.chalkak.ui.record

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import java.time.LocalDate
import kr.chalkak.core.common.Kst
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.record.RecordStateHolder

/** TODO(A7): connects [RecordScreen] to [holder] (lifecycle, effects). Stub so the tests compile. */
@Composable
fun RecordRoute(
    holder: RecordStateHolder,
    image: RemoteImage,
    showToast: (String) -> Unit,
    onOpenFeed: (FeedEntry.FromRecord) -> Unit,
    onOpenDisplay: (LocalDate) -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
    requestedDate: LocalDate? = null,
    today: () -> LocalDate = { LocalDate.now(Kst.zone) },
) {
}
