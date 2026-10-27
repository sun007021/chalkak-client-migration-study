package kr.chalkak.core.data.post

import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PostChangesTest {
    @Test
    fun `TC-FEED-044 a removed post id is remembered so later list data can be filtered`() {
        val changes = PostChanges()
        assertFalse(changes.isRemoved(POST_MINE))
        changes.markRemoved(POST_MINE)
        changes.markRemoved(POST_MINE) // idempotent
        assertTrue(changes.isRemoved(POST_MINE))
        assertFalse(changes.isRemoved(POST_OTHER))
        assertEquals(setOf(POST_MINE), changes.removed.value)
    }

    @Test
    fun `TC-FEED-023 a title change is published for list caches and a cleared title is null`() {
        val changes = PostChanges()
        changes.titleChanged(POST_MINE, "새 제목")
        changes.titleChanged(POST_OTHER, null)
        assertEquals(mapOf<String, String?>(POST_MINE to "새 제목", POST_OTHER to null), changes.titles.value)
        changes.titleChanged(POST_MINE, "또 바꿈")
        assertEquals("또 바꿈", changes.titles.value[POST_MINE])
    }

    @Test
    fun `TC-FEED-057 reset on account change forgets removed ids and titles`() {
        val changes = PostChanges()
        changes.markRemoved(POST_MINE)
        changes.titleChanged(POST_OTHER, "x")
        changes.reset()
        assertTrue(changes.removed.value.isEmpty())
        assertTrue(changes.titles.value.isEmpty())
        assertFalse(changes.isRemoved(POST_MINE))
    }
}
