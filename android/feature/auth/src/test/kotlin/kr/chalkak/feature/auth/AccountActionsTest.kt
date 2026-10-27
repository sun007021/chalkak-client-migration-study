package kr.chalkak.feature.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.auth.testing.InMemorySessionStore
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.core.network.StoredSession
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AccountActionsTest {
    private class Rig(val actions: AccountActions, val repo: FakeAuthRepository, val guest: InMemorySessionStore, val effects: List<AccountEffect>) {
        val state get() = actions.state.value
    }

    private fun TestScope.rig(): Rig {
        val repo = FakeAuthRepository()
        val guest = InMemorySessionStore(StoredSession.Guest)
        val actions = AccountActions(holderScope(), repo, guest)
        return Rig(actions, repo, guest, collectAll(actions.effects))
    }

    private fun Rig.confirmWithdraw() { actions.onWithdrawClicked(); actions.onConfirmed() }
    private fun Rig.confirmLogout() { actions.onLogoutClicked(); actions.onConfirmed() }

    // ---- confirmation dialogs --------------------------------------------------------------------

    @Test
    fun `TC-AUTH-032 logout tap opens the confirm dialog with the spec copy and cancel changes nothing`() = runTest {
        val r = rig()
        r.actions.onLogoutClicked(); runCurrent()
        val dialog = r.state.confirm!!
        assertEquals(ConfirmKind.Logout, dialog.kind)
        assertEquals(Copy["auth.logout.confirm.message"], Copy[dialog.messageKey])
        assertEquals(Copy["auth.logout.confirm.ok"], Copy[dialog.okKey])
        assertEquals(Copy["auth.confirm.cancel"], Copy[dialog.cancelKey])
        r.actions.onConfirmCancelled(); advanceUntilIdle()
        assertNull(r.state.confirm)
        assertEquals(0, r.repo.logoutCalls)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-AUTH-037 withdraw tap opens the confirm dialog and cancel changes nothing`() = runTest {
        val r = rig()
        r.actions.onWithdrawClicked(); runCurrent()
        val dialog = r.state.confirm!!
        assertEquals(ConfirmKind.Withdraw, dialog.kind)
        assertEquals(Copy["auth.withdraw.confirm.message"], Copy[dialog.messageKey])
        assertEquals(Copy["auth.withdraw.confirm.ok"], Copy[dialog.okKey])
        r.actions.onConfirmCancelled(); advanceUntilIdle()
        assertEquals(0, r.repo.withdrawCalls)
        assertTrue(r.effects.isEmpty())
        assertNull(r.state.toastKey)
    }

    // ---- logout ----------------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-035 confirmed logout runs the repository once and goes to login`() = runTest {
        val r = rig()
        r.confirmLogout(); advanceUntilIdle()
        assertEquals(1, r.repo.logoutCalls)
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.effects)
        assertNull(r.state.confirm)
        assertFalse(r.state.busy)
    }

    @Test
    fun `TC-AUTH-040 repeated confirmation of logout sends one request and one local cleanup`() = runTest {
        val r = rig()
        r.repo.logoutGate = CompletableDeferred()
        r.actions.onLogoutClicked()
        r.actions.onConfirmed(); r.actions.onConfirmed(); r.actions.onConfirmed(); runCurrent()
        assertTrue(r.state.busy)
        r.repo.logoutGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(1, r.repo.logoutCalls)
        assertEquals(1, r.effects.size)
    }

    @Test
    fun `TC-AUTH-033 guest login button clears the guest flag and opens login`() = runTest {
        val r = rig()
        r.actions.onGuestSignInClicked(); advanceUntilIdle()
        assertEquals(StoredSession.None, r.guest.current)
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.effects)
    }

    // ---- withdraw --------------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-043 withdraw success goes to login`() = runTest {
        val r = rig()
        r.confirmWithdraw(); advanceUntilIdle()
        assertEquals(1, r.repo.withdrawCalls)
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.effects)
        assertNull(r.state.toastKey)
    }

    @Test
    fun `TC-AUTH-044 withdraw failure stays on screen with the toast and re-enables the button`() = runTest {
        for (error in listOf(ApiError.Http(500, ErrorCode.INTERNAL_ERROR), ApiError.Network(NetworkKind.OFFLINE), ApiError.InvalidResponse("x"))) {
            val r = rig()
            r.repo.withdrawResults.add(ApiResult.Failure(error))
            r.confirmWithdraw(); advanceUntilIdle()
            assertTrue(r.effects.isEmpty())
            assertEquals(Copy["auth.withdraw.error"], Copy[r.state.toastKey!!])
            assertFalse(r.state.busy)
        }
    }

    @Test
    fun `TC-AUTH-044 two consecutive failures produce two distinct toasts`() = runTest {
        val r = rig()
        r.repo.withdrawResults.add(ApiResult.Failure(ApiError.Http(500, ErrorCode.INTERNAL_ERROR)))
        r.repo.withdrawResults.add(ApiResult.Failure(ApiError.Http(500, ErrorCode.INTERNAL_ERROR)))
        r.confirmWithdraw(); advanceUntilIdle()
        val first = r.state.toastId
        r.confirmWithdraw(); advanceUntilIdle()
        assertNotEquals(first, r.state.toastId)
        r.actions.onToastShown()
        assertNull(r.state.toastKey)
    }

    @Test
    fun `TC-AUTH-045 UNAUTHORIZED after refresh sends the user to login without a toast`() = runTest {
        val r = rig()
        r.repo.withdrawResults.add(ApiResult.Failure(ApiError.Http(401, ErrorCode.UNAUTHORIZED)))
        r.confirmWithdraw(); advanceUntilIdle()
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.effects)
        assertNull(r.state.toastKey)
    }

    @Test
    fun `TC-AUTH-051 REAUTHENTICATION_REQUIRED goes to login without a toast`() = runTest {
        val r = rig()
        r.repo.withdrawResults.add(ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)))
        r.confirmWithdraw(); advanceUntilIdle()
        assertEquals(listOf<AccountEffect>(AccountEffect.GoToLogin), r.effects)
        assertNull(r.state.toastKey)
    }

    @Test
    fun `TC-AUTH-048 rapid repeated confirmation of withdraw sends one DELETE`() = runTest {
        val r = rig()
        r.repo.withdrawGate = CompletableDeferred()
        r.actions.onWithdrawClicked()
        r.actions.onConfirmed(); r.actions.onConfirmed(); runCurrent()
        assertTrue(r.state.busy)
        r.actions.onWithdrawClicked(); r.actions.onConfirmed(); runCurrent()
        r.repo.withdrawGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(1, r.repo.withdrawCalls)
    }

    @Test
    fun `TC-AUTH-049 leaving the screen mid request shows no error toast for a failure`() = runTest {
        val r = rig()
        r.repo.withdrawGate = CompletableDeferred()
        r.repo.withdrawResults.add(ApiResult.Failure(ApiError.Network(NetworkKind.OTHER)))
        r.confirmWithdraw(); runCurrent()
        r.actions.onScreenGone(); runCurrent()
        r.repo.withdrawGate!!.complete(Unit); advanceUntilIdle()
        assertNull(r.state.toastKey)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-AUTH-049 leaving the screen does not cancel a withdraw that then succeeds`() = runTest {
        val r = rig()
        r.repo.withdrawGate = CompletableDeferred()
        r.confirmWithdraw(); runCurrent()
        r.actions.onScreenGone(); runCurrent()
        r.repo.withdrawGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(1, r.repo.withdrawCalls)
        assertNull(r.state.toastKey)
    }
}
