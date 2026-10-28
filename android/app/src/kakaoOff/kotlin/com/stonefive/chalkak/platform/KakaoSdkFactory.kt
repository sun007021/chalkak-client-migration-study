package com.stonefive.chalkak.platform

import android.content.Context
import kr.chalkak.feature.auth.KakaoSdk

/** Build without the Kakao SDK (default). See `app/build.gradle.kts`: `-PkakaoNativeAppKey=...` selects `src/kakaoOn` instead. */
object KakaoSdkFactory {
    @Suppress("UNUSED_PARAMETER")
    fun create(context: Context, nativeAppKey: String, activity: CurrentActivity): KakaoSdk = UnconfiguredKakaoSdk
}
