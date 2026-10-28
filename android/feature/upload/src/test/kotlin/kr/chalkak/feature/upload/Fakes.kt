package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.FakeMonotonicClock
import kr.chalkak.core.data.home.testing.FakeHomeRepository
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.upload.testing.FakePostCreationRepository
import kr.chalkak.core.data.upload.testing.FakePostImageUploader
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.upload.edit.PhotoEdit
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

internal val ENTRY_DATE: LocalDate = LocalDate.of(2026, 10, 27)

/** Collects the `screen_view` names sent through [AnalyticsTracker]. */
internal class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

/** Runs on the test scheduler but counts as foreground work (unlike `backgroundScope`). */
internal fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Eagerly collects [flow] for the rest of the test. */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

internal fun photo(id: String = "photo-1", source: PhotoSource = PhotoSource.ALBUM) = PickedPhoto(id, source)

internal fun bytesOf(size: Int, seed: Int): ByteArray = ByteArray(size) { ((it + seed) and 0xFF).toByte() }

internal class FakeImage(override val size: ImageSize, val label: String) : DecodedImage {
    @Volatile var released = false
    override fun release() { released = true }
}

/**
 * Scripted platform codec. Bounds default to 4000x3000 for every photo id; `bounds[id] = null` = unreadable; ids in [throwing]
 * throw. [renderSize] decides what `render` produces (default: same size). Everything is logged in [log].
 */
internal class FakeCodec : PhotoCodec {
    val bounds = ConcurrentHashMap<String, ImageSize>()
    val unreadable: MutableSet<String> = ConcurrentHashMap.newKeySet()
    var defaultBounds: ImageSize? = ImageSize(4000, 3000)
    val boundsGates = ConcurrentHashMap<String, CompletableDeferred<Unit>>()
    val throwing: MutableSet<String> = ConcurrentHashMap.newKeySet()
    var renderSize: (ImageSize, PhotoEdit) -> ImageSize = { size, _ -> size }

    val log = CopyOnWriteArrayList<String>()
    val decodeCalls = CopyOnWriteArrayList<Pair<String, Int>>()
    val renderedEdits = CopyOnWriteArrayList<PhotoEdit>()
    val scaleTargets = CopyOnWriteArrayList<ImageSize>()
    val images = CopyOnWriteArrayList<FakeImage>()

    val fullDecodes: Int get() = decodeCalls.count { it.second == 1 }
    val unreleased: List<FakeImage> get() = images.filter { !it.released }

    override suspend fun readBounds(photo: PickedPhoto): ImageSize? {
        log += "bounds:${photo.id}"
        boundsGates[photo.id]?.await()
        if (photo.id in throwing) throw IllegalStateException("decoder failed")
        if (photo.id in unreadable) return null
        return bounds[photo.id] ?: defaultBounds
    }

    override suspend fun decode(photo: PickedPhoto, sampleSize: Int): DecodedImage {
        log += "decode:${photo.id}:$sampleSize"
        decodeCalls += photo.id to sampleSize
        val full = (if (bounds.containsKey(photo.id)) bounds[photo.id] else defaultBounds) ?: throw IllegalStateException("undecodable")
        val size = ImageSize((full.width + sampleSize - 1) / sampleSize, (full.height + sampleSize - 1) / sampleSize)
        return FakeImage(size, "decoded").also { images += it }
    }

    override suspend fun render(source: DecodedImage, edit: PhotoEdit): DecodedImage {
        log += "render"
        renderedEdits += edit
        return FakeImage(renderSize(source.size, edit), "rendered").also { images += it }
    }

    override suspend fun scale(source: DecodedImage, target: ImageSize): DecodedImage {
        log += "scale:${target.width}x${target.height}"
        scaleTargets += target
        return FakeImage(target, "scaled").also { images += it }
    }
}

/** Lossy compressor with a size table. Content is deterministic per (size, quality) so the PUT body can be compared. */
internal class FakeCompressor : WebpCompressor {
    var sizeFor: (ImageSize, Int) -> Int = { _, _ -> 1_000 }
    var onCall: suspend (ImageSize, Int) -> Unit = { _, _ -> }
    val calls = CopyOnWriteArrayList<Pair<ImageSize, Int>>()

    override suspend fun compress(image: DecodedImage, quality: Int): ByteArray {
        calls += image.size to quality
        onCall(image.size, quality)
        return bytesOf(sizeFor(image.size, quality), quality)
    }
}

internal class FakeTempImages : TempImageStore {
    private val contents = ConcurrentHashMap<String, ByteArray>()
    private val counter = AtomicInteger()
    val saved = CopyOnWriteArrayList<TempImage>()
    val deleted = CopyOnWriteArrayList<TempImage>()

    val live: List<TempImage> get() = saved.filter { contents.containsKey(it.id) }

    override suspend fun save(bytes: ByteArray): TempImage {
        val file = TempImage("tmp-${counter.incrementAndGet()}")
        contents[file.id] = bytes.copyOf()
        saved += file
        return file
    }

    override suspend fun read(file: TempImage): ByteArray = contents[file.id]?.copyOf() ?: throw IllegalStateException("deleted ${file.id}")

    override fun delete(file: TempImage) {
        if (contents.remove(file.id) != null) deleted += file
    }
}

internal class FakeGallery : GallerySaver {
    val saved = CopyOnWriteArrayList<String>()
    var result: Boolean = true
    var throwing = false
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun saveCapture(photo: PickedPhoto): Boolean {
        saved += photo.id
        gate?.await()
        if (throwing) throw SecurityException("permission denied")
        return result
    }
}

internal class FakeToaster : AppToaster {
    val shown = CopyOnWriteArrayList<String>()
    override fun show(copyKey: String) { shown += copyKey }
}

internal class UploadRig(
    val t: TestScope,
    val holder: PhotoUploadStateHolder,
    val home: FakeHomeRepository,
    val creation: FakePostCreationRepository,
    val uploader: FakePostImageUploader,
    val codec: FakeCodec,
    val compressor: FakeCompressor,
    val files: FakeTempImages,
    val gallery: FakeGallery,
    val toaster: FakeToaster,
    val mono: FakeMonotonicClock,
    val creations: PostCreations,
    val analytics: RecordingAnalytics,
    val effects: MutableList<UploadEffect>,
    val states: MutableList<PhotoUploadUiState>,
    val published: MutableList<kr.chalkak.core.data.upload.PostCreated>,
) {
    val s: PhotoUploadUiState get() = holder.state.value

    fun idle() = t.advanceUntilIdle()

    fun advanceSeconds(seconds: Double) {
        mono.advanceMillis((seconds * 1000).toLong())
    }

    /** Shows the screen (topic loads). */
    fun show() {
        holder.onScreenShown()
        idle()
    }

    /** Picks [id] from the album, finishes the editor with [edit]; preparation runs to the end. */
    fun pickAndConfirm(id: String = "photo-1", edit: PhotoEdit = PhotoEdit.IDENTITY) {
        holder.onAlbumPicked(PickerResult.Picked(photo(id)))
        idle()
        holder.onEditorDone(edit)
        idle()
    }

    fun submit() {
        holder.onSubmitClicked()
        idle()
    }

    /** Screen shown + photo confirmed + preparation done. */
    fun ready(id: String = "photo-1", edit: PhotoEdit = PhotoEdit.IDENTITY) {
        show()
        pickAndConfirm(id, edit)
    }

    val errors: List<UploadError> get() = states.mapNotNull { it.error }.distinctBy { it.id }
}

/** Fixture ids of `home/topics__open-2026-10-27.json` (loaded, not copied). */
internal val TOPIC_FIXTURE = HomeFixtureModels.topic("home/topics__open-2026-10-27.json")

internal fun TestScope.uploadRig(
    topicDate: LocalDate = ENTRY_DATE,
    hasCamera: Boolean = true,
    maxEncodedBytes: Int = 1_000,
    configure: UploadRig.() -> Unit = {},
): UploadRig {
    val home = FakeHomeRepository().also {
        it.todayHandler = { ApiResult.Success(HomeFixtureModels.today("home/posts-today__not-posted.json")) }
    }
    val creation = FakePostCreationRepository()
    val uploader = FakePostImageUploader()
    val codec = FakeCodec()
    val compressor = FakeCompressor().also { c -> c.sizeFor = { _, _ -> maxEncodedBytes } }
    val files = FakeTempImages()
    val gallery = FakeGallery()
    val toaster = FakeToaster()
    val mono = FakeMonotonicClock()
    val creations = PostCreations()
    val analytics = RecordingAnalytics()
    val holder = PhotoUploadStateHolder(
        scope = holderScope(),
        topicDate = topicDate,
        home = home,
        creation = creation,
        uploader = uploader,
        encoder = PostImageEncoder(codec, compressor),
        codec = codec,
        files = files,
        gallery = gallery,
        toaster = toaster,
        camera = CameraAvailability { hasCamera },
        monotonic = mono,
        creations = creations,
        analytics = analytics,
    )
    val rig = UploadRig(
        t = this, holder = holder, home = home, creation = creation, uploader = uploader, codec = codec, compressor = compressor,
        files = files, gallery = gallery, toaster = toaster, mono = mono, creations = creations, analytics = analytics,
        effects = collectAll(holder.effects), states = collectAll(holder.state), published = collectAll(creations.events),
    )
    rig.configure()
    return rig
}

internal class GateRig(
    val t: TestScope,
    val holder: UploadGateStateHolder,
    val home: FakeHomeRepository,
    val user: FakeUser,
    val effects: MutableList<UploadGateEffect>,
    val states: MutableList<UploadGateUiState>,
) {
    fun idle() = t.advanceUntilIdle()

    val toasts: List<String> get() = effects.filterIsInstance<UploadGateEffect.Toast>().map { it.copyKey }
}

internal fun TestScope.gateRig(userId: String? = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"): GateRig {
    val home = FakeHomeRepository()
    val user = FakeUser(userId)
    val holder = UploadGateStateHolder(holderScope(), home, user)
    return GateRig(this, holder, home, user, collectAll(holder.effects), collectAll(holder.state))
}
