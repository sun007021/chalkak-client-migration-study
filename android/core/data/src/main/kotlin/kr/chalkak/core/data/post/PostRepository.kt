package kr.chalkak.core.data.post

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.QueryValues
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Who is logged in. `null` = guest (D-05). Read on every use, never cached by callers. */
fun interface CurrentUser {
    fun userId(): String?
}

/**
 * Post / topic API. All results are [ApiResult]; the repository only maps wire data and validates the contract,
 * it never decides UI copy (D-02). Retry/refresh is done by [ApiClient].
 */
interface PostRepository {
    /** `GET /topics?date=yyyy-MM-dd` (public GET, token attached only when logged in). */
    suspend fun topic(date: LocalDate): ApiResult<Topic>

    /**
     * `GET /posts?topicDate&sort&page&pageSize=20[&randomSeed]`. `randomSeed` is sent only for [PostSort.RANDOM].
     * Items with a negative `likeCount` make the response InvalidResponse (REQ-DISP-034).
     */
    suspend fun posts(query: PostsQuery): ApiResult<PostPage>

    /** `GET /posts/{id}` (Authorization required). Negative `likeCount` / missing fields -> InvalidResponse (TC-FEED-009). */
    suspend fun detail(postId: String): ApiResult<PostDetail>

    /** `PUT /posts/{id}` with body `{"title": <string|null>}` - the `title` key is ALWAYS present (TC-FEED-022). */
    suspend fun updateTitle(postId: String, title: String?): ApiResult<TitleUpdateResult>

    /** `DELETE /posts/{id}` (204). */
    suspend fun delete(postId: String): ApiResult<Unit>

    /**
     * `PUT /posts/{id}/likes`, no body. A response whose `postId` differs from the request, or whose `isLiked` is
     * false, is InvalidResponse (TC-LIKE-002).
     */
    suspend fun like(postId: String): ApiResult<LikeResult>

    /** `DELETE /posts/{id}/likes`, no body. A response with a different `postId` is InvalidResponse. */
    suspend fun unlike(postId: String): ApiResult<LikeResult>
}

class DefaultPostRepository(private val api: ApiClient) : PostRepository {
    override suspend fun topic(date: LocalDate): ApiResult<Topic> {
        val request = ApiRequest(HttpMethod.GET, "/topics", query = listOf("date" to QueryValues.date(date)))
        return api.send(request, Topic.serializer()).validated { topic ->
            if (!topic.hasValidDate()) "topicDate is not a date" else null
        }
    }

    override suspend fun posts(query: PostsQuery): ApiResult<PostPage> {
        val params = buildList {
            add("topicDate" to QueryValues.date(query.topicDate))
            add("sort" to QueryValues.sort(query.sort.name))
            add("page" to QueryValues.int(query.page))
            add("pageSize" to QueryValues.int(AppConstants.PAGE_SIZE))
            query.randomSeed?.let { add("randomSeed" to it) }
        }
        return api.send(ApiRequest(HttpMethod.GET, "/posts", query = params), PostPage.serializer()).validated { page ->
            if (page.posts.any { it.likeCount < 0 }) "negative likeCount" else null
        }
    }

    override suspend fun detail(postId: String): ApiResult<PostDetail> =
        api.send(ApiRequest(HttpMethod.GET, "/posts/$postId"), PostDetail.serializer()).validated { detail ->
            when {
                detail.likeCount < 0 -> "negative likeCount"
                !detail.topic.hasValidDate() -> "topic.topicDate is not a date"
                else -> null
            }
        }

    override suspend fun updateTitle(postId: String, title: String?): ApiResult<TitleUpdateResult> {
        // ApiJson has explicitNulls=false, so the always-present `title` key is built by hand (TC-FEED-022).
        val body = JsonObject(mapOf("title" to (title?.let(::JsonPrimitive) ?: JsonNull))).toString()
        return api.send(ApiRequest(HttpMethod.PUT, "/posts/$postId", jsonBody = body), TitleUpdateResult.serializer())
    }

    override suspend fun delete(postId: String): ApiResult<Unit> =
        api.sendNoContent(ApiRequest(HttpMethod.DELETE, "/posts/$postId"))

    override suspend fun like(postId: String): ApiResult<LikeResult> = changeLike(HttpMethod.PUT, postId, rejectUnliked = true)

    override suspend fun unlike(postId: String): ApiResult<LikeResult> = changeLike(HttpMethod.DELETE, postId, rejectUnliked = false)

    /** TC-LIKE-002 names only the PUT contradiction (`isLiked=false`); a DELETE answer is never second-guessed. */
    private suspend fun changeLike(method: HttpMethod, postId: String, rejectUnliked: Boolean): ApiResult<LikeResult> =
        api.send(ApiRequest(method, "/posts/$postId/likes"), LikeResult.serializer()).validated { result ->
            when {
                !result.postId.equals(postId, ignoreCase = true) -> "postId mismatch"
                rejectUnliked && !result.isLiked -> "isLiked contradicts the request"
                result.likeCount < 0 -> "negative likeCount"
                else -> null
            }
        }

    private fun Topic.hasValidDate() = parsesAsDate(topicDate)

    private fun PostTopicRef.hasValidDate() = parsesAsDate(topicDate)

    private fun parsesAsDate(text: String) = try {
        LocalDate.parse(text)
        true
    } catch (e: DateTimeParseException) {
        false
    }

    /** Success whose [problem] is non-null becomes InvalidResponse. */
    private inline fun <T> ApiResult<T>.validated(problem: (T) -> String?): ApiResult<T> {
        if (this !is ApiResult.Success) return this
        val reason = problem(value) ?: return this
        return ApiResult.Failure(ApiError.InvalidResponse(reason))
    }
}
