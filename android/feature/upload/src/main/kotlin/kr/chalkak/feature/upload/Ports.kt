package kr.chalkak.feature.upload

import kr.chalkak.feature.upload.image.PickedPhoto

/** Result of the system album picker / camera: a photo, or the user backed out (state unchanged, TC-UPL-014). */
sealed interface PickerResult {
    data class Picked(val photo: PickedPhoto) : PickerResult

    data object Cancelled : PickerResult
}

/** Saves a captured photo as JPEG into the device gallery (`Pictures/Chalkak/chalkak-photo-*.jpg`). Returns false or throws on failure / denied permission. */
fun interface GallerySaver {
    suspend fun saveCapture(photo: PickedPhoto): Boolean
}

/** App-wide toast that outlives the upload screen (REQ-UPL-016). */
fun interface AppToaster {
    fun show(copyKey: String)
}

/** Whether the device has a camera at all; the camera button is hidden otherwise (REQ-UPL-013). */
fun interface CameraAvailability {
    fun hasCamera(): Boolean
}

/** Handle of one owned WebP temp file. */
data class TempImage(val id: String)

/** App-private temp storage for the encoded WebP. The holder owns every file it saves and deletes it (REQ-UPL-048). */
interface TempImageStore {
    suspend fun save(bytes: ByteArray): TempImage

    suspend fun read(file: TempImage): ByteArray

    /** Idempotent. */
    fun delete(file: TempImage)
}

/** `shared/copy/ko.json` keys used by the upload holders. */
object UploadCopyKeys {
    const val GATE_LOGIN_REQUIRED = "upload.gate.login-required"
    const val GATE_ALREADY_POSTED = "upload.gate.already-posted"
    const val GATE_NO_OPEN_TOPIC = "upload.gate.no-open-topic"
    const val GATE_BANNED = "upload.gate.banned"
    const val GATE_CHECK_FAILED = "upload.gate.check-failed"
    const val TOPIC_LOAD_FAILED = "upload.topic.load-failed"
    const val CAMERA_SAVE_FAILED = "upload.camera.save-failed"
    const val ERROR_NETWORK = "upload.error.network"
    const val ERROR_PREPARE = "upload.error.prepare"
    const val ERROR_UPLOAD = "upload.error.upload"
    const val ERROR_CREATE = "upload.error.create"
    const val ERROR_DUPLICATE = "upload.error.duplicate"
    const val ERROR_TOPIC_CHANGED = "upload.error.topic-changed"
    const val SUBMIT = "upload.submit"
    const val SUBMITTING = "upload.submitting"
    const val SUCCESS_PENDING = "upload.success.pending"
    const val SUCCESS_VALIDATING = "upload.success.validating"
}
