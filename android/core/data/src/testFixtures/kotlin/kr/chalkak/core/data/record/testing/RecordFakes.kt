package kr.chalkak.core.data.record.testing

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.RecordPostStatus
import kr.chalkak.core.data.record.RecordRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Turns the record files of `shared/fixtures` into domain models WITHOUT production mapping code (holder tests depend on the
 * fixtures only). Paths are relative to `shared/fixtures/`.
 */
object RecordFixtureModels {
    private fun obj(path: String): JsonObject = Fixtures.json(path).jsonObject
    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

    /** Months fixture as written (server order, no current month added). */
    fun months(path: String): List<YearMonth> = obj(path).getValue("months").jsonArray.map {
        val o = it.jsonObject
        YearMonth.of(o["year"]!!.jsonPrimitive.intOrNull!!, o["month"]!!.jsonPrimitive.intOrNull!!)
    }

    /** Calendar fixture posts as written (response order). Only fixtures whose statuses are PENDING / APPROVED. */
    fun calendar(path: String): List<RecordPost> = obj(path).getValue("posts").jsonArray.map {
        val o = it.jsonObject
        RecordPost(
            topicDate = LocalDate.parse(o.str("topicDate")!!),
            postId = o.str("postId")!!,
            thumbnailImageUrl = o.str("thumbnailImageUrl")!!,
            status = RecordPostStatus.valueOf(o.str("status")!!),
        )
    }

    /** `{errorCode,message}` fixture + its manifest status as the failure the repository would return. */
    fun failure(path: String): ApiResult.Failure {
        val status = Fixtures.manifestEntry(path)["status"]!!.jsonPrimitive.intOrNull!!
        val body = obj(path)
        return ApiResult.Failure(ApiError.Http(status, ErrorCode.from(body.str("errorCode")), body.str("message")))
    }

    fun <T> ok(value: T): ApiResult<T> = ApiResult.Success(value)

    /**
     * Default calendar per month: 2026-10 / 2026-09 from their fixtures, every other month an empty calendar.
     * 2026-10: 10/20 APPROVED, 10/27 PENDING, 10/31 APPROVED. 2026-09: 9/17, 9/30 APPROVED.
     */
    fun calendarFor(month: YearMonth): List<RecordPost> = when (month) {
        YearMonth.of(2026, 10) -> calendar("record/posts-calendar__2026-10.json")
        YearMonth.of(2026, 9) -> calendar("record/posts-calendar__2026-09.json")
        else -> emptyList()
    }
}

/**
 * Scriptable [RecordRepository]. Handlers may suspend (gate on a CompletableDeferred / delay) and every call is logged.
 * Defaults: months = recent-first fixture ([2026-10, 2026-09]); calendar = [RecordFixtureModels.calendarFor].
 */
class FakeRecordRepository : RecordRepository {
    val monthsCalls = CopyOnWriteArrayList<Unit>()
    val calendarCalls = CopyOnWriteArrayList<YearMonth>()

    var monthsHandler: suspend () -> ApiResult<List<YearMonth>> = {
        ApiResult.Success(RecordFixtureModels.months("record/posts-calendar-months__recent-first.json"))
    }
    var calendarHandler: suspend (YearMonth) -> ApiResult<List<RecordPost>> = { month ->
        ApiResult.Success(RecordFixtureModels.calendarFor(month))
    }

    override suspend fun months(): ApiResult<List<YearMonth>> { monthsCalls += Unit; return monthsHandler() }
    override suspend fun calendar(month: YearMonth): ApiResult<List<RecordPost>> { calendarCalls += month; return calendarHandler(month) }

    fun calendarCallsFor(month: YearMonth): Int = calendarCalls.count { it == month }
    val totalCalls: Int get() = monthsCalls.size + calendarCalls.size
}
