package kr.chalkak.core.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.serializer
import kr.chalkak.core.network.testing.RawResponses
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

@Serializable
data class TodayPostDto(
    val topicDate: String,
    val isPosted: Boolean,
    val postId: String? = null,
    val moderationStatus: String? = null,
)

enum class NotificationType { POST_APPROVED, UNKNOWN }

object NotificationTypeSerializer : SafeEnumSerializer<NotificationType>(NotificationType.entries.toTypedArray(), NotificationType.UNKNOWN)

@Serializable
data class NotificationDto(
    val id: String,
    @Serializable(with = NotificationTypeSerializer::class) val type: NotificationType,
    val sourceId: String? = null,
)

@Serializable
data class NotificationPageDto(val currentPage: Int, val hasNext: Boolean, val notifications: List<NotificationDto>)

@Serializable
enum class StrictStatus { A, B }

@Serializable
data class StrictDto(val status: StrictStatus)

class ApiResponseDecoderTest {
    private val decoder = ApiResponseDecoder()

    private fun failure(r: ApiResult<*>): ApiError = assertIs<ApiResult.Failure>(r).error
    private fun http(fixture: String): ApiError.Http = decoder.parseError(RawResponses.fromFixture(fixture))
    private fun raw(status: Int, contentType: String?, body: String) = RawResponse(status, contentType, body)

    @Test
    fun `TC-NET-001 error body becomes ApiError Http with status code and display message`() {
        val e = http("common/error__business-400.json")
        assertEquals(400, e.status)
        assertEquals(ErrorCode.BUSINESS_ERROR, e.errorCode)
        assertEquals("조회 조건이 올바르지 않습니다.", e.message)
    }

    @Test
    fun `TC-NET-001 decode of a non-2xx response yields the same Http failure`() {
        val e = failure(decoder.decode(RawResponses.fromFixture("common/error__business-400.json"), TodayPostDto.serializer()))
        assertEquals(ApiError.Http(400, ErrorCode.BUSINESS_ERROR, "조회 조건이 올바르지 않습니다."), e)
    }

    @Test
    fun `TC-NET-002 unknown errorCode is treated as BUSINESS_ERROR and keeps status`() {
        val e = http("common/error__unknown-error-code.json")
        assertEquals(ErrorCode.BUSINESS_ERROR, e.errorCode)
        assertEquals(400, e.status)
        assertEquals(ErrorCode.BUSINESS_ERROR, ErrorCode.from("SOMETHING_NEW"))
        assertEquals(ErrorCode.BUSINESS_ERROR, ErrorCode.from(null))
    }

    @Test
    fun `TC-NET-002 known codes map to themselves`() {
        ErrorCode.entries.forEach { assertEquals(it, ErrorCode.from(it.name)) }
    }

    @Test
    fun `TC-NET-003 RESOURCE_STATE_CHANGED and USER_METRICS_AGGREGATION_IN_PROGRESS behave like BUSINESS_ERROR`() {
        assertEquals(ErrorCode.BUSINESS_ERROR, http("common/error__resource-state-changed.json").errorCode)
        assertEquals(ErrorCode.BUSINESS_ERROR, ErrorCode.from("USER_METRICS_AGGREGATION_IN_PROGRESS"))
    }

    @Test
    fun `TC-NET-004 gateway html keeps the status and is classified by status only`() {
        val e = http("common/error__bad-gateway-html.json")
        assertEquals(502, e.status)
        assertEquals(ErrorCode.INTERNAL_ERROR, e.errorCode)
        assertNull(e.message)
    }

    @Test
    fun `TC-NET-004 empty 500 body keeps the status`() {
        val e = http("common/error__empty-body-500.json")
        assertEquals(500, e.status)
        assertEquals(ErrorCode.INTERNAL_ERROR, e.errorCode)
    }

    @Test
    fun `TC-NET-004 a 4xx without errorCode is BUSINESS_ERROR with the status preserved`() {
        val e = decoder.parseError(raw(404, "text/plain", "nope"))
        assertEquals(404, e.status)
        assertEquals(ErrorCode.BUSINESS_ERROR, e.errorCode)
    }

    @Test
    fun `TC-NET-005 malformed json on 200 is InvalidResponse and does not throw`() {
        assertIs<ApiError.InvalidResponse>(failure(decoder.decode(RawResponses.fromFixture("common/ok__malformed-json.json"), TodayPostDto.serializer())))
    }

    @Test
    fun `TC-NET-006 empty body where a body is required is InvalidResponse`() {
        assertIs<ApiError.InvalidResponse>(failure(decoder.decode(RawResponses.fromFixture("common/ok__empty-body.json"), TodayPostDto.serializer())))
    }

    @Test
    fun `TC-NET-007 204 with no body is success and the body is never decoded`() {
        assertEquals(ApiResult.Success(Unit), decoder.decodeNoContent(RawResponses.fromFixture("auth/logout__no-content.json")))
        assertEquals(ApiResult.Success(Unit), decoder.decodeNoContent(raw(200, "text/html", "<html>ignored</html>")))
    }

    @Test
    fun `TC-NET-007 no-content endpoint with a failing status is still an error`() {
        val e = failure(decoder.decodeNoContent(RawResponses.fromFixture("auth/logout__internal-error.json")))
        assertEquals(500, assertIs<ApiError.Http>(e).status)
    }

    @Test
    fun `TC-NET-008 unknown json fields are ignored`() {
        val ok = assertIs<ApiResult.Success<TodayPostDto>>(decoder.decode(RawResponses.fromFixture("common/ok__extra-fields.json"), TodayPostDto.serializer()))
        assertEquals(TodayPostDto("2026-10-27", true, "22222222-2222-4222-8222-222222222201", "APPROVED"), ok.value)
    }

    @Test
    fun `TC-NET-009 unknown enum with a safe serializer falls back and keeps the list`() {
        val ok = assertIs<ApiResult.Success<NotificationPageDto>>(
            decoder.decode(RawResponses.fromFixture("common/ok__unknown-enum.json"), NotificationPageDto.serializer()),
        )
        assertEquals(listOf(NotificationType.POST_APPROVED, NotificationType.UNKNOWN), ok.value.notifications.map { it.type })
    }

    @Test
    fun `TC-NET-009 unknown enum without a fallback is InvalidResponse not a crash`() {
        val r = decoder.decode(raw(200, "application/json", """{"status":"C"}"""), StrictDto.serializer())
        assertIs<ApiError.InvalidResponse>(failure(r))
    }

    @Test
    fun `TC-NET-010 missing required field is InvalidResponse`() {
        assertIs<ApiError.InvalidResponse>(failure(decoder.decode(RawResponses.fromFixture("common/ok__missing-required.json"), TodayPostDto.serializer())))
    }

    @Test
    fun `TC-NET-010 nullable field accepts both null and omitted`() {
        val withNull = decoder.decode(raw(200, "application/json", """{"topicDate":"2026-10-27","isPosted":false,"postId":null,"moderationStatus":null}"""), TodayPostDto.serializer())
        val omitted = decoder.decode(raw(200, "application/json", """{"topicDate":"2026-10-27","isPosted":false}"""), TodayPostDto.serializer())
        assertEquals(ApiResult.Success(TodayPostDto("2026-10-27", false)), withNull)
        assertEquals(withNull, omitted)
    }

    @Test
    fun `TC-NET-010 a type mismatch is InvalidResponse`() {
        assertIs<ApiError.InvalidResponse>(failure(decoder.decode(raw(200, "application/json", """{"topicDate":1,"isPosted":"yes"}"""), TodayPostDto.serializer())))
    }

    @Test
    fun `TC-NET-011 200 with a non json content type is InvalidResponse`() {
        assertIs<ApiError.InvalidResponse>(failure(decoder.decode(RawResponses.fromFixture("common/ok__wrong-content-type.json"), TodayPostDto.serializer())))
    }

    @Test
    fun `TC-NET-011 json content type with charset parameter is accepted`() {
        val r = decoder.decode(raw(200, "application/json;charset=UTF-8", """{"topicDate":"2026-10-27","isPosted":false}"""), TodayPostDto.serializer())
        assertIs<ApiResult.Success<TodayPostDto>>(r)
    }

    @Test
    fun `TC-NET-033 filter stage 403 keeps FORBIDDEN and the status`() {
        val e = http("common/error__forbidden-no-permission.json")
        assertEquals(403, e.status)
        assertEquals(ErrorCode.FORBIDDEN, e.errorCode)
    }

    @Test
    fun `TC-NET-034 404 api not found is BUSINESS_ERROR with status 404`() {
        val e = http("common/error__not-found-api.json")
        assertEquals(404, e.status)
        assertEquals(ErrorCode.BUSINESS_ERROR, e.errorCode)
    }

    @Test
    fun `TC-NET-035 validation message is preserved for logs only and the code stays BUSINESS_ERROR`() {
        val e = http("common/error__validation-format.json")
        assertEquals(ErrorCode.BUSINESS_ERROR, e.errorCode)
        assertEquals("date: 요청 값의 형식이 올바르지 않습니다.", e.message)
    }

    @Test
    fun `TC-NET-036 500 INTERNAL_ERROR is classified as INTERNAL_ERROR with status 500`() {
        val e = http("common/error__internal-500.json")
        assertEquals(ApiError.Http(500, ErrorCode.INTERNAL_ERROR, "서버에서 요청을 처리하지 못했습니다."), e)
    }

    @Test
    fun `TC-NET-040 Retry-After header is preserved on the error`() {
        assertEquals("2", http("common/error__service-unavailable-503.json").retryAfterRaw)
        assertEquals("2", http("common/error__rate-limited-429.json").retryAfterRaw)
    }

    @Test
    fun `REQ-NET-007 two different messages with the same code give the same code`() {
        val a = decoder.parseError(raw(400, "application/json", """{"errorCode":"BUSINESS_ERROR","message":"A"}"""))
        val b = decoder.parseError(raw(400, "application/json", """{"errorCode":"BUSINESS_ERROR","message":"B"}"""))
        assertEquals(a.errorCode, b.errorCode)
    }

    @Test
    fun `TC-NET-005 decode of primitives and lists works through the same path`() {
        val s: KSerializer<List<String>> = kotlinx.serialization.builtins.ListSerializer(String.serializer())
        assertEquals(ApiResult.Success(listOf("a")), decoder.decode(raw(200, "application/json", """["a"]"""), s))
    }
}
