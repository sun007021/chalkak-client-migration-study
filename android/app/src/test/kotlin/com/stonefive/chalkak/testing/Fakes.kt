package com.stonefive.chalkak.testing

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.test.core.app.ApplicationProvider
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.ProvideCopy
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.NonceGenerator
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.onboarding.SignatureRepository
import kr.chalkak.core.data.onboarding.SignatureImages
import kr.chalkak.core.data.onboarding.SignatureUpload
import kr.chalkak.core.data.onboarding.SignatureUploader
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.auth.HomePreloader
import kr.chalkak.feature.auth.KakaoLoginResult
import kr.chalkak.feature.auth.PreloadResult
import kr.chalkak.feature.auth.PushRegistrar
import kr.chalkak.feature.auth.SocialLoginClient
import kr.chalkak.feature.auth.UpdateCheckResult
import kr.chalkak.feature.auth.UpdateChecker
import kr.chalkak.feature.auth.UpdateFlowResult
import kr.chalkak.feature.auth.UpdateLauncher
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.onboarding.ExternalBrowser
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

/** `shared/copy/ko.json` through the app's own [Copy] (never hardcode Korean in tests). */
fun loadCopy(): Copy = Copy.load(ApplicationProvider.getApplicationContext<Context>())

/** Theme + copy, as the real root provides them. */
@Composable
fun TestApp(copy: Copy, content: @Composable () -> Unit) {
    ChalkakTheme { ProvideCopy(copy, content) }
}

/** A scope for state holders that runs eagerly on the caller thread; cancel it with [close]. */
class HolderScope {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    fun close() = scope.cancel()
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

val FIXED_NOW: Instant = Instant.parse("2026-03-01T00:00:00Z")
val FIXED_CLOCK = Clock { FIXED_NOW }

fun validSession() = Session(
    userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    accessToken = "access",
    accessExpiresAt = FIXED_NOW.plusSeconds(900),
    refreshToken = "refresh",
    refreshExpiresAt = FIXED_NOW.plusSeconds(2_592_000),
)

/** [readGate] set -> `read()` suspends until it completes (the "session is being read" state). */
class FakeSessionStore(var stored: StoredSession = StoredSession.None, var readGate: CompletableDeferred<Unit>? = null) : SessionStore {
    var clears = 0
    override suspend fun read(): StoredSession { readGate?.await(); return stored }
    override suspend fun write(session: Session) { stored = StoredSession.User(session) }
    override suspend fun clear() { clears++; stored = StoredSession.None }
}

class FakeUpdateChecker(var result: UpdateCheckResult = UpdateCheckResult.UpToDate) : UpdateChecker {
    override suspend fun check(): UpdateCheckResult = result
}

class FakeUpdateLauncher : UpdateLauncher {
    var calls = 0
    override suspend fun launch(): UpdateFlowResult { calls++; return UpdateFlowResult.Cancelled }
}

class FakePreloader : HomePreloader {
    val modes = CopyOnWriteArrayList<HomeMode>()
    override suspend fun preload(mode: HomeMode): PreloadResult { modes += mode; return PreloadResult.Ready }
}

class RecordingPush : PushRegistrar {
    var calls = 0
    override suspend fun registerCurrentDevice() { calls++ }
}

/** Kakao SDK stand-in: records the hashed nonces, optionally holds the call on [gate]. */
class ScriptedSocialLogin : SocialLoginClient {
    val hashedNonces = CopyOnWriteArrayList<String>()
    var gate: CompletableDeferred<Unit>? = null
    var result: KakaoLoginResult = KakaoLoginResult.IdToken("id-token")
    override suspend fun requestIdToken(hashedNonce: String): KakaoLoginResult {
        hashedNonces += hashedNonce
        gate?.await()
        return result
    }
}

class CountingNonces : NonceGenerator {
    private var n = 0
    override fun newRawNonce(): String = "raw-nonce-${++n}"
}

class FakeGuestFlags : GuestFlagStore {
    var marked = 0
    override suspend fun markGuest() { marked++ }
    override suspend fun clearGuest() = Unit
}

/** `social-login` stand-in: pops scripted results, falling back to [default]. */
class FakeAuth(var default: ApiResult<SocialLoginOutcome> = ApiResult.Success(SocialLoginOutcome.LoggedIn(validSession()))) : AuthRepository {
    val loginCalls = CopyOnWriteArrayList<Pair<String, String>>()
    val scripted = ArrayDeque<ApiResult<SocialLoginOutcome>>()
    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> {
        loginCalls += idToken to rawNonce
        return scripted.removeFirstOrNull() ?: default
    }
    override suspend fun logout() = Unit
    override suspend fun withdraw(): ApiResult<Unit> = ApiResult.Success(Unit)
}

class FakeBrowser(var canOpen: Boolean = true) : ExternalBrowser {
    val opened = CopyOnWriteArrayList<String>()
    override fun open(url: String): Boolean { opened += url; return canOpen }
}

/** Change-signature backend: every step succeeds unless [confirmResult] says otherwise. */
class FakeSignatures : SignatureRepository {
    var uploads = 0
    var confirms = 0
    var confirmResult: ApiResult<Unit> = ApiResult.Success(Unit)
    override suspend fun current(): ApiResult<SignatureImages> = ApiResult.Success(SignatureImages("https://img/original.png", null))
    override suspend fun requestUpload(): ApiResult<SignatureUpload> {
        uploads++
        return ApiResult.Success(SignatureUpload("upload-$uploads", "https://upload.example/$uploads"))
    }
    override suspend fun confirm(uploadId: String): ApiResult<Unit> { confirms++; return confirmResult }
}

class FakeUploader : SignatureUploader {
    var puts = 0
    override suspend fun put(uploadUrl: String, png: ByteArray): ApiResult<Unit> { puts++; return ApiResult.Success(Unit) }
}
