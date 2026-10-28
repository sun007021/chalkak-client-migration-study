@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.settings

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.onboarding.DefaultSignatureRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * The settings signature card reuses the onboarding [DefaultSignatureRepository]; this only pins the SET-side request
 * shape. Expected to PASS already (existing implementation), kept so TC-SET-013 has a named test.
 */
class SettingsSignatureContractTest {
    @Test
    fun `TC-SET-013 signature GET uses path users-me-signature, method GET and the Bearer header`() = runTest {
        val clock = FakeClock()
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue(api("/users/me/signature"), MockResponses.fromFixture("signature/users-me-signature__get-success.json"))
            assertIs<ApiResult.Success<*>>(DefaultSignatureRepository(h.client).current())
            val req = h.dispatcher.requests(api("/users/me/signature")).single()
            assertEquals("GET", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }
}
