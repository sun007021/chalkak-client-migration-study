package com.stonefive.chalkak.platform

import kr.chalkak.feature.auth.KakaoLoginResult
import kr.chalkak.feature.auth.SocialLoginClient

/**
 * E2E stand-in for Kakao (`-PfakeSocialLogin=true`, debug builds only; docs/testing/strategy.md section 2). Returns a fixed fixture
 * idToken without any SDK or UI, so Maestro flows against the mock server can log in. The mock server accepts any token value; the
 * scenario decides the outcome (login success, SIGN_UP_REQUIRED, ...).
 */
class FakeSocialLoginClient(private val idToken: String = FIXTURE_ID_TOKEN) : SocialLoginClient {
    override suspend fun requestIdToken(hashedNonce: String): KakaoLoginResult = KakaoLoginResult.IdToken(idToken)

    companion object {
        const val FIXTURE_ID_TOKEN: String = "fixture-kakao-id-token"
    }
}
