package kr.chalkak.core.data.record

import kotlinx.serialization.Serializable
import kr.chalkak.core.common.Kst
import kr.chalkak.core.data.home.CalendarDto
import kr.chalkak.core.data.home.CalendarPostDto
import kr.chalkak.core.data.home.Malformed
import kr.chalkak.core.data.home.mapValid
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.QueryValues
import java.time.DateTimeException
import java.time.LocalDate
import java.time.YearMonth

/** The only states a calendar day can show (REQ-REC-014): the server never sends VALIDATING / REJECTED. */
enum class RecordPostStatus { PENDING, APPROVED }

/** One day of the record calendar. [topicDate] is the server's topic date, never an upload / approval time (REQ-REC-012). */
data class RecordPost(
    val topicDate: LocalDate,
    val postId: String,
    val thumbnailImageUrl: String,
    val status: RecordPostStatus,
)

@Serializable
data class CalendarMonthDto(val year: Int, val month: Int)

@Serializable
data class CalendarMonthsDto(val months: List<CalendarMonthDto> = emptyList())

/**
 * Record tab data source. Never throws (except coroutine cancellation); HTTP/parse problems are [ApiResult.Failure].
 * Reading the calendar itself reuses the wire DTOs of `core.data.home` (`CalendarDto`); the validation below is what differs
 * from `HomeRepository.calendar` (which does not check year/month, range, duplicates or thumbnails).
 */
interface RecordRepository {
    /**
     * `GET /posts/calendar/months` -> months that have records, newest first, without duplicates; `[]` stays `[]`
     * (the current month is added by the holder, not here, REQ-REC-002).
     */
    suspend fun months(): ApiResult<List<YearMonth>>

    /**
     * `GET /posts/calendar?year=&month=`. The answer must satisfy REQ-REC-018 or the whole response is
     * `Failure(InvalidResponse)`: (1) response year/month == request, (2) every topicDate inside the month,
     * (3) no duplicate date, (4) non-blank thumbnailImageUrl, (5) status PENDING or APPROVED.
     * Entries are returned in response order; callers must not rely on it (TC-REC-015).
     */
    suspend fun calendar(month: YearMonth): ApiResult<List<RecordPost>>
}

class DefaultRecordRepository(private val api: ApiClient) : RecordRepository {
    override suspend fun months(): ApiResult<List<YearMonth>> =
        api.send(ApiRequest(HttpMethod.GET, "/posts/calendar/months"), CalendarMonthsDto.serializer())
            .mapValid { dto -> dto.months.map { it.toYearMonth() }.distinct().sortedDescending() }

    override suspend fun calendar(month: YearMonth): ApiResult<List<RecordPost>> {
        val query = listOf("year" to QueryValues.int(month.year), "month" to QueryValues.int(month.monthValue))
        return api.send(ApiRequest(HttpMethod.GET, "/posts/calendar", query = query), CalendarDto.serializer())
            .mapValid { dto -> dto.toRecordPosts(month) }
    }
}

private fun CalendarMonthDto.toYearMonth(): YearMonth =
    try {
        YearMonth.of(year, month)
    } catch (_: DateTimeException) {
        throw Malformed("bad month")
    }

/** REQ-REC-018: any violation makes the whole response malformed. */
private fun CalendarDto.toRecordPosts(requested: YearMonth): List<RecordPost> {
    if (year != requested.year || month != requested.monthValue) throw Malformed("calendar month mismatch")
    val posts = posts.map { it.toRecordPost(requested) }
    if (posts.map { it.topicDate }.distinct().size != posts.size) throw Malformed("duplicate topicDate")
    return posts
}

private fun CalendarPostDto.toRecordPost(requested: YearMonth): RecordPost {
    val date = Kst.parseApiDate(topicDate) ?: throw Malformed("bad topicDate")
    if (YearMonth.from(date) != requested) throw Malformed("topicDate outside the month")
    if (thumbnailImageUrl.isBlank()) throw Malformed("blank thumbnailImageUrl")
    val parsed = RecordPostStatus.entries.firstOrNull { it.name == status } ?: throw Malformed("unsupported status")
    return RecordPost(date, postId, thumbnailImageUrl, parsed)
}
