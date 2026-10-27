package kr.chalkak.core.network.testing

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy

object MockResponses {
    /** Status/headers come from `shared/fixtures/manifest.json`; [status] overrides it. `_fault` becomes a socket policy. */
    fun fromFixture(path: String, status: Int? = null): MockResponse {
        val f = FixtureResponse.load(path, status)
        val r = MockResponse()
        when (f.fault) {
            "timeout" -> r.setSocketPolicy(SocketPolicy.NO_RESPONSE)
            "disconnect" -> r.setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)
            null -> {
                r.setResponseCode(f.status)
                f.headers.forEach { (k, v) -> r.addHeader(k, v) }
                f.contentType?.let { r.addHeader("Content-Type", it) }
                if (f.body.isNotEmpty()) r.setBody(f.body)
            }
            else -> error("unknown _fault ${f.fault}")
        }
        return r
    }

    fun json(status: Int, body: String): MockResponse =
        MockResponse().setResponseCode(status).addHeader("Content-Type", "application/json; charset=utf-8").setBody(body)

    fun withHeader(response: MockResponse, name: String, value: String): MockResponse = response.apply { addHeader(name, value) }
}
