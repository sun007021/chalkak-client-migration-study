package com.stonefive.chalkak.platform

import android.content.Context
import com.kakao.sdk.auth.model.OAuthToken
import com.kakao.sdk.common.model.AuthError
import com.kakao.sdk.common.model.AuthErrorCause
import com.kakao.sdk.common.model.ClientError
import com.kakao.sdk.common.model.ClientErrorCause
import com.kakao.sdk.user.UserApiClient
import kotlinx.coroutines.suspendCancellableCoroutine
import kr.chalkak.feature.auth.KakaoSdk
import kr.chalkak.feature.auth.KakaoSdkResult
import kotlin.coroutines.resume
import com.kakao.sdk.common.KakaoSdk as KakaoSdkRuntime

/** Build with the Kakao SDK (`-PkakaoNativeAppKey=...`). Not compiled in the default build. */
object KakaoSdkFactory {
    fun create(context: Context, nativeAppKey: String, activity: CurrentActivity): KakaoSdk {
        if (nativeAppKey.isBlank()) return UnconfiguredKakaoSdk
        KakaoSdkRuntime.init(context.applicationContext, nativeAppKey)
        return KakaoSdkAdapter(activity)
    }
}

/** Raw Kakao SDK calls behind [KakaoSdk]. The hashed nonce goes to the SDK, which echoes it into the ID token (REQ-AUTH-003). */
internal class KakaoSdkAdapter(private val activity: CurrentActivity) : KakaoSdk {
    override suspend fun isTalkLoginAvailable(): Boolean {
        val host = activity.get() ?: return false
        return UserApiClient.instance.isKakaoTalkLoginAvailable(host)
    }

    override suspend fun loginWithTalk(hashedNonce: String): KakaoSdkResult = login { host, callback ->
        UserApiClient.instance.loginWithKakaoTalk(host, nonce = hashedNonce, callback = callback)
    }

    override suspend fun loginWithAccount(hashedNonce: String): KakaoSdkResult = login { host, callback ->
        UserApiClient.instance.loginWithKakaoAccount(host, nonce = hashedNonce, callback = callback)
    }

    private suspend fun login(start: (Context, (OAuthToken?, Throwable?) -> Unit) -> Unit): KakaoSdkResult {
        val host = activity.get() ?: return KakaoSdkResult.ConfigError
        return suspendCancellableCoroutine { continuation ->
            start(host) { token, error ->
                if (continuation.isActive) continuation.resume(toResult(token, error))
            }
        }
    }

    private fun toResult(token: OAuthToken?, error: Throwable?): KakaoSdkResult = when {
        error is ClientError && error.reason == ClientErrorCause.Cancelled -> KakaoSdkResult.Cancelled
        error is AuthError && error.reason == AuthErrorCause.AccessDenied -> KakaoSdkResult.Cancelled
        error != null -> KakaoSdkResult.Error
        token != null -> KakaoSdkResult.Success(token.idToken)
        else -> KakaoSdkResult.Error
    }
}
