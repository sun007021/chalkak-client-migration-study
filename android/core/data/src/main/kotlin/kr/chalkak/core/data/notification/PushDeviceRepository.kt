package kr.chalkak.core.data.notification

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod
import java.util.Base64

/**
 * Push device registration. Only a registration call exists: logout/withdraw never unregister (D-16, REQ-PUSH-015).
 */
interface PushDeviceRepository {
    /**
     * `PUT /push-devices/current` with exactly `{"fcmToken": "<token>"}` (Bearer; no device id, no platform), 204 = Success(Unit).
     * Idempotent: D-21 retries (0.5 s, 1 s, max 2) happen in the API client. Failures are returned untouched (`Http`/`Network`).
     */
    suspend fun register(fcmToken: String): ApiResult<Unit>
}

class DefaultPushDeviceRepository(private val api: ApiClient) : PushDeviceRepository {
    override suspend fun register(fcmToken: String): ApiResult<Unit> {
        val body = ApiJson.instance.encodeToString(PushDeviceRequest.serializer(), PushDeviceRequest(fcmToken))
        return api.sendNoContent(ApiRequest(HttpMethod.PUT, "/push-devices/current", jsonBody = body))
    }
}

@Serializable
internal data class PushDeviceRequest(val fcmToken: String)

/** Reads the access-token JWT payload WITHOUT verifying the signature (TC-PUSH-026). */
object AccessTokenClaims {
    /**
     * True when the payload carries a non-empty `session_id` claim. Wrong segment count, bad base64 (URL-safe, padded or not),
     * payload that is not a JSON object -> false, never an exception.
     */
    fun hasSessionId(accessToken: String): Boolean {
        val segments = accessToken.split('.')
        if (segments.size != 3) return false
        val payload = decodePayload(segments[1]) ?: return false
        val claim = payload["session_id"] as? JsonPrimitive ?: return false
        return claim.isString && claim.content.isNotEmpty()
    }

    private fun decodePayload(segment: String): JsonObject? = try {
        val bytes = Base64.getUrlDecoder().decode(segment)
        Json.parseToJsonElement(bytes.toString(Charsets.UTF_8)) as? JsonObject
    } catch (_: IllegalArgumentException) {
        null
    } catch (_: kotlinx.serialization.SerializationException) {
        null
    }
}
