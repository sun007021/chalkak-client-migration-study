package com.stonefive.chalkak.ui.feed

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import com.stonefive.chalkak.ui.components.ChalkakTextField
import com.stonefive.chalkak.ui.components.ChalkakSkeleton
import com.stonefive.chalkak.ui.components.DialogButtonStyle
import com.stonefive.chalkak.ui.components.ChalkakDialogCard
import com.stonefive.chalkak.ui.components.ChalkakDialogButton
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.LikeButton
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.BlockingLayer
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.feature.display.EditDialogState
import kr.chalkak.feature.display.FeedContent
import kr.chalkak.feature.display.FeedStatus
import kr.chalkak.feature.display.FeedUiState
import kr.chalkak.feature.display.PhotoZoom
import kr.chalkak.feature.display.Vec

/** User events of the post detail; [FeedRoute] maps each to the matching `FeedStateHolder` method. */
data class FeedCallbacks(
    val onBack: () -> Unit = {},
    val onLikeClick: () -> Unit = {},
    val onEditClick: () -> Unit = {},
    val onTitleInput: (String) -> Unit = {},
    val onEditCancel: () -> Unit = {},
    val onSaveClick: () -> Unit = {},
    val onDeleteClick: () -> Unit = {},
    val onDeleteCancel: () -> Unit = {},
    val onDeleteConfirm: () -> Unit = {},
    val onRetry: () -> Unit = {},
    /** `ToastLayer` expiry of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

/** Stateless single-post detail: photo with pinch zoom and signature, title row, like, edit/delete, and their dialogs. */
@Composable
fun FeedScreen(
    state: FeedUiState,
    callbacks: FeedCallbacks,
    remoteImage: RemoteImage,
    modifier: Modifier = Modifier,
    /** Slot under the like button (the AI pill); inside the scrolling column. */
    aiPill: @Composable () -> Unit = {},
    /** Full-screen slot above the content (AI sheets, dialog, toast). */
    aiOverlay: @Composable () -> Unit = {},
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Box(modifier.fillMaxSize().background(colors.background).testTag("feed.root")) {
        Column(Modifier.fillMaxSize()) {
            val content = state.content
            // Top bar (screens-b 4.1): back at the start, edit (actionPrimary) and delete (error) glyphs at the end.
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(start = 8.dp, end = 12.dp, top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BackAction(callbacks.onBack, Modifier.testTag("feed.back-button").semantics { contentDescription = copy["common.close"] })
                Spacer(Modifier.weight(1f))
                if (content != null && state.canEditTitle) {
                    IconTool(R.drawable.ic_edit, copy["feed.edit.title"], "feed.edit-title-button", callbacks.onEditClick, colors.actionPrimary)
                }
                if (content != null && state.canDelete) {
                    IconTool(R.drawable.ic_delete, copy["feed.delete.title"], "feed.delete-button", callbacks.onDeleteClick, colors.error)
                }
            }
            when {
                state.status == FeedStatus.Loading && content == null -> FeedSkeleton(Modifier.testTag("feed.loading"))
                state.status == FeedStatus.NotFound ->
                    Box(Modifier.fillMaxSize().padding(32.dp).testTag("feed.not-found-state"), contentAlignment = Alignment.Center) {
                        Text(
                            copy[state.errorCopyKey ?: "feed.error.not-found"],
                            style = ChalkakTheme.typography.body,
                            color = colors.textSecondary,
                            textAlign = TextAlign.Center,
                        )
                    }
                state.status == FeedStatus.Error && content == null ->
                    Column(
                        Modifier.fillMaxSize().padding(32.dp).testTag("feed.error-state"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            copy[state.errorCopyKey ?: "feed.error.load"],
                            style = ChalkakTheme.typography.body,
                            color = colors.textSecondary,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(ChalkakTheme.spacing.xl))
                        ChalkakButton(copy["common.retry"], callbacks.onRetry, Modifier.testTag("feed.retry-button"))
                    }
                content != null -> Detail(state, content, callbacks, remoteImage, aiPill)
            }
        }
        aiOverlay()
        ToastLayer(
            toast = state.toast?.let { ToastUi(it.id, copy[it.copyKey]) },
            onExpired = callbacks.onToastExpired,
        )
        state.edit?.let { EditDialog(it, callbacks) }
        if (state.deleteConfirmVisible) DeleteDialog(callbacks)
        if (state.deleting) {
            BlockingLayer(scrim = colors.scrim.copy(alpha = 0.2f)) { Loading(Modifier.testTag("feed.deleting")) }
        }
    }
}

@Composable
private fun Detail(state: FeedUiState, content: FeedContent, callbacks: FeedCallbacks, remoteImage: RemoteImage, aiPill: @Composable () -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val alt = if (content.title.isNullOrBlank()) copy[content.photoAltCopyKey] else copy.format(content.photoAltCopyKey, "제목" to content.title.orEmpty())
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()) {
        content.dateLabel?.let {
            Text(
                it,
                style = ChalkakTheme.typography.subheadline,
                color = colors.textPrimary,
                modifier = Modifier.padding(start = ChalkakTheme.spacing.screenHorizontal, top = ChalkakTheme.spacing.lg, bottom = ChalkakTheme.spacing.lg).testTag("feed.date-label"),
            )
        }
        ZoomablePhoto(Modifier.fillMaxWidth().testTag("feed.photo").semantics { contentDescription = alt }) {
            remoteImage(content.originalImageUrl ?: content.thumbnailImageUrl, Modifier.fillMaxWidth())
            content.signatureImageUrl?.takeIf { it.isNotBlank() }?.let { signature ->
                remoteImage(signature, Modifier.align(Alignment.BottomEnd).width(70.dp).height(52.dp).padding(ChalkakTheme.spacing.sm).testTag("feed.signature-image"))
            }
        }
        // Action row (screens-b 4.1): 57dp high, 14dp sides; heart + count at the start, the title right-aligned, hairline below.
        Row(
            Modifier.fillMaxWidth().height(57.dp).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.md),
        ) {
            LikeButton(
                isLiked = content.isLiked ?: false,
                count = content.likeCount ?: 0,
                enabled = state.likeEnabled,
                onClick = callbacks.onLikeClick,
                buttonTag = "feed.like-button",
                countTag = "feed.like-count",
                tint = colors.textSecondary,
                liked = colors.actionPrimary,
                iconSize = 24.dp,
                countStyle = ChalkakTheme.typography.body,
            )
            Text(
                content.displayTitle,
                style = ChalkakTheme.typography.body,
                color = colors.textSecondary,
                textAlign = TextAlign.End,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).testTag("feed.title"),
            )
        }
        HorizontalDivider(thickness = 0.5.dp, color = colors.border)
        aiPill()
    }
}

/** Loading stand-in for the detail: the date line and a square photo as shimmering tiles. */
@Composable
private fun FeedSkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize()) {
        ChalkakSkeleton(
            Modifier
                .padding(start = ChalkakTheme.spacing.screenHorizontal, top = ChalkakTheme.spacing.lg, bottom = ChalkakTheme.spacing.lg)
                .size(width = 96.dp, height = 18.dp)
                .clip(ChalkakTheme.shapes.small),
        )
        ChalkakSkeleton(Modifier.fillMaxWidth().aspectRatio(1f))
    }
}

@Composable
private fun IconTool(icon: Int, description: String, tag: String, onClick: () -> Unit, tint: Color) {
    Box(
        Modifier
            .size(48.dp)
            .testTag(tag)
            .semantics { contentDescription = description }
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
    }
}

/**
 * Pinch zoom 1x..4x (`PhotoZoom`): two fingers scale and pan about the touch centroid, one finger is left to the page scroll,
 * lifting the fingers snaps back to 1x (REQ-FEED-011/012). The transformed inner view is `feed.photo-content`.
 */
@Composable
private fun ZoomablePhoto(modifier: Modifier, content: @Composable BoxScope.() -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Vec(0f, 0f)) }
    var size by remember { mutableStateOf(Vec(1f, 1f)) }
    Box(
        modifier
            .clipToBounds()
            .onSizeChanged { size = Vec(it.width.toFloat(), it.height.toFloat()) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.count { it.pressed } >= 2) {
                            val newScale = PhotoZoom.clampScale(scale * event.calculateZoom())
                            val pan = event.calculatePan()
                            val centroid = event.calculateCentroid(useCurrent = false)
                            val focal = Vec(centroid.x - size.x / 2f, centroid.y - size.y / 2f)
                            val moved = PhotoZoom.zoomAbout(focal, Vec(offset.x + pan.x, offset.y + pan.y), scale, newScale, size)
                            scale = newScale
                            offset = moved
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    scale = 1f
                    offset = Vec(0f, 0f)
                }
            },
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .testTag("feed.photo-content")
                .graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
        ) { content() }
    }
}

@Composable
private fun EditDialog(edit: EditDialogState, callbacks: FeedCallbacks) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    BackHandler(enabled = !edit.saving, onBack = callbacks.onEditCancel)
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    BlockingLayer(scrim = colors.scrim) {
        Column(
            Modifier
                .fillMaxWidth(0.88f)
                .background(colors.surfaceElevated, ChalkakTheme.shapes.large)
                .padding(ChalkakTheme.spacing.xl)
                .testTag("feed.title-dialog"),
        ) {
            Text(copy["feed.edit.title"], style = ChalkakTheme.typography.title3, color = colors.textPrimary)
            ChalkakTextField(
                value = edit.input,
                onValueChange = callbacks.onTitleInput,
                enabled = !edit.saving,
                singleLine = true,
                placeholder = copy["feed.edit.placeholder"],
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (!edit.saving) callbacks.onSaveClick() }),
                modifier = Modifier.fillMaxWidth().padding(top = ChalkakTheme.spacing.lg).focusRequester(focus).testTag("feed.title-input"),
            )
            val error = edit.serverMessage ?: edit.errorCopyKey?.let { copy[it] }
            if (error != null) {
                Text(error, style = ChalkakTheme.typography.footnote, color = colors.error, modifier = Modifier.padding(top = ChalkakTheme.spacing.sm))
            }
            Row(
                Modifier.fillMaxWidth().padding(top = ChalkakTheme.spacing.xl),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ChalkakDialogButton(
                    copy["feed.edit.cancel"],
                    callbacks.onEditCancel,
                    Modifier.weight(1f).testTag("feed.title-cancel-button"),
                    style = DialogButtonStyle.Secondary,
                    enabled = !edit.saving,
                )
                ChalkakDialogButton(
                    copy[if (edit.saving) "feed.edit.saving" else "feed.edit.save"],
                    callbacks.onSaveClick,
                    Modifier.weight(1f).testTag("feed.title-save-button"),
                    enabled = !edit.saving,
                )
            }
            if (edit.saving) {
                Box(Modifier.fillMaxWidth().padding(top = ChalkakTheme.spacing.md), contentAlignment = Alignment.Center) {
                    Loading(Modifier.size(18.dp).testTag("feed.title-saving"))
                }
            }
        }
    }
}

@Composable
private fun DeleteDialog(callbacks: FeedCallbacks) {
    val copy = LocalCopy.current
    BackHandler(onBack = callbacks.onDeleteCancel)
    BlockingLayer(scrim = ChalkakTheme.colors.scrim) {
        ChalkakDialogCard(
            title = copy["feed.delete.title"],
            message = copy["feed.delete.body"],
            modifier = Modifier.testTag("feed.delete-dialog"),
            titleModifier = Modifier.testTag("feed.delete-title"),
            messageModifier = Modifier.testTag("feed.delete-body"),
        ) {
            ChalkakDialogButton(copy["feed.delete.cancel"], callbacks.onDeleteCancel, Modifier.weight(1f).testTag("feed.delete-cancel-button"), DialogButtonStyle.Secondary)
            ChalkakDialogButton(copy["feed.delete.confirm"], callbacks.onDeleteConfirm, Modifier.weight(1f).testTag("feed.delete-confirm-button"), DialogButtonStyle.Destructive)
        }
    }
}
