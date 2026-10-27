package kr.chalkak.feature.auth

import kotlinx.coroutines.CancellationException

/** Result of one Kakao login attempt as the UI layer sees it. */
sealed interface KakaoLoginResult {
    data class IdToken(val value: String) : KakaoLoginResult
    data object Cancelled : KakaoLoginResult
    /** SDK succeeded without an ID token (REQ-AUTH-008). */
    data object MissingIdToken : KakaoLoginResult
    /** Kakao SDK misconfiguration (missing app key, no host Activity). */
    data object ConfigError : KakaoLoginResult
    data object Failed : KakaoLoginResult
}

/** Platform adapter boundary. [hashedNonce] is SHA-256 lowercase hex of the raw nonce. */
fun interface SocialLoginClient {
    suspend fun requestIdToken(hashedNonce: String): KakaoLoginResult
}

/** Raw Kakao SDK calls (adapter in :app). */
interface KakaoSdk {
    suspend fun isTalkLoginAvailable(): Boolean
    suspend fun loginWithTalk(hashedNonce: String): KakaoSdkResult
    suspend fun loginWithAccount(hashedNonce: String): KakaoSdkResult
}

sealed interface KakaoSdkResult {
    /** [idToken] null = SDK returned no ID token. */
    data class Success(val idToken: String?) : KakaoSdkResult
    data object Cancelled : KakaoSdkResult
    data object ConfigError : KakaoSdkResult
    data object Error : KakaoSdkResult
}

/**
 * Talk login first when available; account login if Talk is unavailable (or availability check throws) or fails for a
 * reason other than user cancel; no fallback after a cancel (REQ-AUTH-005/006).
 */
class KakaoSocialLoginClient(private val sdk: KakaoSdk) : SocialLoginClient {
    override suspend fun requestIdToken(hashedNonce: String): KakaoLoginResult {
        if (!talkAvailable()) return sdkLogin { sdk.loginWithAccount(hashedNonce) }.toLoginResult()
        val talk = sdkLogin { sdk.loginWithTalk(hashedNonce) }
        if (talk is KakaoSdkResult.Success || talk == KakaoSdkResult.Cancelled) return talk.toLoginResult()
        return sdkLogin { sdk.loginWithAccount(hashedNonce) }.toLoginResult()
    }

    private suspend fun talkAvailable(): Boolean = try {
        sdk.isTalkLoginAvailable()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    private suspend fun sdkLogin(call: suspend () -> KakaoSdkResult): KakaoSdkResult = try {
        call()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        KakaoSdkResult.Error
    }

    private fun KakaoSdkResult.toLoginResult(): KakaoLoginResult = when (this) {
        is KakaoSdkResult.Success -> idToken?.takeIf { it.isNotBlank() }?.let { KakaoLoginResult.IdToken(it) } ?: KakaoLoginResult.MissingIdToken
        KakaoSdkResult.Cancelled -> KakaoLoginResult.Cancelled
        KakaoSdkResult.ConfigError -> KakaoLoginResult.ConfigError
        KakaoSdkResult.Error -> KakaoLoginResult.Failed
    }
}

enum class UpdateCheckResult { UpdateRequired, UpToDate, Unavailable }

fun interface UpdateChecker {
    suspend fun check(): UpdateCheckResult
}

/** Play In-App Update info source (adapter in :app). Null = could not be read. */
fun interface PlayUpdateSource {
    suspend fun updatePriority(): Int?
}

/** priority >= 1 -> UpdateRequired, 0 -> UpToDate, null/throw -> Unavailable (D-15). */
class PlayUpdateChecker(private val source: PlayUpdateSource) : UpdateChecker {
    override suspend fun check(): UpdateCheckResult {
        val priority = try {
            source.updatePriority()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return when {
            priority == null -> UpdateCheckResult.Unavailable
            priority >= 1 -> UpdateCheckResult.UpdateRequired
            else -> UpdateCheckResult.UpToDate
        }
    }
}

/** FORCE_UPDATE_CHECK_ENABLED=false -> UpToDate without calling [delegate] (REQ-BOOT-014). */
class ConfiguredUpdateChecker(private val enabled: Boolean, private val delegate: UpdateChecker) : UpdateChecker {
    override suspend fun check(): UpdateCheckResult = if (enabled) delegate.check() else UpdateCheckResult.UpToDate
}

enum class UpdateFlowResult { Completed, Cancelled, Failed }

/** Starts the store / Play immediate-update flow. */
fun interface UpdateLauncher {
    suspend fun launch(): UpdateFlowResult
}

fun interface PushRegistrar {
    /** Registers the current device for push. Only a registration call exists: logout never unregisters (REQ-AUTH-034). */
    suspend fun registerCurrentDevice()
}


enum class HomeMode { Member, Guest }

sealed interface PreloadResult {
    data object Ready : PreloadResult
    data object Failed : PreloadResult
}

fun interface HomePreloader {
    suspend fun preload(mode: HomeMode): PreloadResult
}

/** Terms-screen entry context. idToken/rawNonce stay in memory only and never appear in toString. */
class PendingSignup(val idToken: String, val rawNonce: String) {
    override fun toString(): String = "PendingSignup(<redacted>)"
}

object CopyKeys {
    const val UPDATE_TITLE = "boot.update.title"
    const val UPDATE_BODY = "boot.update.body"
    const val UPDATE_BUTTON = "boot.update.button"
    const val LOGIN_ERROR_NETWORK = "auth.login.error.network"
    const val LOGIN_ERROR_KAKAO_ACCOUNT = "auth.login.error.kakao-account"
    const val LOGIN_ERROR_CONFIG = "auth.login.error.config"
    const val LOGIN_ERROR_KAKAO_FAILED = "auth.login.error.kakao-failed"
    const val LOGIN_ERROR_INVALID_RESPONSE = "auth.login.error.invalid-response"
    const val LOGIN_ERROR_GENERIC = "auth.login.error.generic"
    const val LOGIN_ERROR_GUEST = "auth.login.error.guest"
    const val LOGOUT_MESSAGE = "auth.logout.confirm.message"
    const val LOGOUT_OK = "auth.logout.confirm.ok"
    const val WITHDRAW_MESSAGE = "auth.withdraw.confirm.message"
    const val WITHDRAW_OK = "auth.withdraw.confirm.ok"
    const val CONFIRM_CANCEL = "auth.confirm.cancel"
    const val WITHDRAW_ERROR = "auth.withdraw.error"
}
