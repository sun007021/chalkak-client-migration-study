package com.stonefive.chalkak.ui.record

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.IconAction
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import java.time.LocalDate
import java.time.YearMonth
import kr.chalkak.feature.record.RecordCell
import kr.chalkak.feature.record.RecordError
import kr.chalkak.feature.record.RecordErrorAction
import kr.chalkak.feature.record.RecordPanel
import kr.chalkak.feature.record.RecordPhase
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

private const val ERR_400_KEY = "record.err.400"
private val DayHeight = 52.dp

/** Side gutter; 11dp makes the seven day columns whole-pixel wide on a 400dp screen (no rounding drift between columns). */
private val GridGutter = 11.dp

/** "2026년 10월" assembled from the shared year / month copy (`{n}년`, `{n}월`). */
internal fun monthLabel(copy: Copy, month: YearMonth): String =
    copy.format("display.picker.year", "n" to month.year) + " " + copy.format("display.picker.month", "n" to month.monthValue)

private fun monthKey(month: YearMonth) = "%04d-%02d".format(month.year, month.monthValue)

/** Record tab: month header, Sunday-start calendar grid, selected day's photo with actions, "save as image". */
@Composable
fun RecordScreen(
    state: RecordUiState,
    callbacks: RecordCallbacks,
    image: RemoteImage,
    today: LocalDate,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    Box(modifier.fillMaxSize().background(ChalkakTheme.colors.background).testTag("record.root")) {
        Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = GridGutter)) {
            MonthHeader(state, copy, callbacks, onPickerClick = { pickerOpen = true })
            when (state.phase) {
                RecordPhase.Loading -> Box(Modifier.fillMaxWidth().padding(top = 96.dp), contentAlignment = Alignment.Center) {
                    Loading(Modifier.testTag("record.loading"))
                }
                RecordPhase.Error -> ErrorContent(state.error, copy, callbacks)
                RecordPhase.Content -> Content(state, copy, callbacks, image, today)
            }
        }
        if (pickerOpen) {
            MonthPickerSheet(
                state = state,
                copy = copy,
                onPick = { pickerOpen = false; callbacks.onMonthPicked(it) },
                onClose = { pickerOpen = false },
            )
        }
    }
}

@Composable
private fun MonthHeader(state: RecordUiState, copy: Copy, callbacks: RecordCallbacks, onPickerClick: () -> Unit) {
    val colors = ChalkakTheme.colors
    Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        Arrow(R.drawable.ic_chevron_left, state.canGoPrevious, callbacks.onPreviousMonth, Modifier.testTag("record.prev-month-button"))
        Text(
            text = monthLabel(copy, state.month),
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
            modifier = Modifier.padding(horizontal = 8.dp).testTag("record.month-label"),
        )
        Box(
            Modifier
                .size(48.dp)
                .clickable(role = Role.Button, onClick = onPickerClick)
                .semantics { contentDescription = copy["record.picker.title"] }
                .testTag("record.month-picker-button"),
            contentAlignment = Alignment.Center,
        ) {
            Text("▾", color = colors.textPrimary, style = MaterialTheme.typography.titleMedium)
        }
        Arrow(R.drawable.ic_chevron_right, state.canGoNext, callbacks.onNextMonth, Modifier.testTag("record.next-month-button"))
    }
}

@Composable
private fun Arrow(iconRes: Int, enabled: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Box(
        modifier.size(48.dp).alpha(if (enabled) 1f else 0.3f).clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(iconRes), contentDescription = null, modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun Content(state: RecordUiState, copy: Copy, callbacks: RecordCallbacks, image: RemoteImage, today: LocalDate) {
    val colors = ChalkakTheme.colors
    Row(Modifier.fillMaxWidth().testTag("record.weekday-header")) {
        copy["record.weekday"].forEach { c ->
            Text(
                c.toString(),
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelMedium,
                color = colors.textInactive,
            )
        }
    }
    Spacer(Modifier.height(8.dp))
    Column(Modifier.fillMaxWidth().testTag("record.calendar-grid")) {
        state.cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                week.forEach { cell ->
                    DayCell(cell, cell.date != null && cell.date == state.selectedDate, cell.date == today, callbacks, image, Modifier.weight(1f))
                }
            }
        }
    }
    state.panel?.let { Panel(it, copy, callbacks, image) }
    Spacer(Modifier.height(16.dp))
    ChalkakButton(
        text = copy["record.save"],
        onClick = callbacks.onSaveImage,
        enabled = !state.saving,
        modifier = Modifier.fillMaxWidth().testTag("record.save-image-button"),
    )
    Spacer(Modifier.height(24.dp))
}

@Composable
private fun DayCell(cell: RecordCell, selected: Boolean, isToday: Boolean, callbacks: RecordCallbacks, image: RemoteImage, modifier: Modifier) {
    val date = cell.date
    if (date == null) {
        Spacer(modifier.height(DayHeight))
        return
    }
    val colors = ChalkakTheme.colors
    val post = cell.post
    val base = modifier.height(DayHeight).padding(2.dp)
    val tagged = base.testTag("record.day-$date")
    val interactive = if (post != null) {
        tagged.selectable(selected = selected, role = Role.Button, onClick = { callbacks.onDateSelected(date) })
    } else {
        tagged.selectable(selected = false, enabled = false, onClick = {})
    }
    Box(interactive, contentAlignment = Alignment.Center) {
        val shape = RoundedCornerShape(8.dp)
        Box(
            Modifier
                .fillMaxSize()
                .clip(shape)
                .then(if (selected) Modifier.border(BorderStroke(2.dp, colors.actionPrimary), shape) else Modifier),
        ) {
            if (post != null) {
                image(post.thumbnailImageUrl, Modifier.fillMaxSize().testTag("record.day-photo-$date"))
                if (post.status == kr.chalkak.core.data.record.RecordPostStatus.PENDING) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(3.dp)
                            .size(8.dp)
                            .background(colors.inputCursor, CircleShape)
                            .testTag("record.day-pending-$date"),
                    )
                }
            }
            Text(
                date.dayOfMonth.toString(),
                modifier = Modifier.align(Alignment.TopStart).padding(start = 4.dp, top = 2.dp),
                style = MaterialTheme.typography.labelSmall,
                color = if (post != null) Color.White else colors.textPrimary,
            )
            if (isToday) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(6.dp)
                        .background(colors.destructive, CircleShape)
                        .testTag("record.today-marker"),
                )
            }
        }
    }
}

@Composable
private fun Panel(panel: RecordPanel, copy: Copy, callbacks: RecordCallbacks, image: RemoteImage) {
    val colors = ChalkakTheme.colors
    Column(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(16.dp)).testTag("record.selected-photo")) {
            image(panel.post.thumbnailImageUrl, Modifier.fillMaxSize())
        }
        if (panel.pendingBadge) {
            val hint = panel.hintLabelCopyKey?.let { copy[it] }
            Row(
                Modifier
                    .padding(top = 12.dp)
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = callbacks.onPendingBadgeTapped)
                    .semantics { if (hint != null) contentDescription = hint }
                    .testTag("record.pending-badge"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(copy["record.pending.badge"], style = MaterialTheme.typography.titleSmall, color = colors.textPrimary)
            }
            if (panel.hintOpen) {
                Text(
                    copy["record.pending.tooltip"],
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onActionPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .background(colors.actionPrimary, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .testTag("record.pending-tooltip"),
                )
            }
        }
        if (panel.actionsVisible) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ChalkakOutlinedButton(
                    copy["record.action.feed"],
                    callbacks.onOpenFeed,
                    Modifier.weight(1f).testTag("record.view-feed-button"),
                )
                ChalkakOutlinedButton(
                    copy["record.action.display"],
                    callbacks.onOpenDisplay,
                    Modifier.weight(1f).testTag("record.view-display-button"),
                )
            }
        }
    }
}

@Composable
private fun ErrorContent(error: RecordError?, copy: Copy, callbacks: RecordCallbacks) {
    val colors = ChalkakTheme.colors
    val title = error?.titleCopyKey?.let { copy[it] } ?: copy["record.err.other"]
    Column(Modifier.fillMaxWidth().padding(top = 96.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            error?.titleCopyKey == ERR_400_KEY ->
                Text(title, color = colors.textPrimary, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("record.invalid-month-message"))
            error?.action == RecordErrorAction.Login -> Column(
                Modifier.testTag("record.login-required-state"),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(title, color = colors.textPrimary, style = MaterialTheme.typography.bodyLarge)
                ChalkakButton(copy["record.guest.login"], callbacks.onLoginTapped, Modifier.padding(top = 16.dp).testTag("record.login-button"))
            }
            else -> Column(Modifier.testTag("record.error-state"), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(title, color = colors.textPrimary, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("record.error-message"))
                ChalkakButton(copy["common.retry"], callbacks.onRetry, Modifier.padding(top = 16.dp).testTag("record.retry-button"))
            }
        }
    }
}

/** In-tree bottom sheet (like display's date picker): every available month, newest first; tap picks, close only dismisses. */
@Composable
private fun MonthPickerSheet(state: RecordUiState, copy: Copy, onPick: (YearMonth) -> Unit, onClose: () -> Unit) {
    val colors = ChalkakTheme.colors
    BackHandler(onBack = onClose)
    Box(
        Modifier.fillMaxSize().background(Color(0x66000000)).pointerInput(Unit) { detectTapGestures { onClose() } },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 480.dp)
                .background(colors.inputBackground, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .pointerInput(Unit) { detectTapGestures { } }
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .testTag("record.month-picker-sheet"),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    copy["record.picker.title"],
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                IconAction(R.drawable.ic_close, onClose, Modifier.testTag("record.month-picker-close-button"))
            }
            Column(Modifier.verticalScroll(rememberScrollState())) {
                state.availableMonths.forEach { month ->
                    val selected = month == state.month
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (selected) colors.background else Color.Transparent)
                            .selectable(selected = selected, role = Role.RadioButton, onClick = { onPick(month) })
                            .padding(horizontal = 12.dp)
                            .testTag("record.month-picker-item-${monthKey(month)}"),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            monthLabel(copy, month),
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (selected) colors.textPrimary else colors.textInactive,
                        )
                    }
                }
            }
        }
    }
}
