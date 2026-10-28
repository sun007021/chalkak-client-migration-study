package kr.chalkak.core.data.home.testing

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.BannerPage
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.HomeTopic
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

/**
 * Turns `shared/fixtures` files into the repository's domain models WITHOUT using production mapping code,
 * so holder tests depend on the fixtures only. Every function takes the fixture path relative to `shared/fixtures/`.
 */
object HomeFixtureModels {
    private fun obj(path: String): JsonObject = Fixtures.json(path).jsonObject
    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

    fun topic(path: String): HomeTopic = obj(path).let {
        HomeTopic(it.str("id")!!, it.str("title")!!, LocalDate.parse(it.str("topicDate")!!), it.str("phase")!!)
    }

    fun today(path: String): TodayPost = obj(path).let {
        TodayPost(
            topicDate = LocalDate.parse(it.str("topicDate")!!),
            isPosted = it["isPosted"]!!.jsonPrimitive.booleanOrNull!!,
            postId = it.str("postId"),
            status = it.str("moderationStatus")?.let(ModerationStatus::valueOf),
        )
    }

    fun posts(path: String): List<HomePost> = obj(path).getValue("posts").jsonArray.map { p ->
        val o = p.jsonObject
        HomePost(
            id = o.str("id")!!,
            authorId = o.str("authorId")!!,
            thumbnailImageUrl = o.str("thumbnailImageUrl")!!,
            originalImageUrl = o.str("originalImageUrl")!!,
            title = o.str("title"),
            likeCount = o["likeCount"]!!.jsonPrimitive.intOrNull!!,
            isLiked = o["isLiked"]!!.jsonPrimitive.booleanOrNull!!,
            isMine = o["isMine"]!!.jsonPrimitive.booleanOrNull!!,
        )
    }

    fun calendar(path: String): List<CalendarEntry> = obj(path).getValue("posts").jsonArray.map { p ->
        val o = p.jsonObject
        CalendarEntry(
            LocalDate.parse(o.str("topicDate")!!),
            o.str("postId")!!,
            o.str("thumbnailImageUrl")!!,
            ModerationStatus.valueOf(o.str("status")!!),
        )
    }

    fun hasUnread(path: String): Boolean = obj(path)["hasUnread"]!!.jsonPrimitive.booleanOrNull!!

    fun bannerPage(path: String): BannerPage = obj(path).let { o ->
        BannerPage(
            currentPage = o["currentPage"]!!.jsonPrimitive.intOrNull!!,
            pageSize = o["pageSize"]!!.jsonPrimitive.intOrNull!!,
            hasNext = o["hasNext"]?.jsonPrimitive?.booleanOrNull ?: false,
            banners = o.getValue("banners").jsonArray.map { b ->
                val bo = b.jsonObject
                Banner(
                    id = bo.str("id")!!,
                    title = bo.str("title")!!,
                    subtitle = bo.str("subtitle")!!,
                    webViewUrl = bo.str("webViewUrl")!!,
                    thumbnailUrl = bo.str("thumbnailUrl"),
                    createdAt = Instant.parse(bo.str("createdAt")!!),
                )
            },
        )
    }

    /** `{errorCode,message}` fixture + its manifest status as the failure the repository would return. */
    fun failure(path: String): ApiResult.Failure {
        val status = Fixtures.manifestEntry(path)["status"]!!.jsonPrimitive.intOrNull!!
        val body = obj(path)
        return ApiResult.Failure(ApiError.Http(status, ErrorCode.from(body.str("errorCode")), body.str("message")))
    }

    fun <T> ok(value: T): ApiResult<T> = ApiResult.Success(value)

    /** Calendar fixture per month for the weeks the TCs use; every other month is an empty calendar. */
    fun calendarFor(month: YearMonth): List<CalendarEntry> = when (month) {
        YearMonth.of(2026, 9) -> calendar("home/posts-calendar__2026-09-week.json")
        YearMonth.of(2026, 10) -> calendar("home/posts-calendar__2026-10-week-approved.json")
        YearMonth.of(2026, 12) -> calendar("home/posts-calendar__2026-12-week.json")
        else -> emptyList()
    }
}
