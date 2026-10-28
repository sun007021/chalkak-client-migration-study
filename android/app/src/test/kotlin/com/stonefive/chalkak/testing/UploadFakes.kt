package com.stonefive.chalkak.testing

import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.performSemanticsAction
import com.stonefive.chalkak.platform.EditPreviewPainter
import com.stonefive.chalkak.platform.PhotoAcquirer
import com.stonefive.chalkak.platform.PhotoPreview
import com.stonefive.chalkak.platform.PhotoPreviewLoader
import com.stonefive.chalkak.platform.UploadPlatform
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.common.testing.FakeMonotonicClock
import kr.chalkak.core.data.home.testing.FakeHomeRepository
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.upload.testing.FakePostCreationRepository
import kr.chalkak.core.data.upload.testing.FakePostImageUploader
import kr.chalkak.feature.upload.AppToaster
import kr.chalkak.feature.upload.CameraAvailability
import kr.chalkak.feature.upload.GallerySaver
import kr.chalkak.feature.upload.PhotoUploadStateHolder
import kr.chalkak.feature.upload.PickerResult
import kr.chalkak.feature.upload.TempImage
import kr.chalkak.feature.upload.TempImageStore
import kr.chalkak.feature.upload.edit.AutoAdjustments
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.EditImageSession
import kr.chalkak.feature.upload.edit.EditImageSource
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditStateHolder
import kr.chalkak.feature.upload.image.DecodedImage
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PhotoCodec
import kr.chalkak.feature.upload.image.PhotoSource
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.image.PostImageEncoder
import kr.chalkak.feature.upload.image.WebpCompressor
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.test.assertTrue

val UPLOAD_ENTRY_DATE: LocalDate = LocalDate.of(2026, 10, 27)

/** Topic title of `home/topics__open-2026-10-27.json` (the fake home repository serves it for [UPLOAD_ENTRY_DATE]). */
const val UPLOAD_TOPIC_TITLE = "가을 하늘"

fun albumPhoto(id: String = "album-1") = PickedPhoto(id, PhotoSource.ALBUM)

fun cameraPhoto(id: String = "camera-1") = PickedPhoto(id, PhotoSource.CAMERA)

/** A bitmap whose pixel size is tiny but whose reported original size is [size] (the screen shows the ORIGINAL ratio). */
fun previewOf(size: ImageSize = ImageSize(4000, 3000)) = PhotoPreview(ImageBitmap(8, 6), size)

/** System picker / camera stand-in: returns the scripted results and counts the calls. */
class FakePhotoAcquirer(
    var album: PickerResult = PickerResult.Picked(albumPhoto()),
    var camera: PickerResult = PickerResult.Picked(cameraPhoto()),
) : PhotoAcquirer {
    var albumCalls = 0
    var cameraCalls = 0

    override suspend fun pickFromAlbum(): PickerResult { albumCalls++; return album }

    override suspend fun capture(): PickerResult { cameraCalls++; return camera }
}

/** Bounds/decoding stand-in. Ids in [unreadable] -> null bounds (zero bytes), ids in [corrupt] -> the decoder throws. */
class FakeUploadCodec : PhotoCodec {
    val unreadable: MutableSet<String> = ConcurrentHashMap.newKeySet()
    val corrupt: MutableSet<String> = ConcurrentHashMap.newKeySet()
    val boundsCalls = CopyOnWriteArrayList<String>()

    private class Image(override val size: ImageSize) : DecodedImage {
        override fun release() = Unit
    }

    override suspend fun readBounds(photo: PickedPhoto): ImageSize? {
        boundsCalls += photo.id
        if (photo.id in corrupt) throw IllegalStateException("truncated image")
        return if (photo.id in unreadable) null else ImageSize(4000, 3000)
    }

    override suspend fun decode(photo: PickedPhoto, sampleSize: Int): DecodedImage = Image(ImageSize(4000 / sampleSize, 3000 / sampleSize))

    override suspend fun render(source: DecodedImage, edit: PhotoEdit): DecodedImage = Image(source.size)

    override suspend fun scale(source: DecodedImage, target: ImageSize): DecodedImage = Image(target)
}

private class SmallWebp : WebpCompressor {
    override suspend fun compress(image: DecodedImage, quality: Int): ByteArray = ByteArray(100) { it.toByte() }
}

private class MemoryTempImages : TempImageStore {
    private val contents = ConcurrentHashMap<String, ByteArray>()
    private val counter = AtomicInteger()

    override suspend fun save(bytes: ByteArray): TempImage = TempImage("tmp-${counter.incrementAndGet()}").also { contents[it.id] = bytes }

    override suspend fun read(file: TempImage): ByteArray = contents.getValue(file.id)

    override fun delete(file: TempImage) { contents.remove(file.id) }
}

/** Opens a fake editor session. [auto] is what the analysis returns (null = cannot be analysed). */
class FakeEditSource(
    var size: ImageSize = ImageSize(4000, 3000),
    var auto: AutoAdjustments? = null,
) : EditImageSource {
    var failRenders = 0
    var renderGate: CompletableDeferred<Unit>? = null
    val renders = CopyOnWriteArrayList<PhotoEdit>()
    val analyses = CopyOnWriteArrayList<Pair<Int, CropWindow>>()
    var opened = 0

    override suspend fun open(photo: PickedPhoto): EditImageSession? {
        opened++
        return object : EditImageSession {
            override val size: ImageSize get() = this@FakeEditSource.size

            override suspend fun analyzeAuto(quarterTurns: Int, crop: CropWindow): AutoAdjustments? {
                analyses += quarterTurns to crop
                return auto
            }

            override suspend fun renderFull(edit: PhotoEdit) {
                renderGate?.await()
                renders += edit
                if (failRenders > 0) {
                    failRenders--
                    throw IllegalStateException("render failed")
                }
            }

            override fun close() = Unit
        }
    }
}

/** Records the edit each preview was drawn with (the platform draws it with ColorMatrix / GPU). */
class RecordingEditPainter : EditPreviewPainter {
    val edits = CopyOnWriteArrayList<PhotoEdit>()
    val lastEdit: PhotoEdit? get() = edits.lastOrNull()

    @Composable
    override fun Preview(photo: PickedPhoto, edit: PhotoEdit, modifier: Modifier) {
        edits += edit
        Box(modifier)
    }
}

class UploadHolderRig(
    val holder: PhotoUploadStateHolder,
    val codec: FakeUploadCodec,
    val acquirer: FakePhotoAcquirer,
    val editSource: FakeEditSource,
    val painter: RecordingEditPainter,
    val platform: UploadPlatform,
)

/** The real [PhotoUploadStateHolder] on fakes (what `MainDependencies.newUploadHolder` builds in the app). */
fun fakeUploadHolder(
    scope: CoroutineScope,
    codec: FakeUploadCodec = FakeUploadCodec(),
    topicDate: LocalDate = UPLOAD_ENTRY_DATE,
    hasCamera: Boolean = true,
) = PhotoUploadStateHolder(
    scope = scope,
    topicDate = topicDate,
    home = FakeHomeRepository(),
    creation = FakePostCreationRepository(),
    uploader = FakePostImageUploader(),
    encoder = PostImageEncoder(codec, SmallWebp()),
    codec = codec,
    files = MemoryTempImages(),
    gallery = GallerySaver { true },
    toaster = AppToaster { },
    camera = CameraAvailability { hasCamera },
    monotonic = FakeMonotonicClock(),
    creations = PostCreations(),
    analytics = RecordingAnalytics(),
)

/** The real [PhotoUploadStateHolder] on fakes. Photo preview: always [previewOf] a 4000x3000 image. */
fun uploadHolderRig(scope: HolderScope, hasCamera: Boolean = true): UploadHolderRig {
    val codec = FakeUploadCodec()
    val acquirer = FakePhotoAcquirer()
    val editSource = FakeEditSource()
    val painter = RecordingEditPainter()
    val holder = fakeUploadHolder(scope.scope, codec, hasCamera = hasCamera)
    val platform = UploadPlatform(acquirer, PhotoPreviewLoader { previewOf() }, editSource, painter)
    return UploadHolderRig(holder, codec, acquirer, editSource, painter, platform)
}

fun editHolder(scope: HolderScope, source: FakeEditSource, initial: PhotoEdit = PhotoEdit.IDENTITY) =
    PhotoEditStateHolder(scope.scope, source, albumPhoto(), initial)

// ---- semantics helpers -------------------------------------------------------------------------------------------

/** Current value / range of a slider node (`ProgressBarRangeInfo`). */
fun SemanticsNodeInteraction.progress(): ProgressBarRangeInfo = fetchSemanticsNode().config[SemanticsProperties.ProgressBarRangeInfo]

fun SemanticsNodeInteraction.assertProgress(current: Float, range: ClosedFloatingPointRange<Float>): SemanticsNodeInteraction {
    val info = progress()
    assertTrue(abs(info.current - current) < 0.01f, "progress ${info.current} != $current")
    assertTrue(info.range.start == range.start && info.range.endInclusive == range.endInclusive, "range ${info.range} != $range")
    return this
}

/** Drives the slider's `SetProgress` action (what a drag or TalkBack does). */
fun SemanticsNodeInteraction.setProgress(value: Float): SemanticsNodeInteraction =
    performSemanticsAction(SemanticsActions.SetProgress) { it(value) }

fun SemanticsNodeInteraction.editableText(): String = fetchSemanticsNode().config[SemanticsProperties.EditableText].text

/** Every node whose test tag starts with [prefix] (tree order = display order). */
fun hasTestTagPrefix(prefix: String) = SemanticsMatcher("test tag starts with $prefix") {
    SemanticsProperties.TestTag in it.config && it.config[SemanticsProperties.TestTag].startsWith(prefix)
}
