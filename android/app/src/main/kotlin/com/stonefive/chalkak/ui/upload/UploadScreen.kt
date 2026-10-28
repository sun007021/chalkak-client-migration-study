package com.stonefive.chalkak.ui.upload

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.ImeAction
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.platform.PhotoPreview
import com.stonefive.chalkak.platform.UploadPlatform
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.IconAction
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.photoedit.PhotoEditRoute
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import com.stonefive.chalkak.viewmodel.rememberStateHolder
import kotlinx.coroutines.launch
import java.time.format.DateTimeFormatter
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.PostTitle
import kr.chalkak.feature.upload.PhotoUploadStateHolder
import kr.chalkak.feature.upload.PhotoUploadUiState
import kr.chalkak.feature.upload.Preparation
import kr.chalkak.feature.upload.SuccessInfo
import kr.chalkak.feature.upload.TopicState
import kr.chalkak.feature.upload.UploadEffect
import kr.chalkak.feature.upload.UploadError
import kr.chalkak.feature.upload.UploadSuccessText
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditStateHolder
import kr.chalkak.feature.upload.edit.PhotoEditTransform
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PickedPhoto

/** Events of the upload screen. Defaults do nothing so a test overrides only what it needs. */
interface UploadActions {
    fun onClose() = Unit
    fun onAlbumClick() = Unit
    fun onCameraClick() = Unit
    fun onPhotoClick() = Unit
    fun onTitleChange(raw: String) = Unit
    fun onTopicRetry() = Unit
    fun onSubmit() = Unit
}

/** What the success screen shows after a created post: the numbers of the post, the photo that was uploaded and the edit it carried. */
class UploadResult(val info: SuccessInfo, val photo: PickedPhoto?, val edit: PhotoEdit)

private const val PlaceholderRatio = 1.216f
private val SubmitAreaHeight = 104.dp
private val SideMargin = 22.dp
private val CardDate: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy. MM. dd")

/**
 * Stateless upload screen (testids `upload.*`).
 *
 *  - No photo: dashed area with the topic heading + guide text and the album button (+ camera button only when `cameraAvailable`).
 *    With a photo both buttons are gone and the preview (`upload.photo-preview`, tap = re-edit) takes the photo's aspect ratio.
 *  - The title input is controlled by `state.title` and disabled while `state.submitting`.
 *  - The submit button is enabled exactly when `state.canSubmit`; its label is `state.submitLabelKey`.
 *  - `upload.preparing-indicator` only while `Preparation.Preparing`, `upload.submitting-indicator` only while submitting.
 *  - `upload.error-message` shows `error.serverMessage` or `copy[error.copyKey]` for as long as `state.error` is set (the host clears it).
 *
 * [preview] is the loaded bitmap of `state.photo` (null while loading / no photo). [photoContent] optionally draws the photo with its
 * confirmed edit applied instead of the plain bitmap; the preview then takes the edited (cropped / turned) ratio.
 */
@Composable
fun UploadScreen(
    state: PhotoUploadUiState,
    preview: PhotoPreview?,
    actions: UploadActions,
    modifier: Modifier = Modifier,
    photoContent: (@Composable (Modifier) -> Unit)? = null,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Box(modifier.fillMaxSize().background(colors.background).testTag("upload.root")) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconAction(R.drawable.ic_close, actions::onClose, Modifier.testTag("upload.close-button"))
                Text(
                    text = copy["upload.title"],
                    style = MaterialTheme.typography.titleLarge,
                    color = colors.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.size(48.dp))
            }
            Column(Modifier.weight(1f).fillMaxWidth().imePadding().verticalScroll(rememberScrollState())) {
                PhotoArea(state, preview, actions, photoContent)
                Spacer(Modifier.height(20.dp))
                Column(Modifier.fillMaxWidth().padding(horizontal = SideMargin)) {
                    TitleInput(state, actions)
                    TopicFailure(state, actions)
                    Feedback(state)
                }
                // Room for the submit button that floats over the bottom of the page.
                Spacer(Modifier.height(SubmitAreaHeight))
            }
        }
        ChalkakButton(
            text = copy[state.submitLabelKey],
            onClick = actions::onSubmit,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
                .padding(start = 26.dp, end = 26.dp, bottom = 26.dp)
                .testTag("upload.submit-button"),
            enabled = state.canSubmit,
        )
    }
}

@Composable
private fun PhotoArea(state: PhotoUploadUiState, preview: PhotoPreview?, actions: UploadActions, photoContent: (@Composable (Modifier) -> Unit)?) {
    val colors = ChalkakTheme.colors
    val copy = LocalCopy.current
    val hasPhoto = state.photo != null
    val ratio = when {
        !hasPhoto -> PlaceholderRatio
        preview == null -> 1f
        photoContent == null -> preview.size.ratio()
        else -> PhotoEditTransform.outputSize(preview.size, state.edit.quarterTurns, state.edit.crop).ratio()
    }
    Box(Modifier.fillMaxWidth().aspectRatio(ratio).background(colors.inputBackground)) {
        if (!hasPhoto) {
            Column(
                Modifier.fillMaxSize().padding(8.dp).dashedOutline(colors.border).padding(horizontal = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                val topic = state.topic
                if (topic is TopicState.Loaded) {
                    Text(
                        text = copy.format("upload.heading", "주제" to topic.title),
                        style = MaterialTheme.typography.titleSmall,
                        color = colors.textNeutral,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.testTag("upload.topic-title"),
                    )
                    Spacer(Modifier.height(5.dp))
                }
                Text(
                    text = copy["upload.subheading"],
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.textInactive,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("upload.guide-text"),
                )
            }
            Row(Modifier.align(Alignment.TopEnd).padding(top = 14.dp, end = 11.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RoundIconButton(R.drawable.ic_photo_library, actions::onAlbumClick, Modifier.testTag("upload.album-button"))
                if (state.cameraAvailable) {
                    RoundIconButton(R.drawable.ic_photo_camera, actions::onCameraClick, Modifier.testTag("upload.camera-button"))
                }
            }
        } else {
            Box(
                Modifier.fillMaxSize().testTag("upload.photo-preview").clickable(enabled = !state.submitting, role = Role.Button, onClick = actions::onPhotoClick),
            ) {
                when {
                    preview == null -> Unit
                    photoContent != null -> photoContent(Modifier.fillMaxSize())
                    else -> Image(bitmap = preview.image, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
            }
        }
    }
}

@Composable
private fun RoundIconButton(iconRes: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.66f))
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painter = painterResource(iconRes), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun TitleInput(state: PhotoUploadUiState, actions: UploadActions) {
    val colors = ChalkakTheme.colors
    val copy = LocalCopy.current
    BasicTextField(
        value = state.title,
        onValueChange = actions::onTitleChange,
        enabled = !state.submitting && !state.completed,
        textStyle = MaterialTheme.typography.bodyMedium.copy(color = colors.textPrimary),
        cursorBrush = SolidColor(colors.inputCursor),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        modifier = Modifier.fillMaxWidth().testTag("upload.title-input"),
        decorationBox = { inner ->
            Box(
                Modifier.fillMaxWidth().background(colors.inputBackground, RoundedCornerShape(14.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                if (state.title.isEmpty()) {
                    Text(copy["upload.caption.placeholder"], style = MaterialTheme.typography.bodyMedium, color = colors.textInactive)
                }
                inner()
            }
        },
    )
    Text(
        text = "${PostTitle.length(state.title)}/${AppConstants.POST_TITLE_MAX}",
        style = MaterialTheme.typography.labelMedium,
        color = colors.textInactive,
        textAlign = TextAlign.End,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp).testTag("upload.title-counter"),
    )
}

@Composable
private fun TopicFailure(state: PhotoUploadUiState, actions: UploadActions) {
    val failed = state.topic as? TopicState.Failed ?: return
    val copy = LocalCopy.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp).testTag("upload.error-state")) {
        Text(copy[failed.copyKey], style = MaterialTheme.typography.bodySmall, color = ChalkakTheme.colors.destructive)
        TextButton(onClick = actions::onTopicRetry, modifier = Modifier.testTag("upload.retry-button")) {
            Text(copy["common.retry"], style = MaterialTheme.typography.bodyMedium, color = ChalkakTheme.colors.actionPrimary)
        }
    }
}

@Composable
private fun Feedback(state: PhotoUploadUiState) {
    val copy = LocalCopy.current
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.preparation == Preparation.Preparing) Loading(Modifier.size(20.dp).testTag("upload.preparing-indicator"))
        if (state.submitting) Loading(Modifier.size(20.dp).testTag("upload.submitting-indicator"))
    }
    val error = state.error ?: return
    val text = error.text(copy::get)
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = ChalkakTheme.colors.destructive,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("upload.error-message"),
    )
}

private fun UploadError.text(lookup: (String) -> String): String = serverMessage ?: copyKey?.let(lookup).orEmpty()

private fun ImageSize.ratio(): Float = width.toFloat() / height.toFloat()

private fun Modifier.dashedOutline(color: Color): Modifier = drawBehind {
    val stroke = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx())))
    drawRoundRect(color = color, size = Size(size.width, size.height), cornerRadius = CornerRadius(12.dp.toPx()), style = stroke)
}

/**
 * Wires [holder] + [platform] (picker, camera, preview, editor overlay) to [UploadScreen]. Effects: success, reauth.
 *
 * Starts the holder (`onScreenShown`), ends it when the route leaves (`ScreenGoneEffect`), shows [PhotoEditRoute] over the screen
 * (tag `photo-edit.root`) while `state.editor != null`, and clears a shown error as soon as the user acts again.
 */
@Composable
fun UploadRoute(
    holder: PhotoUploadStateHolder,
    platform: UploadPlatform,
    onClose: () -> Unit,
    onShowSuccess: (SuccessInfo) -> Unit,
    onReauthRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by holder.state.collectAsState()
    val scope = rememberCoroutineScope()
    val latestClose by rememberUpdatedState(onClose)
    val latestSuccess by rememberUpdatedState(onShowSuccess)
    val latestReauth by rememberUpdatedState(onReauthRequired)

    LaunchedEffect(holder) { holder.onScreenShown() }
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is UploadEffect.ShowSuccess -> latestSuccess(effect.info)
                UploadEffect.ReauthRequired -> latestReauth()
                is UploadEffect.OpenDisplay -> Unit // the success screen's confirm is handled by the host's navigation
            }
        }
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }

    val photo = state.photo
    val preview by produceState<PhotoPreview?>(null, photo) { value = photo?.let { platform.previews.load(it) } }

    val actions = remember(holder, platform, scope) {
        object : UploadActions {
            private fun dismissError() {
                holder.state.value.error?.let { holder.onErrorShown(it.id) }
            }

            override fun onClose() = latestClose()

            override fun onAlbumClick() {
                dismissError()
                scope.launch { holder.onAlbumPicked(platform.acquirer.pickFromAlbum()) }
            }

            override fun onCameraClick() {
                dismissError()
                scope.launch { holder.onCameraCaptured(platform.acquirer.capture()) }
            }

            override fun onPhotoClick() {
                dismissError()
                holder.onPhotoTapped()
            }

            override fun onTitleChange(raw: String) {
                dismissError()
                holder.onTitleChanged(raw)
            }

            override fun onTopicRetry() = holder.onTopicRetryClicked()

            override fun onSubmit() {
                dismissError()
                holder.onSubmitClicked()
            }
        }
    }

    val photoContent: (@Composable (Modifier) -> Unit)? = photo?.let { shown ->
        { m -> platform.editPainter.Preview(shown, state.edit, m) }
    }
    Box(modifier.fillMaxSize()) {
        UploadScreen(
            state = state,
            preview = preview,
            actions = actions,
            photoContent = photoContent,
        )
        val editor = state.editor
        if (editor != null) {
            // One editor holder per opening (the request object is new each time), kept by the ViewModel store so a rotation keeps the edits.
            val editHolder = rememberStateHolder("edit-${System.identityHashCode(editor)}") { vmScope ->
                PhotoEditStateHolder(vmScope, platform.editSource, editor.photo, editor.initialEdit)
            }
            PhotoEditRoute(
                holder = editHolder,
                photo = editor.photo,
                painter = platform.editPainter,
                onDone = holder::onEditorDone,
                onCancel = holder::onEditorCancelled,
            )
        }
    }
}

/** `upload-success.*`: card with the photo (drawn by [photoContent] with [edit] applied, else the plain bitmap), record message, status message, confirm button. */
@Composable
fun UploadSuccessScreen(
    info: SuccessInfo,
    preview: PhotoPreview?,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    edit: PhotoEdit = PhotoEdit.IDENTITY,
    photoContent: (@Composable (Modifier) -> Unit)? = null,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(modifier.fillMaxSize().background(colors.background).testTag("upload-success.root")) {
        Column(Modifier.weight(1f).fillMaxWidth().statusBarsPadding().verticalScroll(rememberScrollState())) {
            Spacer(Modifier.height(60.dp))
            Column(Modifier.padding(horizontal = SideMargin).fillMaxWidth().background(colors.inputBackground, RoundedCornerShape(12.dp)).padding(16.dp)) {
                val ratio = preview?.let { PhotoEditTransform.outputSize(it.size, edit.quarterTurns, edit.crop).ratio() } ?: 1f
                Box(Modifier.fillMaxWidth().aspectRatio(ratio).background(colors.border)) {
                    when {
                        preview == null -> Unit
                        photoContent != null -> photoContent(Modifier.fillMaxSize())
                        else -> Image(bitmap = preview.image, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    }
                }
                Text(
                    text = info.topicDate.format(CardDate),
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.textInactive,
                    modifier = Modifier.padding(top = 20.dp),
                )
            }
            Spacer(Modifier.height(34.dp))
            Text(
                text = UploadSuccessText.title(info.topicTitle),
                style = MaterialTheme.typography.headlineSmall,
                color = colors.textPrimary,
                modifier = Modifier.padding(horizontal = SideMargin).testTag("upload-success.message"),
            )
            Text(
                text = copy[UploadSuccessText.statusCopyKey(info.status)],
                style = MaterialTheme.typography.bodySmall,
                color = colors.textNeutral,
                modifier = Modifier.padding(start = SideMargin, top = 10.dp, end = SideMargin, bottom = 40.dp).testTag("upload-success.status-message"),
            )
        }
        ChalkakButton(
            text = copy["upload.success.confirm"],
            onClick = onConfirm,
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 26.dp, end = 26.dp, bottom = 26.dp).testTag("upload-success.confirm-button"),
        )
    }
}
