package kr.chalkak.feature.onboarding

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.onboarding.SignatureImages
import kr.chalkak.core.data.onboarding.testing.FakeSignatureRepository
import kr.chalkak.core.data.onboarding.testing.FakeSignatureUploader
import kr.chalkak.core.data.onboarding.testing.httpFailure
import kr.chalkak.core.data.onboarding.testing.networkFailure
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SignatureChangeStateHolderTest {
    private class Rig(
        val holder: SignatureChangeStateHolder,
        val repo: FakeSignatureRepository,
        val uploader: FakeSignatureUploader,
        val log: EventLog,
        val effects: List<SignatureChangeEffect>,
    ) {
        val state get() = holder.state.value
        val error get() = state.error
    }

    private val png = ByteArray(300) { 2 }

    private fun TestScope.rig(): Rig {
        val log = EventLog()
        val repo = FakeSignatureRepository(log)
        val uploader = FakeSignatureUploader(log)
        val holder = SignatureChangeStateHolder(holderScope(), repo, uploader)
        return Rig(holder, repo, uploader, log, collectAll(holder.effects))
    }

    private fun TestScope.confirm(r: Rig) {
        r.holder.onConfirmClicked(png)
        advanceUntilIdle()
    }

    @Test
    fun `TC-SIGN-019 change runs uploads then PUT then confirm with the issued uploadId`() = runTest {
        val r = rig()
        confirm(r)
        assertEquals(listOf("signature.uploads", "put", "signature.confirm"), r.log.entries.toList())
        assertEquals(listOf("http://localhost:4010/__upload/sig-1" to png.size), r.uploader.calls.toList())
        assertEquals(listOf("sig-upload-1"), r.repo.confirmCalls.toList())
    }

    @Test
    fun `TC-SIGN-025 success returns to settings with the delayed-reflection toast`() = runTest {
        val r = rig()
        confirm(r)
        assertEquals(listOf<SignatureChangeEffect>(SignatureChangeEffect.Done("sign.change.done")), r.effects)
        assertEquals("사인 반영까지 시간이 좀 걸릴 수 있어요!", Copy["sign.change.done"])
        assertFalse(r.state.busy)
        assertNull(r.error)
    }

    @Test
    fun `there is no limit on changes and a pending earlier signature does not block a new one`() = runTest {
        val r = rig()
        repeat(3) { confirm(r) }
        assertEquals(3, r.repo.confirmCalls.size)
        assertEquals(3, r.effects.size)
    }

    @Test
    fun `TC-SIGN-036 three taps on change run each step exactly once and show progress meanwhile`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.repo.uploadGate = gate
        repeat(3) { r.holder.onConfirmClicked(png) }
        runCurrent()
        assertTrue(r.state.busy)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.repo.uploadCalls.size)
        assertEquals(1, r.uploader.calls.size)
        assertEquals(1, r.repo.confirmCalls.size)
        assertFalse(r.state.busy)
    }

    @Test
    fun `TC-SIGN-023 a failed PUT means no confirm and the generic change message`() = runTest {
        val r = rig()
        r.uploader.results.add(httpFailure(403, ErrorCode.BUSINESS_ERROR))
        confirm(r)
        assertTrue(r.repo.confirmCalls.isEmpty())
        assertEquals("sign.change.error.generic", r.error?.copyKey)
        assertEquals("사인을 저장하지 못했어요. 다시 시도해 주세요.", Copy["sign.change.error.generic"])
        assertFalse(r.state.busy)
    }

    @Test
    fun `TC-SIGN-024 every attempt after a failure starts again at uploads and never reuses the old uploadId`() = runTest {
        val r = rig()
        r.uploader.results.add(httpFailure(403, ErrorCode.BUSINESS_ERROR))
        confirm(r)
        confirm(r)
        assertEquals(2, r.repo.uploadCalls.size)
        assertEquals(listOf("sig-upload-2"), r.repo.confirmCalls.toList())
    }

    @Test
    fun `TC-SIGN-028 confirm SIGNATURE_REUPLOAD_REQUIRED shows the reupload message and the next try uses a new upload`() = runTest {
        val r = rig()
        r.repo.confirmResults.add(httpFailure(400, ErrorCode.SIGNATURE_REUPLOAD_REQUIRED, "사인 이미지를 다시 업로드해 주세요."))
        confirm(r)
        assertEquals("onb.signup.error.reupload", r.error?.copyKey)
        confirm(r)
        assertEquals(listOf("sig-upload-1", "sig-upload-2"), r.repo.confirmCalls.toList())
        assertEquals(2, r.repo.uploadCalls.size)
    }

    @Test
    fun `TC-SIGN-029 confirm 400 BUSINESS_ERROR shows sign invalid and returns to drawing`() = runTest {
        val r = rig()
        r.repo.confirmResults.add(httpFailure(400, ErrorCode.BUSINESS_ERROR, "사용할 수 없는 사인 이미지입니다."))
        confirm(r)
        assertEquals("sign.error.invalid", r.error?.copyKey)
        assertEquals(listOf<SignatureChangeEffect>(SignatureChangeEffect.BackToDrawing), r.effects)
    }

    @Test
    fun `TC-SIGN-030 uploads 403 shows the banned message and sends no further request`() = runTest {
        val r = rig()
        r.repo.uploadResults.add(httpFailure(403, ErrorCode.FORBIDDEN, "차단된 회원입니다."))
        confirm(r)
        assertEquals("auth.banned.signature", r.error?.copyKey)
        assertEquals("이용이 제한되어 사인을 변경할 수 없어요.", Copy["auth.banned.signature"])
        assertTrue(r.uploader.calls.isEmpty())
        assertTrue(r.repo.confirmCalls.isEmpty())
        assertEquals(1, r.repo.uploadCalls.size)
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(1, r.repo.uploadCalls.size)
    }

    @Test
    fun `TC-SIGN-031 confirm 403 shows the same banned message and is not resent`() = runTest {
        val r = rig()
        r.repo.confirmResults.add(httpFailure(403, ErrorCode.FORBIDDEN, "차단된 회원입니다."))
        confirm(r)
        assertEquals("auth.banned.signature", r.error?.copyKey)
        assertEquals(1, r.repo.confirmCalls.size)
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(1, r.repo.confirmCalls.size)
    }

    @Test
    fun `TC-SIGN-032 confirm 404 shows the not-found message`() = runTest {
        val r = rig()
        r.repo.confirmResults.add(httpFailure(404, ErrorCode.BUSINESS_ERROR, "업로드한 사인 이미지를 찾을 수 없습니다."))
        confirm(r)
        assertEquals("sign.change.error.not-found", r.error?.copyKey)
        assertEquals("사인 업로드를 찾을 수 없어요. 다시 시도해 주세요.", Copy["sign.change.error.not-found"])
    }

    @Test
    fun `TC-SIGN-033 a 401 that survived the refresh goes to login with the expired message`() = runTest {
        for (step in 0..1) {
            val r = rig()
            val reauth = httpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED)
            if (step == 0) r.repo.uploadResults.add(reauth) else r.repo.confirmResults.add(reauth)
            confirm(r)
            assertEquals(listOf<SignatureChangeEffect>(SignatureChangeEffect.BackToLogin("sign.error.expired")), r.effects, "step $step")
        }
    }

    @Test
    fun `TC-SIGN-034 network failure shows the network message and keeps the change retryable`() = runTest {
        for (step in 0..2) {
            val r = rig()
            val failure = networkFailure(NetworkKind.TIMEOUT)
            when (step) {
                0 -> r.repo.uploadResults.add(failure)
                1 -> r.uploader.results.add(failure)
                else -> r.repo.confirmResults.add(failure)
            }
            confirm(r)
            assertEquals("sign.error.network", r.error?.copyKey, "step $step")
            assertFalse(r.state.busy)
            assertTrue(r.effects.isEmpty())
            confirm(r)
            assertEquals(1, r.effects.size, "step $step")
        }
    }

    @Test
    fun `TC-SIGN-035 a 500 after ApiClient retries shows the generic change message`() = runTest {
        val r = rig()
        r.repo.uploadResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR))
        confirm(r)
        assertEquals("sign.change.error.generic", r.error?.copyKey)
        assertEquals(1, r.repo.uploadCalls.size)
    }

    @Test
    fun `TC-SIGN-037 leaving mid-upload cancels the flow without calling confirm or showing an error`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.uploader.gate = gate
        r.holder.onConfirmClicked(png)
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.repo.confirmCalls.isEmpty())
        assertNull(r.error)
        assertTrue(r.effects.isEmpty())
        assertFalse(r.state.busy)
    }

    @Test
    fun `TC-SIGN-042 backing out of the change screens without confirming makes no server call`() = runTest {
        val r = rig()
        r.holder.onScreenGone()
        advanceUntilIdle()
        assertTrue(r.log.entries.isEmpty())
        assertTrue(r.effects.isEmpty())
    }
}

class SignatureCardStateHolderTest {
    private class Rig(val holder: SignatureCardStateHolder, val repo: FakeSignatureRepository, val effects: List<SignatureCardEffect>) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(isGuest: Boolean = false): Rig {
        val repo = FakeSignatureRepository()
        val holder = SignatureCardStateHolder(holderScope(), repo, isGuest)
        return Rig(holder, repo, collectAll(holder.effects))
    }

    private val thumb = "https://cdn.example.test/thumbnail.png"
    private val original = "https://cdn.example.test/original.png"

    @Test
    fun `TC-SIGN-026 the card shows the GET thumbnail`() = runTest {
        val r = rig()
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(thumb, r.state.imageUrl)
        assertFalse(r.state.loading)
    }

    @Test
    fun `TC-SIGN-026 with a null thumbnail the card shows the original`() = runTest {
        val r = rig()
        r.repo.currentResults.add(ApiResult.Success(SignatureImages(original, null)))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(original, r.state.imageUrl)
    }

    @Test
    fun `TC-SIGN-027 every time the tab shows the signature is fetched again`() = runTest {
        val r = rig()
        r.holder.onTabShown()
        advanceUntilIdle()
        r.repo.currentResults.add(ApiResult.Success(SignatureImages("https://cdn.example.test/o2.png", "https://cdn.example.test/t2.png")))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(2, r.repo.currentCalls)
        assertEquals("https://cdn.example.test/t2.png", r.state.imageUrl)
    }

    @Test
    fun `a tab show while a fetch is in flight does not start another`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.repo.currentGate = gate
        r.holder.onTabShown()
        runCurrent()
        assertTrue(r.state.loading)
        r.holder.onTabShown()
        runCurrent()
        assertEquals(1, r.repo.currentCalls)
        gate.complete(Unit)
        advanceUntilIdle()
        assertFalse(r.state.loading)
    }

    @Test
    fun `a failed fetch keeps the shown signature and toasts the load error`() = runTest {
        val r = rig()
        r.holder.onTabShown()
        advanceUntilIdle()
        r.repo.currentResults.add(networkFailure(NetworkKind.OFFLINE))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(thumb, r.state.imageUrl)
        assertEquals(listOf<SignatureCardEffect>(SignatureCardEffect.Toast("sign.load.error")), r.effects)
        assertEquals("사인을 불러오지 못했어요. 다시 시도해 주세요.", Copy["sign.load.error"])
    }

    @Test
    fun `a failed fetch with nothing shown leaves the image empty`() = runTest {
        val r = rig()
        r.repo.currentResults.add(httpFailure(500, ErrorCode.INTERNAL_ERROR))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertNull(r.state.imageUrl)
        assertEquals(1, r.effects.size)
        assertFalse(r.state.loading)
    }

    @Test
    fun `TC-SIGN-040 REGISTRATION_REQUIRED empties the image offers re-registration and shows no error toast`() = runTest {
        val r = rig()
        r.holder.onTabShown()
        advanceUntilIdle()
        r.repo.currentResults.add(httpFailure(400, ErrorCode.SIGNATURE_REGISTRATION_REQUIRED, "사인 이미지를 다시 등록해 주세요."))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertNull(r.state.imageUrl)
        assertTrue(r.state.needsRegistration)
        assertTrue(r.effects.isEmpty())
        r.holder.onTabShown()
        advanceUntilIdle()
        assertFalse(r.state.needsRegistration)
        assertEquals(thumb, r.state.imageUrl)
    }

    @Test
    fun `guests see no signature card and never call the signature API`() = runTest {
        val r = rig(isGuest = true)
        r.holder.onTabShown()
        advanceUntilIdle()
        assertFalse(r.holder.visible)
        assertEquals(0, r.repo.currentCalls)
    }

    @Test
    fun `a member sees the card`() = runTest {
        val r = rig()
        assertTrue(r.holder.visible)
    }

    @Test
    fun `TC-SIGN-033 a 401 that survived the refresh sends the user to login without a toast`() = runTest {
        val r = rig()
        r.repo.currentResults.add(httpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(listOf<SignatureCardEffect>(SignatureCardEffect.GoLogin), r.effects)
    }

    @Test
    fun `TC-SIGN-038 a response arriving after an account switch is not shown on the new account's card`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.repo.currentGate = gate
        r.holder.onTabShown()
        runCurrent()
        r.holder.onAccountChanged()
        gate.complete(Unit)
        advanceUntilIdle()
        assertNull(r.state.imageUrl)
        assertFalse(r.state.loading)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-SIGN-038 an account switch clears the previous account's signature immediately`() = runTest {
        val r = rig()
        r.holder.onTabShown()
        advanceUntilIdle()
        r.holder.onAccountChanged()
        assertNull(r.state.imageUrl)
    }

    @Test
    fun `TC-SIGN-027 after a change the card re-reads GET and ignores any URL from the PUT response`() = runTest {
        val log = EventLog()
        val repo = FakeSignatureRepository(log)
        val uploader = FakeSignatureUploader(log)
        val scope = holderScope()
        val change = SignatureChangeStateHolder(scope, repo, uploader)
        val card = SignatureCardStateHolder(scope, repo, isGuest = false)
        card.onTabShown()
        advanceUntilIdle()
        change.onConfirmClicked(ByteArray(10))
        advanceUntilIdle()
        repo.currentResults.add(ApiResult.Success(SignatureImages("https://cdn.example.test/o3.png", "https://cdn.example.test/t3.png")))
        card.onTabShown()
        advanceUntilIdle()
        assertEquals("https://cdn.example.test/t3.png", card.state.value.imageUrl)
        assertEquals(listOf("signature.get", "signature.uploads", "put", "signature.confirm", "signature.get"), log.entries.toList())
    }
}
