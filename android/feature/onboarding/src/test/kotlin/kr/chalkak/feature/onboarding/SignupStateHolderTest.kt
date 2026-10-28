package kr.chalkak.feature.onboarding

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kr.chalkak.core.data.onboarding.SignupRepository
import kr.chalkak.core.data.onboarding.SignupUpload
import kr.chalkak.core.network.Session
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.onboarding.testing.FakeSignatureUploader
import kr.chalkak.core.data.onboarding.testing.FakeSignupRepository
import kr.chalkak.core.data.onboarding.testing.httpFailure
import kr.chalkak.core.data.onboarding.testing.networkFailure
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SignupStateHolderTest {
    private class Rig(
        val holder: SignupStateHolder,
        val context: SignupContext,
        val signup: FakeSignupRepository,
        val uploader: FakeSignatureUploader,
        val auth: FakeAuthRepository,
        val push: RecordingDeviceRegistrar,
        val log: EventLog,
        val effects: List<SignupEffect>,
    ) {
        val state get() = holder.state.value
        val error get() = state.error
    }

    private val png = ByteArray(300) { 1 }

    private fun TestScope.rig(withContext: Boolean = true): Rig {
        val log = EventLog()
        val context = SignupContext().apply { if (withContext) begin("id-token-1", "raw-nonce-1") }
        val signup = FakeSignupRepository(log).apply { timeSource = { testScheduler.currentTime } }
        val uploader = FakeSignatureUploader(log)
        val auth = FakeAuthRepository()
        val push = RecordingDeviceRegistrar()
        val holder = SignupStateHolder(holderScope(), context, signup, uploader, auth, push)
        return Rig(holder, context, signup, uploader, auth, push, log, collectAll(holder.effects))
    }

    private fun Rig.pending() = httpFailure(400, ErrorCode.SIGNATURE_PROCESSING_PENDING, "사인 이미지 처리 중입니다.")

    private fun TestScope.start(r: Rig) {
        r.holder.onStartClicked(png)
        advanceUntilIdle()
    }

    // ---- happy path -------------------------------------------------------------------------

    @Test
    fun `TC-ONB-019 requests go uploads then PUT then confirm using the issued URL and signupToken`() = runTest {
        val r = rig()
        start(r)
        assertEquals(listOf("signup.uploads", "put", "signup.confirm"), r.log.entries.toList())
        assertEquals(listOf("id-token-1" to "raw-nonce-1"), r.signup.uploadCalls.toList())
        assertEquals(listOf("http://localhost:4010/__upload/1" to png.size), r.uploader.calls.toList())
        assertEquals(listOf("signup-token-1"), r.signup.confirmCalls.toList())
    }

    @Test
    fun `TC-ONB-046 the idToken and rawNonce pair of the current login attempt is what uploads receives`() = runTest {
        val r = rig()
        r.context.begin("id-token-9", "raw-nonce-9")
        start(r)
        assertEquals(listOf("id-token-9" to "raw-nonce-9"), r.signup.uploadCalls.toList())
    }

    @Test
    fun `TC-ONB-019 an upload issuance failure means no PUT and no confirm`() = runTest {
        val r = rig()
        r.signup.uploadResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR))
        start(r)
        assertTrue(r.uploader.calls.isEmpty())
        assertTrue(r.signup.confirmCalls.isEmpty())
    }

    @Test
    fun `TC-ONB-019 a failed PUT means no confirm`() = runTest {
        val r = rig()
        r.uploader.results.add(httpFailure(403, ErrorCode.BUSINESS_ERROR))
        start(r)
        assertTrue(r.signup.confirmCalls.isEmpty())
    }

    @Test
    fun `TC-ONB-024 success goes home registers the device and discards the context`() = runTest {
        val r = rig()
        start(r)
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
        assertEquals(1, r.push.calls)
        assertFalse(r.context.isPresent)
        assertFalse(r.state.busy)
        assertNull(r.error)
        assertEquals(1, r.signup.persistedSessions)
    }

    @Test
    fun `TC-ONB-025 success makes no additional social login call`() = runTest {
        val r = rig()
        start(r)
        assertTrue(r.auth.loginCalls.isEmpty())
    }

    @Test
    fun `TC-ONB-038 an already registered account answering 200 on confirm is handled like any success`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(ApiResult.Success(kr.chalkak.core.data.onboarding.testing.signupSession()))
        start(r)
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
    }

    @Test
    fun `TC-ONB-043 three taps on start run each step exactly once`() = runTest {
        val r = rig()
        repeat(3) { r.holder.onStartClicked(png) }
        advanceUntilIdle()
        assertEquals(1, r.signup.uploadCalls.size)
        assertEquals(1, r.uploader.calls.size)
        assertEquals(1, r.signup.confirmCalls.size)
        assertEquals(1, r.effects.size)
    }

    @Test
    fun `TC-ONB-043 start shows progress with the button disabled until the request ends`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.signup.uploadGate = gate
        r.holder.onStartClicked(png)
        runCurrent()
        assertTrue(r.state.busy)
        gate.complete(Unit)
        advanceUntilIdle()
        assertFalse(r.state.busy)
    }

    // ---- SIGNATURE_PROCESSING_PENDING polling -----------------------------------------------

    @Test
    fun `TC-ONB-026 PENDING is retried after one second with the same signupToken and no new upload`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(r.pending())
        r.holder.onStartClicked(png)
        runCurrent()
        assertEquals(1, r.signup.confirmCalls.size)
        advanceTimeBy(999)
        runCurrent()
        assertEquals(1, r.signup.confirmCalls.size)
        advanceTimeBy(1)
        runCurrent()
        assertEquals(2, r.signup.confirmCalls.size)
        assertEquals(listOf("signup-token-1", "signup-token-1"), r.signup.confirmCalls.toList())
        assertEquals(1, r.signup.uploadCalls.size)
        assertEquals(1, r.uploader.calls.size)
    }

    @Test
    fun `TC-ONB-027 PENDING twice then success finishes at two seconds with three confirm requests`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(r.pending())
        r.signup.confirmResults.add(r.pending())
        r.holder.onStartClicked(png)
        advanceTimeBy(1_999)
        runCurrent()
        assertTrue(r.effects.isEmpty())
        assertTrue(r.state.busy)
        advanceTimeBy(1)
        runCurrent()
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
        assertEquals(3, r.signup.confirmCalls.size)
        assertEquals(listOf(0L, 1_000L, 2_000L), r.signup.confirmTimes.toList())
    }

    @Test
    fun `TC-ONB-028 progress stays and the button stays disabled while waiting between retries`() = runTest {
        val r = rig()
        repeat(3) { r.signup.confirmResults.add(r.pending()) }
        r.holder.onStartClicked(png)
        advanceTimeBy(500)
        runCurrent()
        assertTrue(r.state.busy)
        advanceTimeBy(1_000)
        runCurrent()
        assertTrue(r.state.busy)
        r.holder.onStartClicked(png)
        runCurrent()
        assertEquals(1, r.signup.uploadCalls.size)
    }

    @Test
    fun `TC-ONB-028 PENDING forever sends one try plus ten retries one second apart then shows the timeout`() = runTest {
        val r = rig()
        repeat(30) { r.signup.confirmResults.add(r.pending()) }
        r.holder.onStartClicked(png)
        runCurrent()
        // 9th retry (t=9s) is the 10th request; the 10th retry at t=10s is the last one.
        advanceTimeBy(9_000)
        runCurrent()
        assertEquals(10, r.signup.confirmCalls.size)
        assertNull(r.error)
        assertTrue(r.state.busy)
        advanceTimeBy(999)
        runCurrent()
        assertEquals(10, r.signup.confirmCalls.size)
        advanceTimeBy(1)
        runCurrent()
        assertEquals(1 + AppConstants.SIGNUP_PENDING_RETRY_MAX, r.signup.confirmCalls.size)
        assertEquals((0..10).map { it * AppConstants.SIGNUP_PENDING_RETRY_INTERVAL_MS }, r.signup.confirmTimes.toList())
        assertEquals("onb.signup.error.timeout", r.error?.copyKey)
        assertEquals("사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요.", Copy["onb.signup.error.timeout"])
        assertFalse(r.state.busy)
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(11, r.signup.confirmCalls.size)
    }

    @Test
    fun `TC-ONB-028 the tenth retry succeeding still completes the signup`() = runTest {
        val r = rig()
        repeat(10) { r.signup.confirmResults.add(r.pending()) }
        r.holder.onStartClicked(png)
        advanceTimeBy(10_000)
        runCurrent()
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
        assertEquals(11, r.signup.confirmCalls.size)
    }

    @Test
    fun `TC-ONB-029 after the timeout a new start begins again at uploads with the same idToken and rawNonce`() = runTest {
        val r = rig()
        repeat(11) { r.signup.confirmResults.add(r.pending()) }
        r.holder.onStartClicked(png)
        advanceTimeBy(10_000)
        runCurrent()
        assertEquals("onb.signup.error.timeout", r.error?.copyKey)
        r.holder.onStartClicked(png)
        advanceUntilIdle()
        assertEquals(listOf("id-token-1" to "raw-nonce-1", "id-token-1" to "raw-nonce-1"), r.signup.uploadCalls.toList())
        assertEquals(2, r.uploader.calls.size)
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
    }

    @Test
    fun `TC-ONB-030 a 401 while polling returns to login with the expired message and drops the context`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(r.pending())
        r.signup.confirmResults.add(httpFailure(401, ErrorCode.UNAUTHORIZED))
        r.holder.onStartClicked(png)
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(listOf<SignupEffect>(SignupEffect.BackToLogin("sign.error.expired")), r.effects)
        assertEquals("로그인 정보가 만료되었어요. 다시 로그인해 주세요.", Copy["sign.error.expired"])
        assertFalse(r.context.isPresent)
        assertEquals(2, r.signup.confirmCalls.size)
    }

    // ---- errors per step --------------------------------------------------------------------

    @Test
    fun `TC-ONB-033 uploads 401 returns to login with the expired message`() = runTest {
        val r = rig()
        r.signup.uploadResults.add(httpFailure(401, ErrorCode.UNAUTHORIZED))
        start(r)
        assertEquals(listOf<SignupEffect>(SignupEffect.BackToLogin("sign.error.expired")), r.effects)
        assertFalse(r.context.isPresent)
        assertTrue(r.uploader.calls.isEmpty())
    }

    @Test
    fun `TC-ONB-033 a missing idToken rawNonce context goes back to login without any request`() = runTest {
        val r = rig(withContext = false)
        start(r)
        assertEquals(listOf<SignupEffect>(SignupEffect.BackToLogin("sign.error.expired")), r.effects)
        assertTrue(r.signup.uploadCalls.isEmpty())
    }

    @Test
    fun `TC-ONB-031 uploads 400 retries social login with the same pair and a LOGIN_SUCCESS goes home`() = runTest {
        val r = rig()
        r.signup.uploadResults.add(httpFailure(400, ErrorCode.BUSINESS_ERROR, "이미 가입된 소셜 계정입니다."))
        start(r)
        assertEquals(listOf("id-token-1" to "raw-nonce-1"), r.auth.loginCalls.toList())
        assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
        assertEquals(1, r.push.calls)
        assertTrue(r.uploader.calls.isEmpty())
        assertFalse(r.context.isPresent)
    }

    @Test
    fun `TC-ONB-031 social login answering SIGN_UP_REQUIRED again shows the generic signup error`() = runTest {
        val r = rig()
        r.signup.uploadResults.add(httpFailure(400, ErrorCode.BUSINESS_ERROR, "이미 가입된 소셜 계정입니다."))
        r.auth.loginResults.add(ApiResult.Success(SocialLoginOutcome.SignUpRequired))
        start(r)
        assertEquals("onb.signup.error.generic", r.error?.copyKey)
        assertTrue(r.effects.isEmpty())
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-ONB-032 and TC-ONB-037 403 FORBIDDEN shows the server message and sends nothing more`() = runTest {
        val upload = rig()
        upload.signup.uploadResults.add(httpFailure(403, ErrorCode.FORBIDDEN, "차단된 소셜 계정입니다."))
        start(upload)
        assertEquals("차단된 소셜 계정입니다.", upload.error?.serverMessage)
        assertNull(upload.error?.copyKey)
        assertTrue(upload.uploader.calls.isEmpty())
        assertEquals(1, upload.signup.uploadCalls.size)

        val confirm = rig()
        confirm.signup.confirmResults.add(httpFailure(403, ErrorCode.FORBIDDEN, "차단된 소셜 계정입니다."))
        start(confirm)
        assertEquals("차단된 소셜 계정입니다.", confirm.error?.serverMessage)
        assertEquals(1, confirm.signup.confirmCalls.size)
        assertFalse(confirm.state.busy)
    }

    @Test
    fun `TC-ONB-034 and TC-ONB-035 and TC-ONB-039 confirm 400 BUSINESS_ERROR is sign invalid whatever the message and returns to drawing`() = runTest {
        // D-02 / REQ-ONB-024 / spec open question 5: the message text must not change the branch.
        for (message in listOf("이미 사용된 회원가입 토큰입니다.", "사용할 수 없는 사인 이미지입니다.", "이미 가입된 소셜 계정입니다.")) {
            val r = rig()
            r.signup.confirmResults.add(httpFailure(400, ErrorCode.BUSINESS_ERROR, message))
            start(r)
            assertEquals("sign.error.invalid", r.error?.copyKey, message)
            assertEquals(listOf<SignupEffect>(SignupEffect.BackToDrawing), r.effects, message)
            assertFalse(r.state.busy)
        }
        assertEquals("사용할 수 없는 사인이에요. 다시 그려주세요.", Copy["sign.error.invalid"])
    }

    @Test
    fun `TC-ONB-034 the next attempt after a confirm failure starts again at uploads`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(httpFailure(400, ErrorCode.BUSINESS_ERROR, "이미 사용된 회원가입 토큰입니다."))
        start(r)
        r.holder.onStartClicked(png)
        advanceUntilIdle()
        assertEquals(2, r.signup.uploadCalls.size)
        assertEquals(listOf("signup-token-1", "signup-token-2"), r.signup.confirmCalls.toList())
    }

    @Test
    fun `TC-ONB-036 confirm 404 shows the reupload message and allows drawing again`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(httpFailure(404, ErrorCode.BUSINESS_ERROR, "업로드한 사인 이미지를 찾을 수 없습니다."))
        start(r)
        assertEquals("onb.signup.error.reupload", r.error?.copyKey)
        assertEquals("사인을 다시 업로드해 주세요.", Copy["onb.signup.error.reupload"])
        assertEquals(listOf<SignupEffect>(SignupEffect.BackToDrawing), r.effects)
    }

    @Test
    fun `TC-ONB-040 PUT rejected or expired shows the generic message with no confirm and restarts at uploads`() = runTest {
        for (status in listOf(403, 400)) {
            val r = rig()
            r.uploader.results.add(httpFailure(status, ErrorCode.BUSINESS_ERROR))
            start(r)
            assertEquals("onb.signup.error.generic", r.error?.copyKey)
            assertEquals("회원가입을 완료하지 못했어요. 다시 시도해 주세요.", Copy["onb.signup.error.generic"])
            assertTrue(r.signup.confirmCalls.isEmpty())
            assertFalse(r.state.busy)
            r.holder.onStartClicked(png)
            advanceUntilIdle()
            assertEquals(2, r.signup.uploadCalls.size)
            assertEquals(1, r.signup.confirmCalls.size)
        }
    }

    @Test
    fun `TC-ONB-041 network failure at any step shows the network message and the button works again`() = runTest {
        val steps = listOf<(Rig) -> Unit>(
            { it.signup.uploadResults.add(networkFailure(NetworkKind.OFFLINE)) },
            { it.uploader.results.add(networkFailure(NetworkKind.TIMEOUT)) },
            { it.signup.confirmResults.add(networkFailure(NetworkKind.OTHER)) },
        )
        for (script in steps) {
            val r = rig()
            script(r)
            start(r)
            assertEquals("sign.error.network", r.error?.copyKey)
            assertEquals("네트워크 연결을 확인해 주세요.", Copy["sign.error.network"])
            assertFalse(r.state.busy)
            assertTrue(r.effects.isEmpty())
            r.holder.onStartClicked(png)
            advanceUntilIdle()
            assertEquals(listOf<SignupEffect>(SignupEffect.GoHome), r.effects)
        }
    }

    @Test
    fun `TC-ONB-042 500 at any step shows the generic message and is not retried automatically`() = runTest {
        val steps = listOf<(Rig) -> Unit>(
            { it.signup.uploadResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR)) },
            { it.uploader.results.add(httpFailure(500, ErrorCode.INTERNAL_ERROR)) },
            { it.signup.confirmResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR)) },
        )
        for ((index, script) in steps.withIndex()) {
            val r = rig()
            script(r)
            start(r)
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals("onb.signup.error.generic", r.error?.copyKey, "step $index")
            assertEquals(1, r.signup.uploadCalls.size, "step $index")
            assertTrue(r.uploader.calls.size <= 1, "step $index")
            assertTrue(r.signup.confirmCalls.size <= 1, "step $index")
        }
    }

    @Test
    fun `TC-ONB-042 an unusable response shows the generic message`() = runTest {
        val r = rig()
        r.signup.confirmResults.add(ApiResult.Failure(ApiError.InvalidResponse("garbage")))
        start(r)
        assertEquals("onb.signup.error.generic", r.error?.copyKey)
    }

    @Test
    fun `TC-ONB-041 the same error shown twice gets a new id so the UI can re-trigger`() = runTest {
        val r = rig()
        r.signup.uploadResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR))
        r.signup.uploadResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR))
        start(r)
        val first = assertNotNull(r.error)
        r.holder.onErrorShown()
        assertNull(r.error)
        start(r)
        val second = assertNotNull(r.error)
        assertEquals(first.copyKey, second.copyKey)
        assertTrue(first.id != second.id)
    }

    // ---- lifecycle --------------------------------------------------------------------------

    @Test
    fun `TC-ONB-044 leaving the screen mid-request drops the late result without saving a session or showing anything`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.signup.confirmGate = gate
        r.holder.onStartClicked(png)
        runCurrent()
        assertTrue(r.state.busy)
        r.holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(0, r.signup.persistedSessions)
        assertTrue(r.effects.isEmpty())
        assertNull(r.error)
        assertFalse(r.state.busy)
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-ONB-044 leaving the screen while waiting for PENDING stops the polling`() = runTest {
        val r = rig()
        repeat(5) { r.signup.confirmResults.add(r.pending()) }
        r.holder.onStartClicked(png)
        runCurrent()
        r.holder.onScreenGone()
        advanceTimeBy(30_000)
        runCurrent()
        assertEquals(1, r.signup.confirmCalls.size)
        assertTrue(r.effects.isEmpty())
    }
    @Test
    fun `TC-ONB-044 a repository that throws while saving the session ends in a retryable generic error instead of crashing`() = runTest {
        val log = EventLog()
        val context = SignupContext().apply { begin("id-token-1", "raw-nonce-1") }
        val throwing = object : SignupRepository {
            override suspend fun requestUpload(idToken: String, rawNonce: String) =
                ApiResult.Success(SignupUpload("u1", "http://localhost:4010/__upload/1", "t1"))
            override suspend fun confirm(signupToken: String): ApiResult<Session> = throw IllegalStateException("keystore secret-detail")
        }
        val holder = SignupStateHolder(holderScope(), context, throwing, FakeSignatureUploader(log), FakeAuthRepository(), RecordingDeviceRegistrar())
        val effects = collectAll(holder.effects)
        holder.onStartClicked(png)
        advanceUntilIdle()
        assertEquals("onb.signup.error.generic", holder.state.value.error?.copyKey)
        assertFalse(holder.state.value.busy)
        assertTrue(effects.isEmpty())
        holder.onStartClicked(png)
        advanceUntilIdle()
        assertFalse(holder.state.value.busy)
    }

    @Test
    fun `TC-ONB-044 a result delivered after the screen is gone is dropped even when the call ignores cancellation`() = runTest {
        val context = SignupContext().apply { begin("id-token-1", "raw-nonce-1") }
        val gate = CompletableDeferred<Unit>()
        val stubborn = object : SignupRepository {
            override suspend fun requestUpload(idToken: String, rawNonce: String): ApiResult<SignupUpload> {
                withContext(NonCancellable) { gate.await() }
                return ApiResult.Failure(ApiError.Http(401, ErrorCode.UNAUTHORIZED))
            }
            override suspend fun confirm(signupToken: String): ApiResult<Session> = error("unused")
        }
        val holder = SignupStateHolder(holderScope(), context, stubborn, FakeSignatureUploader(), FakeAuthRepository(), RecordingDeviceRegistrar())
        val effects = collectAll(holder.effects)
        holder.onStartClicked(png)
        runCurrent()
        holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(effects.isEmpty())
        assertNull(holder.state.value.error)
        assertTrue(context.isPresent)
    }
}
