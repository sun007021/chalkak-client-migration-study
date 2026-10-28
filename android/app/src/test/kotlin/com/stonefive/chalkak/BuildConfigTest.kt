package com.stonefive.chalkak

import com.stonefive.chalkak.di.AppContainer
import com.stonefive.chalkak.copy.Copy
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.network.ApiBaseUrl
import kr.chalkak.core.network.ApiBaseUrlResult
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertFailsWith

class BuildConfigTest {
    @Test
    fun `debug API_BASE_URL defaults to the mock server and is a valid origin`() {
        // Overridden by -PapiBaseUrl; the default build is what CI runs.
        if (System.getProperty("apiBaseUrlOverridden") == null) assertEquals("http://10.0.2.2:4010", BuildConfig.API_BASE_URL)
        assertIs<ApiBaseUrlResult.Valid>(ApiBaseUrl.parse(BuildConfig.API_BASE_URL))
    }

    @Test
    fun `AppContainer rejects an insecure non loopback base url at start`() {
        val storage = object : kr.chalkak.core.data.auth.SecureRecordStorage {
            override suspend fun load() = kr.chalkak.core.data.auth.SessionRecord()
            override suspend fun save(record: kr.chalkak.core.data.auth.SessionRecord) = Unit
            override suspend fun wipe() = Unit
        }
        assertFailsWith<IllegalStateException> { AppContainer(Copy(emptyMap()), "http://example.com", SystemClock, storage) }
        AppContainer(Copy(emptyMap()), BuildConfig.API_BASE_URL, SystemClock, storage)
    }
}
