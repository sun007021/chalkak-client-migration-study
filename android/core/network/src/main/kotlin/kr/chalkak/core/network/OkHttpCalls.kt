package kr.chalkak.core.network

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Runs the call without blocking the caller. Cancelling the coroutine cancels the call (D-20: cancellation is
 * rethrown by the coroutine machinery, never turned into an error). The body is read to text on the OkHttp thread.
 */
internal suspend fun Call.awaitRaw(): RawResponse = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            try {
                cont.resume(response.use { it.toRaw() })
            } catch (e: IOException) {
                cont.resumeWithException(e)
            }
        }
    })
}

private fun Response.toRaw(): RawResponse = RawResponse(
    status = code,
    contentType = header("Content-Type"),
    body = body?.string().orEmpty(),
    headers = headers.names().associateWith { name -> header(name).orEmpty() },
)

/** All timeouts, DNS, connection and TLS failures collapse into [ApiError.Network] (D-20). */
internal fun IOException.toNetworkError(): ApiError.Network = ApiError.Network(
    when (this) {
        is InterruptedIOException -> NetworkKind.TIMEOUT // includes SocketTimeoutException
        is UnknownHostException, is ConnectException, is NoRouteToHostException -> NetworkKind.OFFLINE
        else -> NetworkKind.OTHER
    },
)
