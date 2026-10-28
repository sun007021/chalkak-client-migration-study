package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** TC-UPL-001..010: the "+" button gate (REQ-UPL-001..011). */
class UploadGateTest {
    private fun GateRig.today(path: String) {
        home.todayHandler = { ApiResult.Success(HomeFixtureModels.today(path)) }
    }

    private fun GateRig.fail(result: ApiResult.Failure) {
        home.todayHandler = { result }
    }

    private fun assertOnlyToast(rig: GateRig, key: String) {
        assertEquals(listOf(key), rig.toasts)
        assertTrue(Copy[key].isNotBlank())
        assertTrue(rig.effects.none { it is UploadGateEffect.Open || it is UploadGateEffect.LoginRequired }, "upload screen must not open: ${rig.effects}")
    }

    @Test
    fun `TC-UPL-001 guest gets the login toast and no request at all`() = runTest {
        val rig = gateRig(userId = null)
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertOnlyToast(rig, UploadCopyKeys.GATE_LOGIN_REQUIRED)
        assertEquals(0, rig.home.totalCalls)
    }

    @Test
    fun `TC-UPL-002 not posted yet calls today once and opens the screen with the response topicDate`() = runTest {
        val rig = gateRig()
        rig.today("home/posts-today__not-posted.json")
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertEquals(1, rig.home.todayCalls.size)
        assertEquals(listOf<UploadGateEffect>(UploadGateEffect.Open(LocalDate.of(2026, 10, 27))), rig.effects)
        assertEquals(false, rig.holder.state.value.checking)
    }

    @Test
    fun `TC-UPL-002 the pinned date is the one in the response, not the device date`() = runTest {
        val rig = gateRig()
        rig.today("upload/posts-today__topic-date-changed.json")
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertEquals(listOf<UploadGateEffect>(UploadGateEffect.Open(LocalDate.of(2026, 10, 28))), rig.effects)
    }

    @Test
    fun `TC-UPL-003 already posted (validating pending approved) shows the already-posted toast and does not open`() = runTest {
        listOf("posted-validating", "posted-pending", "posted-approved").forEach { name ->
            val rig = gateRig()
            rig.today("home/posts-today__$name.json")
            rig.holder.onUploadButtonClicked()
            rig.idle()
            assertOnlyToast(rig, UploadCopyKeys.GATE_ALREADY_POSTED)
        }
    }

    @Test
    fun `TC-UPL-004 404 no open topic`() = runTest {
        val rig = gateRig()
        rig.fail(HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json"))
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertOnlyToast(rig, UploadCopyKeys.GATE_NO_OPEN_TOPIC)
    }

    @Test
    fun `TC-UPL-005 403 banned shows the banned toast and sends the request only once`() = runTest {
        val rig = gateRig()
        rig.fail(HomeFixtureModels.failure("home/posts-today__403-banned.json"))
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertOnlyToast(rig, UploadCopyKeys.GATE_BANNED)
        assertEquals(1, rig.home.todayCalls.size)
    }

    @Test
    fun `TC-UPL-006 a 401 that survived the refresh goes to the login screen`() = runTest {
        listOf(
            HomeFixtureModels.failure("home/posts-today__401-unauthorized.json"),
            ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)),
        ).forEach { failure ->
            val rig = gateRig()
            rig.fail(failure)
            rig.holder.onUploadButtonClicked()
            rig.idle()
            assertEquals(listOf<UploadGateEffect>(UploadGateEffect.LoginRequired), rig.effects)
            assertEquals(1, rig.home.todayCalls.size)
        }
    }

    @Test
    fun `TC-UPL-007 server error, connection failure and contract violation all show the check-failed toast`() = runTest {
        listOf(
            HomeFixtureModels.failure("home/posts-today__500-server-error.json"),
            ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE)),
            ApiResult.Failure(ApiError.Network(NetworkKind.TIMEOUT)),
            ApiResult.Failure(ApiError.InvalidResponse("bad body")),
        ).forEach { failure ->
            val rig = gateRig()
            rig.fail(failure)
            rig.holder.onUploadButtonClicked()
            rig.idle()
            assertOnlyToast(rig, UploadCopyKeys.GATE_CHECK_FAILED)
        }
    }

    @Test
    fun `TC-UPL-008 a contract-violating today answer (fixture) is a check failure not an open`() = runTest {
        // The repository turns upload/posts-today__invalid-not-posted-with-post.json into InvalidResponse (see PostsTodayContractTest).
        val rig = gateRig()
        rig.fail(ApiResult.Failure(ApiError.InvalidResponse("not posted with postId/status")))
        rig.holder.onUploadButtonClicked()
        rig.idle()
        assertOnlyToast(rig, UploadCopyKeys.GATE_CHECK_FAILED)
    }

    @Test
    fun `TC-UPL-009 tapping repeatedly while checking sends one request and opens once`() = runTest {
        val rig = gateRig()
        val gate = CompletableDeferred<Unit>()
        rig.home.todayHandler = {
            gate.await()
            ApiResult.Success(HomeFixtureModels.today("home/posts-today__not-posted.json"))
        }
        repeat(5) { rig.holder.onUploadButtonClicked() }
        rig.t.runCurrent()
        assertEquals(true, rig.holder.state.value.checking)
        repeat(3) { rig.holder.onUploadButtonClicked() }
        rig.t.runCurrent()
        gate.complete(Unit)
        rig.idle()
        assertEquals(1, rig.home.todayCalls.size)
        assertEquals(1, rig.effects.filterIsInstance<UploadGateEffect.Open>().size)
        assertEquals(false, rig.holder.state.value.checking)
    }

    @Test
    fun `TC-UPL-010 leaving while the check is in flight cancels it and nothing is emitted`() = runTest {
        val rig = gateRig()
        val gate = CompletableDeferred<Unit>()
        rig.home.todayHandler = {
            gate.await()
            ApiResult.Success(HomeFixtureModels.today("home/posts-today__not-posted.json"))
        }
        rig.holder.onUploadButtonClicked()
        rig.t.runCurrent()
        assertEquals(1, rig.home.todayCalls.size)
        rig.holder.onScreenGone()
        gate.complete(Unit)
        rig.idle()
        assertTrue(rig.effects.isEmpty(), "no effect after the screen is gone: ${rig.effects}")
        assertEquals(false, rig.holder.state.value.checking)
    }

    @Test
    fun `TC-UPL-010 leaving before the request even started sends nothing`() = runTest {
        val rig = gateRig()
        rig.holder.onUploadButtonClicked()
        rig.holder.onScreenGone()
        rig.t.advanceUntilIdle()
        assertEquals(0, rig.home.todayCalls.size)
        assertTrue(rig.effects.isEmpty())
    }
}
