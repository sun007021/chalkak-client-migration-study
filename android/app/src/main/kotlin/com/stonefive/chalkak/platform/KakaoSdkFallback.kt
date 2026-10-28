package com.stonefive.chalkak.platform

import kr.chalkak.feature.auth.KakaoSdk
import kr.chalkak.feature.auth.KakaoSdkResult

/**
 * [KakaoSdk] for builds without the Kakao SDK (no `-PkakaoNativeAppKey`) and for a missing host Activity:
 * every login reports [KakaoSdkResult.ConfigError], which the login screen shows as `auth.login.error.config`.
 */
object UnconfiguredKakaoSdk : KakaoSdk {
    override suspend fun isTalkLoginAvailable(): Boolean = false
    override suspend fun loginWithTalk(hashedNonce: String): KakaoSdkResult = KakaoSdkResult.ConfigError
    override suspend fun loginWithAccount(hashedNonce: String): KakaoSdkResult = KakaoSdkResult.ConfigError
}
