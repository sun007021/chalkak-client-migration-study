@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.feature.display

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.analytics.screenViewSafely
import kr.chalkak.core.network.JobTracker

/** Holder plumbing shared by display and detail: a bug in a job is reported, never thrown into the scope. */
class HolderSupportTest {
    @Test
    fun `TC-DISP-005 a job that throws is reported once and the next job still runs`() = runTest {
        val scope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())
        val reported = mutableListOf<Exception>()
        val tracker = JobTracker(scope, reported::add)
        val ran = mutableListOf<String>()
        tracker.launch { error("bug") }
        tracker.launch { ran += "second" }
        advanceUntilIdle()
        assertEquals(1, reported.size)
        assertEquals("bug", reported.single().message)
        assertEquals(listOf("second"), ran)
    }

    @Test
    fun `TC-DISP-005 cancelling jobs is not an error and stops them`() = runTest {
        val scope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())
        val reported = mutableListOf<Exception>()
        val tracker = JobTracker(scope, reported::add)
        var finished = false
        tracker.launch { delay(1_000); finished = true }
        runCurrent()
        tracker.cancelAll()
        advanceUntilIdle()
        assertTrue(reported.isEmpty())
        assertEquals(false, finished)
    }

    @Test
    fun `TC-ANL-021 a throwing analytics tracker is swallowed`() {
        val tracker = object : AnalyticsTracker {
            override fun screenView(screen: String) = error("analytics down")
            override fun bottomNavigationSelected(destination: String) = error("analytics down")
        }
        tracker.screenViewSafely("display")
    }
}
