package kr.chalkak.core.data.home

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.QueryValues
import java.time.LocalDate
import java.time.YearMonth

/**
 * Home data source. Every method maps HTTP/parse problems to [ApiResult.Failure] and never throws (except coroutine cancellation).
 * 404s are NOT turned into empty successes here; the holder decides what a 404 means per call (topic -> not ready, today -> NoOpenTopic).
 */
interface HomeRepository {
    /** `GET /topics?date=yyyy-MM-dd` (KST date, public). */
    suspend fun topic(date: LocalDate): ApiResult<HomeTopic>

    /**
     * `GET /posts?topicDate=<topicDate>&sort=popular&page=1&pageSize=20` (lower-case `popular`, server order kept, public).
     * Returns the whole first page; the caller takes the first 5.
     */
    suspend fun popularPosts(topicDate: LocalDate): ApiResult<List<HomePost>>

    /**
     * `GET /posts/today`. Unknown moderationStatus, or an inconsistent isPosted/postId/status combination
     * (REQ-HOME-017), is Failure(InvalidResponse).
     */
    suspend fun today(): ApiResult<TodayPost>

    /** `GET /posts/calendar?year=&month=` (month is 1..12, no zero padding). */
    suspend fun calendar(month: YearMonth): ApiResult<List<CalendarEntry>>

    /** `GET /notifications/unread-status` -> hasUnread. */
    suspend fun unreadStatus(): ApiResult<Boolean>
}

class DefaultHomeRepository(private val api: ApiClient) : HomeRepository {
    override suspend fun topic(date: LocalDate): ApiResult<HomeTopic> =
        api.send(ApiRequest(HttpMethod.GET, "/topics", query = listOf("date" to QueryValues.date(date))), TopicDto.serializer())
            .mapValid { it.toDomain(requestedDate = date) }

    override suspend fun popularPosts(topicDate: LocalDate): ApiResult<List<HomePost>> {
        val query = listOf(
            "topicDate" to QueryValues.date(topicDate),
            "sort" to QueryValues.sort("POPULAR"),
            "page" to QueryValues.int(1),
            "pageSize" to QueryValues.int(AppConstants.PAGE_SIZE),
        )
        return api.send(ApiRequest(HttpMethod.GET, "/posts", query = query), PostListDto.serializer())
            .mapValid { page -> page.posts.map { it.toDomain() } }
    }

    override suspend fun today(): ApiResult<TodayPost> =
        api.send(ApiRequest(HttpMethod.GET, "/posts/today"), TodayPostDto.serializer()).mapValid { it.toDomain() }

    override suspend fun calendar(month: YearMonth): ApiResult<List<CalendarEntry>> {
        val query = listOf("year" to QueryValues.int(month.year), "month" to QueryValues.int(month.monthValue))
        return api.send(ApiRequest(HttpMethod.GET, "/posts/calendar", query = query), CalendarDto.serializer())
            .mapValid { dto -> dto.posts.map { it.toDomain() } }
    }

    override suspend fun unreadStatus(): ApiResult<Boolean> =
        api.send(ApiRequest(HttpMethod.GET, "/notifications/unread-status"), UnreadStatusDto.serializer()).mapValid { it.hasUnread }
}

interface BannerRepository {
    /**
     * `GET /banners?page=<page>&pageSize=10` (public: never an Authorization header, even for members -> no 401, no refresh).
     * Order kept. `webViewUrl` that is not https (or has no host) makes the WHOLE response Failure(InvalidResponse);
     * a malformed `thumbnailUrl` only nulls that banner's thumbnail. Missing `hasNext` -> false.
     */
    suspend fun banners(page: Int): ApiResult<BannerPage>
}

class DefaultBannerRepository(private val api: ApiClient) : BannerRepository {
    override suspend fun banners(page: Int): ApiResult<BannerPage> {
        val query = listOf("page" to QueryValues.int(page), "pageSize" to QueryValues.int(AppConstants.BANNER_PAGE_SIZE))
        return api.send(ApiRequest(HttpMethod.GET, "/banners", query = query), BannerPageDto.serializer()).mapValid { it.toDomain() }
    }
}
