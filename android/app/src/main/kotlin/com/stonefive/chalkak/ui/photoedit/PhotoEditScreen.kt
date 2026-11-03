package com.stonefive.chalkak.ui.photoedit

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.platform.EditPreviewPainter
import com.stonefive.chalkak.ui.components.ChalkakAlert
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import kr.chalkak.feature.upload.edit.AdjustItem
import kr.chalkak.feature.upload.edit.CropAspectRatio
import kr.chalkak.feature.upload.edit.CropCorner
import kr.chalkak.feature.upload.edit.CropFrame
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.EditTab
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditEffect
import kr.chalkak.feature.upload.edit.PhotoEditStateHolder
import kr.chalkak.feature.upload.edit.PhotoEditUiState
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PickedPhoto
import kotlin.math.abs

/** Events of the editor screen. Defaults do nothing so a test overrides only what it needs. */
interface PhotoEditActions {
    fun onTabSelected(tab: EditTab) = Unit
    fun onRatioSelected(ratio: CropAspectRatio) = Unit
    fun onRotate() = Unit
    fun onCropReset() = Unit
    fun onFrameMoved(dx: Double, dy: Double) = Unit
    fun onCornerDragged(corner: CropCorner, x: Double, y: Double) = Unit
    fun onAdjustItemSelected(item: AdjustItem) = Unit
    fun onAdjustValueChanged(item: AdjustItem, value: Double) = Unit

    /** The auto toggle and the strength slider (0..1; the toggle sends 1 / 0). */
    fun onAutoStrengthChanged(strength: Double) = Unit
    fun onAdjustReset() = Unit
    fun onFilterSelected(filter: PhotoFilter) = Unit
    fun onDone() = Unit
    fun onCancel() = Unit

    /** The error alert's confirm button (`id` = `state.toast.id`). */
    fun onErrorConfirm(id: Long) = Unit
}

private val EditBackground = Color(0xFF141312)
private val EditContent = Color.White
private val EditMuted = Color.White.copy(alpha = 0.56f)
private val EditSelected = Color.White.copy(alpha = 0.18f)
private const val ADJUST_SCALE = 100.0
private val RowHeight = 34.dp

private fun String.tagPart(prefix: String) = removePrefix(prefix)

/**
 * Stateless editor (testids `photo-edit.*`). [preview] draws the photo with `state.edit` applied; it is called with the sized slot
 * (`photo-edit.preview-image`). Only the selected tab's tools are in the tree. The crop tab overlays `photo-edit.crop-area` (frame
 * handles) on the preview; the other tabs show the preview at the cropped ratio.
 */
@Composable
fun PhotoEditScreen(
    state: PhotoEditUiState,
    preview: @Composable (Modifier) -> Unit,
    actions: PhotoEditActions,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    Box(modifier.fillMaxSize().background(EditBackground).testTag("photo-edit.root")) {
        Column(Modifier.fillMaxSize()) {
            TopBar(state, actions)
            PreviewArea(state, preview, actions, Modifier.weight(1f).fillMaxWidth())
            Tools(state, actions)
            TabBar(state.tab, actions)
        }
        val toast = state.toast
        if (toast != null) {
            ChalkakAlert(
                title = null,
                message = copy[toast.copyKey],
                onConfirm = { actions.onErrorConfirm(toast.id) },
                tag = "photo-edit.error-dialog",
                confirmTag = "photo-edit.error-dialog-confirm-button",
            )
        }
    }
}

@Composable
private fun TopBar(state: PhotoEditUiState, actions: PhotoEditActions) {
    val copy = LocalCopy.current
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = actions::onCancel, modifier = Modifier.testTag("photo-edit.cancel-button")) {
            Text(copy["edit.top.cancel"], color = EditContent, style = MaterialTheme.typography.titleSmall)
        }
        Spacer(Modifier.weight(1f))
        TextButton(
            onClick = actions::onDone,
            enabled = state.ready && !state.busy,
            modifier = Modifier.testTag("photo-edit.done-button"),
        ) {
            Text(copy["edit.top.done"], color = if (state.ready && !state.busy) EditContent else EditMuted, style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
private fun PreviewArea(state: PhotoEditUiState, preview: @Composable (Modifier) -> Unit, actions: PhotoEditActions, modifier: Modifier) {
    val ratio = state.displayedSize?.let { shownRatio(it, state) } ?: 1f
    Box(modifier.padding(horizontal = 16.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.aspectRatio(ratio)) {
            preview(Modifier.fillMaxSize().testTag("photo-edit.preview-image"))
            if (state.tab == EditTab.CROP && state.ready) {
                CropOverlay(state.frame, actions, Modifier.fillMaxSize().testTag("photo-edit.crop-area"))
            }
        }
        if (state.busy) Loading(Modifier.testTag("photo-edit.rendering-indicator"))
    }
}

/** The crop tab shows the whole turned photo (the frame sits on it); the other tabs show the cropped part. */
private fun shownRatio(displayed: ImageSize, state: PhotoEditUiState): Float {
    val full = displayed.width.toFloat() / displayed.height.toFloat()
    if (state.tab == EditTab.CROP) return full
    val frame = state.frame
    return full * (frame.width / frame.height).toFloat()
}

@Composable
private fun Tools(state: PhotoEditUiState, actions: PhotoEditActions) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        when (state.tab) {
            EditTab.CROP -> CropTools(state, actions)
            EditTab.ADJUST -> AdjustTools(state, actions)
            EditTab.FILTER -> FilterTools(state, actions)
        }
    }
}

@Composable
private fun CropTools(state: PhotoEditUiState, actions: PhotoEditActions) {
    val copy = LocalCopy.current
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        CropAspectRatio.entries.forEach { ratio ->
            ToolChip(
                label = copy[ratio.copyKey],
                selected = state.aspect == ratio,
                tag = "photo-edit.ratio-" + ratio.copyKey.tagPart("edit.ratio."),
                onClick = { actions.onRatioSelected(ratio) },
                horizontalPadding = 6.dp,
            )
        }
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = actions::onRotate, modifier = Modifier.testTag("photo-edit.rotate-button")) {
            Text(copy["edit.crop.rotate"], color = EditContent, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = actions::onCropReset, modifier = Modifier.testTag("photo-edit.reset-button")) {
            Text(copy["edit.crop.reset"], color = EditContent, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun AdjustTools(state: PhotoEditUiState, actions: PhotoEditActions) {
    val copy = LocalCopy.current
    val layers = state.adjustments
    CompactControls {
        Row(Modifier.fillMaxWidth().height(RowHeight), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = copy[AdjustItem.AUTO.copyKey],
                color = EditContent,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.width(LabelWidth).testTag("photo-edit.adjust-item-auto"),
            )
            Switch(
                checked = layers.autoStrength > 0.0,
                onCheckedChange = { on -> actions.onAutoStrengthChanged(if (on) 1.0 else 0.0) },
                colors = SwitchDefaults.colors(checkedTrackColor = EditContent, checkedThumbColor = EditBackground),
                modifier = Modifier.testTag("photo-edit.adjust-auto-toggle"),
            )
            EditSlider(
                value = layers.autoStrength.toFloat(),
                range = 0f..1f,
                onChange = { actions.onAutoStrengthChanged(it.toDouble()) },
                modifier = Modifier.weight(1f).testTag("photo-edit.adjust-auto-strength-slider"),
            )
            TextButton(onClick = actions::onAdjustReset, modifier = Modifier.testTag("photo-edit.reset-button")) {
                Text(copy["edit.adjust.reset"], color = EditContent, style = MaterialTheme.typography.bodySmall)
            }
        }
        AdjustItem.entries.filter { it != AdjustItem.AUTO }.forEach { item ->
            val name = item.copyKey.tagPart("edit.adjust.")
            Row(Modifier.fillMaxWidth().height(RowHeight), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = copy[item.copyKey],
                    color = if (state.adjustItem == item) EditContent else EditMuted,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier
                        .width(LabelWidth)
                        .testTag("photo-edit.adjust-item-$name")
                        .selectable(selected = state.adjustItem == item, role = Role.Tab, onClick = { actions.onAdjustItemSelected(item) }),
                )
                EditSlider(
                    value = (layers.effective(item) * ADJUST_SCALE).toFloat(),
                    range = -ADJUST_SCALE.toFloat()..ADJUST_SCALE.toFloat(),
                    onChange = { actions.onAdjustValueChanged(item, it / ADJUST_SCALE) },
                    modifier = Modifier.weight(1f).testTag("photo-edit.adjust-$name-slider"),
                )
            }
        }
    }
}

private val LabelWidth = 76.dp

@Composable
private fun CompactControls(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides Dp.Unspecified, content = content)
}

@Composable
private fun EditSlider(value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit, modifier: Modifier) {
    Slider(
        value = value.coerceIn(range.start, range.endInclusive),
        onValueChange = onChange,
        valueRange = range,
        colors = SliderDefaults.colors(
            thumbColor = EditContent,
            activeTrackColor = EditContent,
            inactiveTrackColor = EditContent.copy(alpha = 0.28f),
        ),
        modifier = modifier,
    )
}

@Composable
private fun FilterTools(state: PhotoEditUiState, actions: PhotoEditActions) {
    val copy = LocalCopy.current
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        PhotoFilter.entries.forEach { filter ->
            ToolChip(
                label = copy[filter.copyKey],
                selected = state.filter == filter,
                tag = "photo-edit.filter-" + filter.copyKey.tagPart("edit.filter."),
                onClick = { actions.onFilterSelected(filter) },
                horizontalPadding = 4.dp,
                verticalPadding = 14.dp,
            )
        }
    }
}

@Composable
private fun ToolChip(
    label: String,
    selected: Boolean,
    tag: String,
    onClick: () -> Unit,
    horizontalPadding: Dp,
    verticalPadding: Dp = 7.dp,
) {
    Box(
        Modifier
            .testTag(tag)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) EditSelected else Color.Transparent)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .widthIn(min = 28.dp)
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected) EditContent else EditMuted, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable
private fun TabBar(selected: EditTab, actions: PhotoEditActions) {
    val copy = LocalCopy.current
    Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
        listOf(
            Triple(EditTab.CROP, "edit.tab.crop", "photo-edit.tab-crop"),
            Triple(EditTab.ADJUST, "edit.tab.adjust", "photo-edit.tab-adjust"),
            Triple(EditTab.FILTER, "edit.tab.filter", "photo-edit.tab-filter"),
        ).forEach { (tab, key, tag) ->
            Box(
                Modifier
                    .testTag(tag)
                    .clip(RoundedCornerShape(8.dp))
                    .selectable(selected = selected == tab, role = Role.Tab, onClick = { actions.onTabSelected(tab) })
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(copy[key], color = if (selected == tab) EditContent else EditMuted, style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

private val HandleHit = 36.dp

/** Frame of the crop on the whole turned photo: dimmed outside, thirds grid, corner handles; drag a corner to resize, anywhere else to move. */
@Composable
private fun CropOverlay(frame: CropFrame, actions: PhotoEditActions, modifier: Modifier) {
    var box by remember { mutableStateOf(IntSize.Zero) }
    val latestFrame by rememberUpdatedState(frame)
    val latestActions by rememberUpdatedState(actions)
    Canvas(
        modifier
            .onSizeChanged { box = it }
            .pointerInput(Unit) {
                var corner: CropCorner? = null
                detectDragGestures(
                    onDragStart = { start -> corner = cornerAt(start, latestFrame, size, HandleHit.toPx()) },
                    onDragEnd = { corner = null },
                    onDragCancel = { corner = null },
                ) { change, drag ->
                    change.consume()
                    val w = size.width.toDouble().coerceAtLeast(1.0)
                    val h = size.height.toDouble().coerceAtLeast(1.0)
                    val active = corner
                    if (active == null) {
                        latestActions.onFrameMoved(drag.x / w, drag.y / h)
                    } else {
                        latestActions.onCornerDragged(active, (change.position.x / w).coerceIn(0.0, 1.0), (change.position.y / h).coerceIn(0.0, 1.0))
                    }
                }
            },
    ) {
        drawCrop(frame, box)
    }
}

private fun cornerAt(point: Offset, frame: CropFrame, size: IntSize, hit: Float): CropCorner? {
    val left = ((frame.centerX - frame.width / 2) * size.width).toFloat()
    val right = ((frame.centerX + frame.width / 2) * size.width).toFloat()
    val top = ((frame.centerY - frame.height / 2) * size.height).toFloat()
    val bottom = ((frame.centerY + frame.height / 2) * size.height).toFloat()
    return listOf(
        CropCorner.TOP_LEFT to Offset(left, top),
        CropCorner.TOP_RIGHT to Offset(right, top),
        CropCorner.BOTTOM_LEFT to Offset(left, bottom),
        CropCorner.BOTTOM_RIGHT to Offset(right, bottom),
    ).filter { (_, at) -> abs(point.x - at.x) <= hit && abs(point.y - at.y) <= hit }
        .minByOrNull { (_, at) -> abs(point.x - at.x) + abs(point.y - at.y) }
        ?.first
}

private fun DrawScope.drawCrop(frame: CropFrame, box: IntSize) {
    if (box.width == 0 || box.height == 0) return
    val w = size.width
    val h = size.height
    val left = ((frame.centerX - frame.width / 2) * w).toFloat()
    val right = ((frame.centerX + frame.width / 2) * w).toFloat()
    val top = ((frame.centerY - frame.height / 2) * h).toFloat()
    val bottom = ((frame.centerY + frame.height / 2) * h).toFloat()
    val scrim = Color.Black.copy(alpha = 0.55f)
    drawRect(scrim, Offset.Zero, Size(w, top))
    drawRect(scrim, Offset(0f, bottom), Size(w, h - bottom))
    drawRect(scrim, Offset(0f, top), Size(left, bottom - top))
    drawRect(scrim, Offset(right, top), Size(w - right, bottom - top))
    drawRect(Color.White, Offset(left, top), Size(right - left, bottom - top), style = Stroke(1.dp.toPx()))
    val grid = Color.White.copy(alpha = 0.4f)
    for (i in 1..2) {
        val x = left + (right - left) * i / 3f
        val y = top + (bottom - top) * i / 3f
        drawLine(grid, Offset(x, top), Offset(x, bottom), 0.5.dp.toPx())
        drawLine(grid, Offset(left, y), Offset(right, y), 0.5.dp.toPx())
    }
    val arm = 18.dp.toPx()
    val thick = 3.dp.toPx()
    listOf(left to top to (1 to 1), right to top to (-1 to 1), left to bottom to (1 to -1), right to bottom to (-1 to -1)).forEach { (point, dir) ->
        val (x, y) = point
        val (dx, dy) = dir
        drawLine(Color.White, Offset(x, y), Offset(x + dx * arm, y), thick)
        drawLine(Color.White, Offset(x, y), Offset(x, y + dy * arm), thick)
    }
}

/**
 * Wires [holder]: `start()`, effects (Done / Cancelled), `onScreenGone`. The preview comes from [painter]: the crop tab draws the whole
 * turned photo (the frame is an overlay), the other tabs the cropped photo; adjustments and filter are applied in both.
 */
@Composable
fun PhotoEditRoute(
    holder: PhotoEditStateHolder,
    photo: PickedPhoto,
    painter: EditPreviewPainter,
    onDone: (PhotoEdit) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by holder.state.collectAsState()
    val latestDone by rememberUpdatedState(onDone)
    val latestCancel by rememberUpdatedState(onCancel)

    LaunchedEffect(holder) { holder.start() }
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is PhotoEditEffect.Done -> latestDone(effect.edit)
                PhotoEditEffect.Cancelled -> latestCancel()
            }
        }
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    BackHandler(onBack = holder::onCancelClicked)

    val actions = remember(holder) {
        object : PhotoEditActions {
            override fun onTabSelected(tab: EditTab) = holder.onTabSelected(tab)
            override fun onRatioSelected(ratio: CropAspectRatio) = holder.onAspectRatioSelected(ratio)
            override fun onRotate() = holder.onRotateClicked()
            override fun onCropReset() = holder.onCropResetClicked()
            override fun onFrameMoved(dx: Double, dy: Double) = holder.onFrameMoved(dx, dy)
            override fun onCornerDragged(corner: CropCorner, x: Double, y: Double) = holder.onCornerDragged(corner, x, y)
            override fun onAdjustItemSelected(item: AdjustItem) = holder.onAdjustItemSelected(item)
            override fun onAdjustValueChanged(item: AdjustItem, value: Double) = holder.onAdjustValueChanged(item, value)
            override fun onAutoStrengthChanged(strength: Double) = holder.onAutoStrengthChanged(strength)
            override fun onAdjustReset() = holder.onAdjustResetClicked()
            override fun onFilterSelected(filter: PhotoFilter) = holder.onFilterSelected(filter)
            override fun onDone() = holder.onDoneClicked()
            override fun onCancel() = holder.onCancelClicked()
            override fun onErrorConfirm(id: Long) = holder.onToastShown(id)
        }
    }
    val shown = if (state.tab == EditTab.CROP) state.edit.copy(crop = CropWindow.FULL) else state.edit
    PhotoEditScreen(state, preview = { slot -> painter.Preview(photo, shown, slot) }, actions = actions, modifier = modifier)
}
