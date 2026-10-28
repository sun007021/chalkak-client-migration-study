package com.stonefive.chalkak.di

import com.stonefive.chalkak.copy.Copy
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.core.data.auth.UserDataResetter
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class AppContainerTest {
    private val storage = object : SecureRecordStorage {
        override suspend fun load() = SessionRecord()
        override suspend fun save(record: SessionRecord) = Unit
        override suspend fun wipe() = Unit
    }
    private val container = AppContainer(Copy(emptyMap()), "http://localhost:4010", SystemClock, storage)

    @Test
    fun `resetters run in registration order and a duplicate registration runs once`() = runBlocking {
        val calls = mutableListOf<String>()
        val a = UserDataResetter { calls += "a" }
        container.registerUserDataResetter(a)
        container.registerUserDataResetter(UserDataResetter { calls += "b" })
        container.registerUserDataResetter(a)
        container.userDataResetter.resetAll()
        assertEquals(listOf("a", "b"), calls)
    }

    @Test
    fun `a failing resetter does not stop the later ones and its failure is rethrown`(): Unit = runBlocking {
        val calls = mutableListOf<String>()
        val boom = IllegalStateException("boom")
        container.registerUserDataResetter(UserDataResetter { calls += "a"; throw boom })
        container.registerUserDataResetter(UserDataResetter { calls += "b" })
        val thrown = assertFailsWith<IllegalStateException> { container.userDataResetter.resetAll() }
        assertSame(boom, thrown)
        assertEquals(listOf("a", "b"), calls)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `every auth event reaches every collector (boot gate and navigation shell)`() = runTest(UnconfinedTestDispatcher()) {
        val receivedByBoot = mutableListOf<AuthEvent>()
        val receivedByShell = mutableListOf<AuthEvent>()
        val a = launch { container.authEventFlow.collect { receivedByBoot += it } }
        val b = launch { container.authEventFlow.collect { receivedByShell += it } }
        container.authEventSink.onEvent(AuthEvent.GoToLogin)
        container.authEventSink.onEvent(AuthEvent.GoToLogin)
        assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin, AuthEvent.GoToLogin), receivedByBoot)
        assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin, AuthEvent.GoToLogin), receivedByShell)
        a.cancel()
        b.cancel()
    }
}
