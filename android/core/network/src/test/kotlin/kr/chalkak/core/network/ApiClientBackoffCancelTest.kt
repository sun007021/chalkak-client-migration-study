@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.network

import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.okJson
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * TC-NET-049 (catalog: cancel during retry backoff -> stop at once, no further request). Inside `runTest` the scheduler skips the 500ms backoff the moment the
 * test body suspends on real I/O, so the second request can race ahead of the cancel. Here the scheduler is
 * pumped by hand (no auto time skipping), so the cancel provably lands inside the backoff wait.
 */
class ApiClientBackoffCancelTest {
    @Test
    fun `TC-NET-049 cancelling during the backoff wait sends no further request (manual scheduler)`() {
        val scope = TestScope()
        NetHarness(scope.backgroundScope, StoredSession.Guest, clock = FakeClock()).use { h ->
            val path = "/notifications/unread-status"
            h.dispatcher.enqueue(api(path), MockResponses.fromFixture("common/error__internal-500.json"), okJson())
            val job = scope.launch { h.client.execute(ApiRequest(HttpMethod.GET, path)) }
            // Pump the virtual scheduler (time never advances) until the 500 was received; the job then parks in delay(500).
            val deadline = System.nanoTime() + 5_000_000_000L
            while (synchronized(h.logs) { h.logs.none { it.startsWith("<-- 500") } }) {
                check(System.nanoTime() < deadline) { "500 response never arrived" }
                scope.testScheduler.runCurrent()
                Thread.yield()
            }
            assertTrue(job.isActive, "job must be waiting in the backoff")
            job.cancel()
            scope.testScheduler.advanceUntilIdle()
            assertTrue(job.isCancelled, "cancelled, not completed")
            assertEquals(1, h.dispatcher.requests(api(path)).size)
        }
    }
}
