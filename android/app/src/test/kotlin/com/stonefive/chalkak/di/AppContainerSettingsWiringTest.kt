package com.stonefive.chalkak.di

import com.stonefive.chalkak.BuildConfig
import com.stonefive.chalkak.copy.Copy
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.settings.SettingsSection
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The settings / feedback / change-signature factories of `MainDependencies` as the app container builds them (A9). */
@RunWith(RobolectricTestRunner::class)
class AppContainerSettingsWiringTest {
    private val storage = object : SecureRecordStorage {
        override suspend fun load() = SessionRecord()
        override suspend fun save(record: SessionRecord) = Unit
        override suspend fun wipe() = Unit
    }
    private val container = AppContainer(Copy(emptyMap()), "http://localhost:4010", SystemClock, storage)
    private val main = container.newRootDependencies().main
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

    @After
    fun tearDown() = scope.cancel()

    @Test
    fun `A9 설정 피드백 사인 변경 홀더 팩토리가 모두 연결되어 있다`() {
        assertNotNull(main)
        assertNotNull(main.newSettingsHolders, "settings holders")
        assertNotNull(main.newFeedbackHolder, "feedback holder")
        assertNotNull(main.newChangeSignaturePad, "change-signature pad")
        assertNotNull(main.newSignatureChangeHolder, "change-signature holder")
    }

    @Test
    fun `TC-SET-049 회원 설정 홀더는 빌드 설정의 앱 버전을 버전정보로 쓴다`() {
        val holders = main!!.newSettingsHolders!!(scope, HomeMode.Member)
        assertEquals(BuildConfig.VERSION_NAME, holders.settings.state.value.versionText)
        assertEquals(SettingsSection.entries, holders.settings.state.value.sections)
    }

    @Test
    fun `REQ-SET-002 게스트 설정 홀더는 섹션 없이 로그인 버튼만 있다`() {
        val state = main!!.newSettingsHolders!!(scope, HomeMode.Guest).settings.state.value
        assertTrue(state.isGuest)
        assertTrue(state.sections.isEmpty())
        assertTrue(state.showLoginButton)
    }

    @Test
    fun `설정 홀더 세트를 부를 때마다 새 홀더를 만든다 (계정 전환마다 새 상태)`() {
        val factory = main!!.newSettingsHolders!!
        val a = factory(scope, HomeMode.Member)
        val b = factory(scope, HomeMode.Member)
        assertTrue(a !== b && a.push !== b.push && a.signatureCard !== b.signatureCard && a.account !== b.account)
    }

    @Test
    fun `피드백 홀더는 열 때마다 비어 있다`() {
        val state = main!!.newFeedbackHolder!!(scope).state.value
        assertEquals("", state.input)
        assertEquals(0, state.count)
        assertTrue(!state.sendEnabled)
    }
}
