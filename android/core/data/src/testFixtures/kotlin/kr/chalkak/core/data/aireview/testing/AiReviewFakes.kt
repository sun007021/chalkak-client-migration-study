package kr.chalkak.core.data.aireview.testing

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kr.chalkak.core.data.aireview.AiCriterion
import kr.chalkak.core.data.aireview.AiFeedback
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewRepository
import kr.chalkak.core.data.aireview.AiReviewResult
import kr.chalkak.core.data.aireview.AiReviewStatus
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

fun aiHttpFailure(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

fun aiNetworkFailure(kind: NetworkKind = NetworkKind.OFFLINE) = ApiResult.Failure(ApiError.Network(kind))

fun aiInvalidResponse() = ApiResult.Failure(ApiError.InvalidResponse("fixture"))

/** Domain values equal to the the `shared/fixtures/ai-review` bodies (the HTTP tests prove the mapping from the files). */
object AiReviews {
    const val POST_ID = "22222222-2222-4222-8222-222222222201"
    val REQUESTED_AT: Instant = Instant.parse("2026-10-27T02:58:00Z")

    fun none() = AiReview(AiReviewStatus.NONE, null, null, null, canRequestAgain = false)

    fun processing(requestedAt: Instant = Instant.parse("2026-10-27T02:59:50Z")) =
        AiReview(AiReviewStatus.PROCESSING, requestedAt, null, null, canRequestAgain = false)

    fun failed(canRequestAgain: Boolean) =
        AiReview(AiReviewStatus.FAILED, REQUESTED_AT, Instant.parse("2026-10-27T02:58:21Z"), null, canRequestAgain)

    fun completed(
        distinctive: Boolean = true,
        score: Double = 7.5,
        criteria: List<AiCriterion> = listOf(AiCriterion("COMPOSITION", "구도", 7.5)),
        feedback: AiFeedback = FEEDBACK,
    ) = AiReview(
        AiReviewStatus.COMPLETED,
        REQUESTED_AT,
        Instant.parse("2026-10-27T02:58:21Z"),
        AiReviewResult(score, criteria, distinctive, feedback),
        canRequestAgain = false,
    )

    val FEEDBACK = AiFeedback(
        summary = "빛을 따라 시선이 흐르는 안정적인 구도",
        strength = "빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.",
        weakness = "수평선이 살짝 기울어 안정감이 조금 떨어집니다.",
        suggestion = "카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.",
    )
}

/**
 * Scripted [AiReviewRepository]. One script per call kind, consumed in call order; when a script is used up the LAST
 * step repeats (so "keeps PROCESSING" needs one step). An empty `get` script answers NONE, an empty `request` script
 * answers PROCESSING.
 *
 * A step may [Step.gate] (suspend until the test completes it; the step is chosen when the call STARTS, so a later call
 * can finish first) and/or [Step.delayMs] (virtual time, for slow answers). [maxConcurrentGets] proves that polling
 * never runs two GETs at once.
 */
class FakeAiReviewRepository : AiReviewRepository {
    class Step(val result: ApiResult<AiReview>, val gate: CompletableDeferred<Unit>? = null, val delayMs: Long = 0L)

    data class Call(val method: String, val postId: String)

    val calls = CopyOnWriteArrayList<Call>()
    /** Time (ms) of every call in [calls], read from [timeSource]; set it to `{ testScheduler.currentTime }`. */
    val callTimes = CopyOnWriteArrayList<Long>()
    var timeSource: () -> Long = { 0L }
    var maxConcurrentGets = 0
        private set

    private val getScript = ArrayDeque<Step>()
    private val postScript = ArrayDeque<Step>()
    private var lastGet: Step? = null
    private var lastPost: Step? = null
    private var gettingNow = 0

    fun scriptGet(vararg results: ApiResult<AiReview>) = results.forEach { getScript.addLast(Step(it)) }
    fun scriptGet(step: Step) = getScript.addLast(step)
    fun scriptPost(vararg results: ApiResult<AiReview>) = results.forEach { postScript.addLast(Step(it)) }
    fun scriptPost(step: Step) = postScript.addLast(step)

    fun gets(postId: String? = null): List<Call> = calls.filter { it.method == "GET" && (postId == null || it.postId == postId) }
    fun posts(postId: String? = null): List<Call> = calls.filter { it.method == "POST" && (postId == null || it.postId == postId) }
    val getCount: Int get() = gets().size
    val postCount: Int get() = posts().size

    /** Times (ms) of the GETs only. */
    fun getTimes(): List<Long> = calls.indices.filter { calls[it].method == "GET" }.map { callTimes[it] }

    override suspend fun get(postId: String): ApiResult<AiReview> {
        record("GET", postId)
        val step = getScript.removeFirstOrNull()?.also { lastGet = it } ?: lastGet ?: Step(ApiResult.Success(AiReviews.none()))
        gettingNow++
        maxConcurrentGets = maxOf(maxConcurrentGets, gettingNow)
        try {
            return finish(step)
        } finally {
            gettingNow--
        }
    }

    override suspend fun request(postId: String): ApiResult<AiReview> {
        record("POST", postId)
        val step = postScript.removeFirstOrNull()?.also { lastPost = it } ?: lastPost ?: Step(ApiResult.Success(AiReviews.processing()))
        return finish(step)
    }

    private fun record(method: String, postId: String) {
        calls += Call(method, postId)
        callTimes += timeSource()
    }

    private suspend fun finish(step: Step): ApiResult<AiReview> {
        if (step.delayMs > 0) delay(step.delayMs)
        step.gate?.await()
        return step.result
    }
}
