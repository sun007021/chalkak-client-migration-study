package com.stonefive.chalkak

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.di.AppContainer
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.core.network.ApiBaseUrl
import kr.chalkak.core.network.ApiBaseUrlResult
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

class BuildConfigTest {
    /** `-PapiBaseUrl=...` makes app/build.gradle.kts set this system property on the unit test task. */
    private val overridden = System.getProperty("apiBaseUrlOverridden") != null

    @Test
    fun `API_BASE_URL defaults per build type and is always a valid origin`() {
        if (!overridden) {
            val expected = if (BuildConfig.DEBUG) "http://10.0.2.2:4010" else "https://chalkak-dev.pysun.kr"
            assertEquals(expected, BuildConfig.API_BASE_URL)
        }
        assertIs<ApiBaseUrlResult.Valid>(ApiBaseUrl.parse(BuildConfig.API_BASE_URL))
    }

    @Test
    fun `AppContainer rejects an insecure non loopback base url at start`() {
        val storage = object : SecureRecordStorage {
            override suspend fun load() = SessionRecord()
            override suspend fun save(record: SessionRecord) = Unit
            override suspend fun wipe() = Unit
        }
        assertFailsWith<IllegalStateException> { AppContainer(Copy(emptyMap()), "http://example.com", SystemClock, storage) }
        AppContainer(Copy(emptyMap()), BuildConfig.API_BASE_URL, SystemClock, storage)
    }
}
