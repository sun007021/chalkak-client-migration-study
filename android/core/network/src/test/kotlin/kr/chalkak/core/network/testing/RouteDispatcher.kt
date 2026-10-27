package kr.chalkak.core.network.testing

import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList

/** MockWebServer dispatcher keyed by encoded path (`/api/v1/...`), recording every request. Unscripted -> 599. */
class RouteDispatcher : Dispatcher() {
    private val queues = ConcurrentHashMap<String, ConcurrentLinkedQueue<MockResponse>>()
    private val handlers = ConcurrentHashMap<String, (RecordedRequest) -> MockResponse>()
    val recorded = CopyOnWriteArrayList<RecordedRequest>()

    fun enqueue(path: String, vararg responses: MockResponse) {
        queues.getOrPut(path) { ConcurrentLinkedQueue() }.addAll(responses)
    }

    fun handle(path: String, handler: (RecordedRequest) -> MockResponse) { handlers[path] = handler }

    fun requests(path: String): List<RecordedRequest> = recorded.filter { it.requestUrl?.encodedPath == path }

    override fun dispatch(request: RecordedRequest): MockResponse {
        recorded += request
        val path = request.requestUrl?.encodedPath.orEmpty()
        handlers[path]?.let { return it(request) }
        return queues[path]?.poll() ?: MockResponse().setResponseCode(599).setBody("unscripted $path")
    }
}

fun api(path: String): String = "/api/v1$path"
