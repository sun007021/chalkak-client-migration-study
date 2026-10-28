package com.stonefive.chalkak.testing

import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.FakeMonotonicClock
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kr.chalkak.feature.aireview.AiReviewStateHolder

/**
 * Real [AiReviewStateHolder] over a scripted [FakeAiReviewRepository] (`shared/fixtures/ai-review` values) and a [HolderScope] that
 * runs eagerly on the caller thread. The fake clock starts at FIXTURE_NOW (2026-10-27 12:00 KST); polling delays are real time,
 * so app-level tests never wait for a poll (the 3 s / 300 s rules are proven in `feature:aireview`).
 */
class AiHarness(userId: String? = USER_A_ID) {
    private val scopes = HolderScope()
    val repo = FakeAiReviewRepository()
    val clock = FakeClock()
    val user = FakeUser(userId)
    val monotonic = FakeMonotonicClock()

    fun holder(refreshCompletedOnShow: Boolean = true, openSheetOnEntry: Boolean = false) = newHolder(scopes.scope, refreshCompletedOnShow, openSheetOnEntry)

    fun newHolder(
        scope: kotlinx.coroutines.CoroutineScope,
        refreshCompletedOnShow: Boolean = true,
        openSheetOnEntry: Boolean = false,
    ) = AiReviewStateHolder(scope, repo, user, KstCalendar(clock), monotonic, refreshCompletedOnShow, openSheetOnEntry)

    fun close() = scopes.close()
}
