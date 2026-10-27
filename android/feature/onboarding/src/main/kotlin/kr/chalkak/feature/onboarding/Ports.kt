package kr.chalkak.feature.onboarding

/** Registers the current device for push after signup (REQ-ONB-019). Adapter in :app. */
fun interface DeviceRegistrar {
    suspend fun registerCurrentDevice()
}

/** Opens a URL in the system browser. Returns false when nothing could handle it (adapter in :app). */
fun interface ExternalBrowser {
    fun open(url: String): Boolean
}

/**
 * In-memory signup context for ONE login attempt (REQ-ONB-019/023/027, TC-ONB-017/046). Never persisted, never logged.
 * [begin] replaces any previous pair; [discard] forgets it.
 */
class SignupContext {
    private data class Pair(val idToken: String, val rawNonce: String)

    @Volatile
    private var pair: Pair? = null

    val idToken: String? get() = pair?.idToken
    val rawNonce: String? get() = pair?.rawNonce
    val isPresent: Boolean get() = pair != null

    fun begin(idToken: String, rawNonce: String) {
        pair = Pair(idToken, rawNonce)
    }

    fun discard() {
        pair = null
    }

    override fun toString(): String = "SignupContext(<redacted>)"
}

/** One user-visible message. [id] is unique per occurrence so an identical message shown twice still re-triggers the UI. */
data class FlowError(val id: Long, val copyKey: String? = null, val serverMessage: String? = null)

/** `shared/copy/ko.json` keys used by this module. */
object OnbCopyKeys {
    const val SIGN_ERROR_TOO_LARGE = "sign.error.too-large"
    const val SIGN_ERROR_NETWORK = "sign.error.network"
    const val SIGN_ERROR_INVALID = "sign.error.invalid"
    const val SIGN_ERROR_EXPIRED = "sign.error.expired"
    const val SIGN_LOAD_ERROR = "sign.load.error"
    const val SIGN_CHANGE_DONE = "sign.change.done"
    const val SIGN_CHANGE_ERROR_GENERIC = "sign.change.error.generic"
    const val SIGN_CHANGE_ERROR_NOT_FOUND = "sign.change.error.not-found"
    const val SIGNUP_ERROR_TIMEOUT = "onb.signup.error.timeout"
    const val SIGNUP_ERROR_REUPLOAD = "onb.signup.error.reupload"
    const val SIGNUP_ERROR_GENERIC = "onb.signup.error.generic"
    const val TERMS_DOC_CANNOT_OPEN = "onb.terms.doc.cannot-open"
    const val BANNED_SIGNATURE = "auth.banned.signature"
}
