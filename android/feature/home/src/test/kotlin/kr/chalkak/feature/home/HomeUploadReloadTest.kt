package kr.chalkak.feature.home

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.upload.PostCreated
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.feature.auth.HomeMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Home reloads when a post was created (REQ-UPL-063, TC-HOME-047). */
class HomeUploadReloadTest {
    private val created = PostCreated(T27, "post-1", ModerationStatus.VALIDATING)

    @Test
    fun `REQ-UPL-063 TC-HOME-047 a created post reloads hero, week and ranking silently`() = runTest {
        val creations = PostCreations()
        val r = rig(creations = creations.events)
        show(r)
        val before = r.home.todayCalls.size
        creations.announce(created); advanceUntilIdle()
        assertEquals(before + 1, r.home.todayCalls.size)
        assertTrue(r.home.calendarCalls.isNotEmpty())
        assertEquals(false, r.s.refreshing)
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `REQ-UPL-063 a created post before the first load changes nothing`() = runTest {
        val creations = PostCreations()
        val r = rig(creations = creations.events)
        creations.announce(created); advanceUntilIdle()
        assertTrue(r.home.todayCalls.isEmpty())
    }

    @Test
    fun `REQ-UPL-063 a created post reloads home also while it is covered by another screen`() = runTest {
        val creations = PostCreations()
        val r = rig(creations = creations.events)
        show(r)
        r.holder.onScreenGone()
        val before = r.home.todayCalls.size
        creations.announce(created); advanceUntilIdle()
        assertEquals(before + 1, r.home.todayCalls.size)
    }

    @Test
    fun `REQ-UPL-063 guests never reload on a created post`() = runTest {
        val creations = PostCreations()
        val r = rig(HomeMode.Guest, creations = creations.events)
        show(r)
        val topics = r.home.topicCalls.size
        creations.announce(created); advanceUntilIdle()
        assertEquals(topics, r.home.topicCalls.size)
    }
}
