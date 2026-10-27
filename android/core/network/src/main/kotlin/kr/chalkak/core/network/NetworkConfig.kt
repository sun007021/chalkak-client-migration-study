package kr.chalkak.core.network

import kr.chalkak.core.common.AppConstants
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

data class NetworkConfig(
    val connectTimeoutMs: Long = AppConstants.HTTP_CONNECT_TIMEOUT_MS,
    val responseTimeoutMs: Long = AppConstants.HTTP_RESPONSE_TIMEOUT_MS,
    val uploadTimeoutMs: Long = AppConstants.UPLOAD_PUT_TIMEOUT_MS,
)

object OkHttpFactory {
    /** connect = connectTimeoutMs, read/write = responseTimeoutMs, redirects NOT followed (incl. https->http). */
    fun apiClient(config: NetworkConfig = NetworkConfig(), base: OkHttpClient = OkHttpClient()): OkHttpClient =
        build(base, config.connectTimeoutMs, config.responseTimeoutMs, dropInterceptors = false)

    /** Presigned PUT client: read/write = uploadTimeoutMs, redirects not followed. */
    fun uploadClient(config: NetworkConfig = NetworkConfig(), base: OkHttpClient = OkHttpClient()): OkHttpClient =
        build(base, config.connectTimeoutMs, config.uploadTimeoutMs, dropInterceptors = true)

    /**
     * `retryOnConnectionFailure` is off: OkHttp would silently resend a request after some connection
     * failures, which would break "non-idempotent POST is sent exactly once" (D-21). Retries are [RetryPolicy]'s job.
     */
    private fun build(base: OkHttpClient, connectMs: Long, ioMs: Long, dropInterceptors: Boolean): OkHttpClient =
        base.newBuilder()
            .apply {
                if (dropInterceptors) {
                    interceptors().clear()
                    networkInterceptors().clear()
                }
            }
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(ioMs, TimeUnit.MILLISECONDS)
            .writeTimeout(ioMs, TimeUnit.MILLISECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
}
