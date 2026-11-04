package com.stonefive.chalkak.ui.aireview

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import androidx.compose.foundation.layout.width
import com.stonefive.chalkak.ui.components.DialogButtonStyle
import com.stonefive.chalkak.ui.components.ChalkakDialogButton
import com.stonefive.chalkak.ui.theme.ChalkakRadius
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.feature.aireview.AiPill
import kr.chalkak.feature.aireview.AiResultUi
import kr.chalkak.feature.aireview.AiReviewUiState
import kr.chalkak.feature.aireview.AiSheet

/** User events of the AI feedback area; [AiReviewRoute] maps each to the matching `AiReviewStateHolder` method. */
data class AiReviewCallbacks(
    /** Pill tap (`holder.onPillClicked()`); also the "재요청" button of the failure sheet (pill is Retry, the holder swaps the sheet). */
    val onPillClick: () -> Unit = {},
    /** Start sheet "분석 시작하기" -> `holder.onStartConfirmed()`. */
    val onStartConfirm: () -> Unit = {},
    /** Any sheet closed without an action (close button, failure "확인", system back) -> `holder.onSheetDismissed()`. */
    val onSheetDismiss: () -> Unit = {},
    val onCriteriaHelpClick: () -> Unit = {},
    val onCriteriaHelpDismiss: () -> Unit = {},
    /** `ToastLayer` expiry of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

/**
 * Where the two parts of the AI area go: the in-flow [pill] (pill and notice line) and the full-screen [overlay] (sheets, criteria
 * dialog, toast). A host that scrolls (the post detail) puts the pill in its column and the overlay at its root; [AiStackedLayout]
 * is the standalone arrangement.
 */
typealias AiLayout = @Composable (pill: @Composable () -> Unit, overlay: @Composable () -> Unit) -> Unit

/** Pill on top, overlay over it in one box. */
val AiStackedLayout: AiLayout = { pill, overlay ->
    Box {
        pill()
        overlay()
    }
}

/**
 * Stateless AI feedback area of the post detail: the pill (testids `feed.ai-*`), the persistent notice line (`feed.ai-message`),
 * and, as overlays, the start / result / failure sheets, the criteria dialog and the toast. Draws nothing for `AiPill.Hidden`
 * without a sheet or toast.
 */
@Composable
fun AiReviewSection(
    state: AiReviewUiState,
    callbacks: AiReviewCallbacks,
    modifier: Modifier = Modifier,
    layout: AiLayout = AiStackedLayout,
) {
    val copy = LocalCopy.current
    Box(modifier) {
        layout(
            { PillArea(state, callbacks) },
            {
                state.sheet?.let { SheetLayer(state, it, callbacks) }
                if (state.criteriaDialogOpen && state.sheet is AiSheet.Result) CriteriaDialog(callbacks)
                ToastLayer(
                    toast = state.toast?.let { ToastUi(it.id, it.copyKey?.let { key -> copy[key] } ?: it.serverMessage.orEmpty()) },
                    onExpired = callbacks.onToastExpired,
                )
            },
        )
    }
}

private fun pillTag(pill: AiPill): String? = when (pill) {
    AiPill.Hidden -> null
    AiPill.Checking -> "feed.ai-checking"
    AiPill.Recheck -> "feed.ai-recheck-button"
    AiPill.Request -> "feed.ai-request-button"
    AiPill.Requesting -> "feed.ai-requesting"
    AiPill.Processing -> "feed.ai-processing"
    AiPill.View -> "feed.ai-result-button"
    AiPill.Retry -> "feed.ai-retry-button"
    AiPill.Failed -> "feed.ai-failed-button"
}

@Composable
private fun PillArea(state: AiReviewUiState, callbacks: AiReviewCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val tag = pillTag(state.pill)
    val key = state.pill.copyKey
    if (tag == null && state.noticeCopyKey == null) return
    Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 12.dp)) {
        if (tag != null && key != null) {
            val enabled = state.pill.enabled
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .testTag(tag)
                    .border(BorderStroke(1.dp, if (enabled) colors.actionPrimary else colors.border), RoundedCornerShape(24.dp))
                    .clickable(enabled = enabled, role = Role.Button, onClick = callbacks.onPillClick)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // screens-b 7.1: aperture badge before the pill label.
                    Icon(
                        painterResource(R.drawable.ic_aperture),
                        contentDescription = null,
                        tint = if (enabled) colors.textPrimary else colors.textInactive,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(ChalkakTheme.spacing.xs))
                    Text(
                        copy[key],
                        style = ChalkakTheme.typography.subheadline,
                        color = if (enabled) colors.textPrimary else colors.textInactive,
                    )
                }
            }
        }
        state.noticeCopyKey?.let {
            Text(
                copy[it],
                style = ChalkakTheme.typography.footnote,
                color = colors.textNeutral,
                modifier = Modifier.padding(top = 8.dp).testTag("feed.ai-message"),
            )
        }
    }
}

/** Dimmed full-screen layer; a tap on the dim calls [onDismiss], taps on the card stay on the card. */
@Composable
private fun Scrim(onDismiss: () -> Unit, contentAlignment: Alignment, content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(ChalkakTheme.colors.scrim)
            // pointerInput, not clickable: clickable merges the whole sheet into one semantics node and hides the testids.
            .pointerInput(onDismiss) { detectTapGestures { onDismiss() } },
        contentAlignment = contentAlignment,
    ) { content() }
}

@Composable
private fun SheetCard(tag: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .background(ChalkakTheme.colors.surfaceElevated, RoundedCornerShape(topStart = ChalkakRadius.sheet, topEnd = ChalkakRadius.sheet))
            .pointerInput(Unit) { detectTapGestures { } }
            .padding(horizontal = ChalkakTheme.spacing.screenHorizontal, vertical = 12.dp)
            .testTag(tag),
    ) {
        // screens-b 1.3: 32 x 4 grabber on the sheet's top edge.
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .padding(bottom = 8.dp)
                .size(width = 32.dp, height = 4.dp)
                .background(ChalkakTheme.colors.border, CircleShape),
        )
        content()
    }
}

@Composable
private fun CloseButton(tag: String, onClick: () -> Unit) {
    val copy = LocalCopy.current
    Box(
        Modifier
            .size(48.dp)
            .testTag(tag)
            .semantics { contentDescription = copy["common.close"] }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(R.drawable.ic_close), contentDescription = null, colorFilter = ColorFilter.tint(ChalkakTheme.colors.iconPrimary), modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun SheetLayer(state: AiReviewUiState, sheet: AiSheet, callbacks: AiReviewCallbacks) {
    Scrim(callbacks.onSheetDismiss, Alignment.BottomCenter) {
        when (sheet) {
            is AiSheet.Start -> StartSheet(sheet, enabled = state.pill != AiPill.Requesting, callbacks)
            is AiSheet.Result -> ResultSheet(sheet.content, callbacks)
            is AiSheet.Failed -> FailedSheet(sheet, callbacks)
        }
    }
}

@Composable
private fun StartSheet(sheet: AiSheet.Start, enabled: Boolean, callbacks: AiReviewCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    SheetCard("ai-start-sheet.root") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(copy[sheet.titleCopyKey], style = ChalkakTheme.typography.title3, color = colors.textPrimary, modifier = Modifier.weight(1f))
            CloseButton("ai-start-sheet.close-button", callbacks.onSheetDismiss)
        }
        // screens-b 7.2: notice box (background, large shape, padding lg) with 36dp circle + icon rows, spacing lg.
        Column(
            Modifier
                .padding(top = ChalkakTheme.spacing.lg, bottom = ChalkakTheme.spacing.lg)
                .fillMaxWidth()
                .background(colors.background, ChalkakTheme.shapes.large)
                .padding(ChalkakTheme.spacing.lg)
                .testTag("ai-start-sheet.description")
                .semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.lg),
        ) {
            val icons = listOf(R.drawable.ic_clock, R.drawable.ic_smartphone, R.drawable.ic_bell)
            sheet.lineCopyKeys.forEachIndexed { index, key ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(36.dp).background(colors.surfaceElevated, CircleShape), contentAlignment = Alignment.Center) {
                        icons.getOrNull(index)?.let {
                            Icon(painterResource(it), contentDescription = null, tint = colors.iconSecondary, modifier = Modifier.size(18.dp))
                        }
                    }
                    Spacer(Modifier.width(ChalkakTheme.spacing.md))
                    Text(copy[key], style = ChalkakTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold), color = colors.textPrimary)
                }
            }
        }
        ChalkakButton(
            copy[sheet.confirmCopyKey],
            callbacks.onStartConfirm,
            Modifier.fillMaxWidth().testTag("ai-start-sheet.start-button"),
            enabled = enabled,
        )
    }
}

@Composable
private fun ResultSheet(content: AiResultUi, callbacks: AiReviewCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    SheetCard("ai-result-sheet.root", Modifier.heightIn(max = 640.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                content.summary,
                style = ChalkakTheme.typography.headline,
                color = colors.textPrimary,
                modifier = Modifier.weight(1f).padding(top = 12.dp).testTag("ai-result-sheet.feedback-summary"),
            )
            CloseButton("ai-result-sheet.close-button", callbacks.onSheetDismiss)
        }
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                // screens-b 7.3: 84dp score ring (track calendarCell, progress actionPrimary, 8dp round cap from 12 o'clock).
                val progress = (content.scoreText.toFloatOrNull() ?: 0f).div(10f).coerceIn(0f, 1f)
                val track = colors.calendarCell
                val bar = colors.actionPrimary
                Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        val stroke = 8.dp.toPx()
                        val inset = stroke / 2f
                        val arc = Size(size.width - stroke, size.height - stroke)
                        drawArc(track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
                        drawArc(bar, -90f, 360f * progress, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
                    }
                    Text(
                        content.scoreText,
                        style = ChalkakTheme.typography.title1,
                        color = colors.textPrimary,
                        modifier = Modifier
                            .testTag("ai-result-sheet.overall-score")
                            .semantics { contentDescription = copy.format(content.scoreA11yCopyKey, "X" to content.scoreText) },
                    )
                }
                // No ko.json key for the bare "/ 10" denominator; the score's own description already says "10점 만점", so hide it from TalkBack.
                Text("/ 10", style = ChalkakTheme.typography.callout, color = colors.textNeutral, modifier = Modifier.padding(start = 6.dp).clearAndSetSemantics {})
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier
                        .size(48.dp)
                        .testTag("ai-result-sheet.criteria-info-button")
                        .semantics { contentDescription = copy["ai.result.criteria-help"] }
                        .clickable(role = Role.Button, onClick = callbacks.onCriteriaHelpClick),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("?", style = ChalkakTheme.typography.headline, color = colors.textNeutral)
                }
            }
            if (content.showPerspectiveBadge) {
                Text(
                    copy["ai.result.distinctive"],
                    style = ChalkakTheme.typography.subheadline,
                    color = colors.textPrimary,
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .background(colors.background, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                        .testTag("ai-result-sheet.distinctive-badge"),
                )
            }
            content.criteria.forEach { row ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                        .testTag("ai-result-sheet.criteria-item-${row.key}")
                        .semantics(mergeDescendants = true) {},
                ) {
                    Text(row.label, style = ChalkakTheme.typography.callout, color = colors.textPrimary, modifier = Modifier.weight(1f))
                    Text(row.scoreText, style = ChalkakTheme.typography.callout, color = colors.textPrimary)
                }
            }
            content.sections.forEach { section ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp)
                        .testTag("ai-result-sheet.feedback-${section.titleCopyKey.substringAfterLast('.')}")
                        .semantics(mergeDescendants = true) {},
                ) {
                    Text(copy[section.titleCopyKey], style = ChalkakTheme.typography.subheadline, color = colors.textPrimary)
                    Text(section.body, style = ChalkakTheme.typography.callout, color = colors.textNeutral, modifier = Modifier.padding(top = 4.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun FailedSheet(sheet: AiSheet.Failed, callbacks: AiReviewCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    SheetCard("ai-failed-sheet.root") {
        Text(copy[sheet.titleCopyKey], style = ChalkakTheme.typography.title3, color = colors.textPrimary)
        sheet.reasonCopyKey?.let {
            Text(
                copy[it],
                style = ChalkakTheme.typography.callout,
                color = colors.textNeutral,
                modifier = Modifier.padding(top = 8.dp).testTag("ai-failed-sheet.message"),
            )
        }
        Spacer(Modifier.height(20.dp))
        if (sheet.reasonCopyKey == null) {
            ChalkakOutlinedButton(
                copy["ai.pill.retry"],
                callbacks.onPillClick,
                Modifier.fillMaxWidth().testTag("ai-failed-sheet.retry-button"),
            )
            Spacer(Modifier.height(8.dp))
        }
        ChalkakButton(copy[sheet.confirmCopyKey], callbacks.onSheetDismiss, Modifier.fillMaxWidth().testTag("ai-failed-sheet.confirm-button"))
    }
}

@Composable
private fun CriteriaDialog(callbacks: AiReviewCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Scrim(callbacks.onCriteriaHelpDismiss, Alignment.Center) {
        Column(
            Modifier
                .fillMaxWidth(0.81f)
                .background(colors.surfaceElevated, ChalkakTheme.shapes.large)
                .pointerInput(Unit) { detectTapGestures { } }
                .padding(start = 40.dp, top = 24.dp, end = 40.dp, bottom = 26.dp)
                .testTag("ai-result-sheet.criteria-dialog"),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                copy["ai.result.criteria-dialog-title"],
                style = ChalkakTheme.typography.title3,
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(20.dp))
            ChalkakDialogButton(
                text = copy["common.confirm"],
                onClick = callbacks.onCriteriaHelpDismiss,
                style = DialogButtonStyle.Primary,
                modifier = Modifier.fillMaxWidth().testTag("ai-result-sheet.criteria-close-button"),
            )
        }
    }
}
