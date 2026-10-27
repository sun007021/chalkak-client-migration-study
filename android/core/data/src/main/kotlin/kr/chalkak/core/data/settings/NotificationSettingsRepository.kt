package kr.chalkak.core.data.settings

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod

/** Push receive settings (NOTIFICATION-006). Bearer on every call; 401 refresh is handled by ApiClient. */
interface NotificationSettingsRepository {
    /**
     * `GET /notification-settings`. A body with a missing or null field is `Failure(InvalidResponse)` (TC-SET-015).
     */
    suspend fun load(): ApiResult<NotificationSettings>

    /**
     * `PATCH /notification-settings` with a body holding exactly ONE key, [setting]'s [PushSetting.field] (REQ-SET-012,
     * so an empty PATCH cannot be built, TC-SET-036). 2xx is success without decoding a body (TC-SET-022). Idempotent:
     * ApiClient retries network errors/5xx twice with 0.5s then 1s backoff (D-21, TC-SET-035).
     */
    suspend fun update(setting: PushSetting, enabled: Boolean): ApiResult<Unit>
}

class DefaultNotificationSettingsRepository(private val api: ApiClient) : NotificationSettingsRepository {
    override suspend fun load(): ApiResult<NotificationSettings> =
        when (val result = api.send(ApiRequest(HttpMethod.GET, PATH), NotificationSettingsResponse.serializer())) {
            is ApiResult.Success -> ApiResult.Success(
                NotificationSettings(
                    topic = result.value.topicPushEnabled,
                    moderation = result.value.moderationPushEnabled,
                    aiReview = result.value.aiReviewPushEnabled,
                ),
            )
            is ApiResult.Failure -> result
        }

    override suspend fun update(setting: PushSetting, enabled: Boolean): ApiResult<Unit> {
        val body = JsonObject(mapOf(setting.field to JsonPrimitive(enabled))).toString()
        return api.sendNoContent(ApiRequest(HttpMethod.PATCH, PATH, jsonBody = body))
    }

    private companion object {
        const val PATH = "/notification-settings"
    }
}
