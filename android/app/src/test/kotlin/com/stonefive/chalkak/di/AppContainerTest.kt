package com.stonefive.chalkak.di

import com.stonefive.chalkak.copy.Copy
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
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
}
