package com.stonefive.chalkak.platform

import kotlinx.coroutines.runBlocking
import kr.chalkak.feature.auth.KakaoLoginResult
import kr.chalkak.feature.auth.KakaoSocialLoginClient
import org.junit.Test
import kotlin.test.assertEquals

class FakeSocialLoginClientTest {
    @Test
    fun `E2E Fake는 SDK 없이 픽스처 idToken을 돌려준다`() = runBlocking {
        assertEquals(KakaoLoginResult.IdToken(FakeSocialLoginClient.FIXTURE_ID_TOKEN), FakeSocialLoginClient().requestIdToken("hash"))
    }

    @Test
    fun `TC-AUTH-018 카카오 SDK가 없는 빌드는 설정 오류로 끝난다`() = runBlocking {
        assertEquals(KakaoLoginResult.ConfigError, KakaoSocialLoginClient(UnconfiguredKakaoSdk).requestIdToken("hash"))
    }
}
