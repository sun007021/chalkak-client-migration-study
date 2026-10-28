package kr.chalkak.core.data.notification

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.data.home.mapValid
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.QueryValues

/**
 * Notification inbox data source. Never throws (except coroutine cancellation); HTTP/parse problems are [ApiResult.Failure].
 * There is deliberately no "read all" method (REQ-NOTI-013). `GET /notifications/unread-status` stays in
 * [kr.chalkak.core.data.home.HomeRepository.unreadStatus].
 */
interface NotificationRepository {
    /**
     * `GET /notifications?page=<page>&pageSize=20` (Bearer). Response order kept. Unknown `type` -> [NotificationType.UNKNOWN]
     * (row kept); a missing required field (title, body, id, createdAt...) or a broken body -> `Failure(InvalidResponse)`;
     * `createdAt` is a UTC Instant with or without fraction digits; null/absent optional fields stay null.
     */
    suspend fun list(page: Int): ApiResult<NotificationPage>

    /** `GET /notifications/{id}` (Bearer). Never sends a read request. */
    suspend fun detail(id: String): ApiResult<NotificationDetail>

    /** `PATCH /notifications/{id}/read`, no body, 204 = Success(Unit). The id is sent lower-case (TC-PUSH-048). */
    suspend fun markRead(id: String): ApiResult<Unit>
}

class DefaultNotificationRepository(private val api: ApiClient) : NotificationRepository {
    override suspend fun list(page: Int): ApiResult<NotificationPage> {
        val query = listOf("page" to QueryValues.int(page), "pageSize" to QueryValues.int(AppConstants.PAGE_SIZE))
        return api.send(ApiRequest(HttpMethod.GET, "/notifications", query = query), NotificationPageDto.serializer())
            .mapValid { it.toDomain() }
    }

    override suspend fun detail(id: String): ApiResult<NotificationDetail> =
        withUuid(id) { uuid ->
            api.send(ApiRequest(HttpMethod.GET, "/notifications/$uuid"), NotificationDetailDto.serializer()).mapValid { it.toDomain() }
        }

    override suspend fun markRead(id: String): ApiResult<Unit> =
        withUuid(id) { uuid -> api.sendNoContent(ApiRequest(HttpMethod.PATCH, "/notifications/$uuid/read")) }

    /** A non-UUID id is a caller bug: it must never reach the URL path. */
    private suspend fun <T> withUuid(id: String, call: suspend (String) -> ApiResult<T>): ApiResult<T> =
        if (QueryValues.isUuid(id)) call(QueryValues.uuid(id)) else ApiResult.Failure(ApiError.InvalidResponse("notification id is not a UUID"))
}
