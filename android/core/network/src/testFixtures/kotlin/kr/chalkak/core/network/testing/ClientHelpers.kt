package kr.chalkak.core.network.testing

import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import okhttp3.mockwebserver.MockResponse
import kotlin.test.assertIs

fun ApiResult<*>.httpError(): ApiError.Http = assertIs<ApiError.Http>(error())
fun ApiResult<*>.error(): ApiError = assertIs<ApiResult.Failure>(this).error

const val BEARER_1 = "Bearer fixture-access-token-1"
const val BEARER_2 = "Bearer fixture-access-token-2"

fun unauthorized(): MockResponse = MockResponses.fromFixture("common/error__unauthorized-token-invalid.json")
fun refreshSuccess(): MockResponse = MockResponses.fromFixture("auth/refresh__success.json")
fun okJson(body: String = """{"ok":true}"""): MockResponse = MockResponses.json(200, body)

/** Path answers 401 until the request carries the refreshed access token, then 200. */
fun NetHarness.guardPath(path: String, body: String = """{"ok":true}""") {
    dispatcher.handle(api(path)) { req ->
        if (req.getHeader("Authorization") == BEARER_2) okJson(body) else unauthorized()
    }
}
