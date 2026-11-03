package kr.chalkak.feature.display

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.upload.PostCreated
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.post.PostSort
import kotlin.test.Test
import kotlin.test.assertEquals

/** The exhibition asks the uploaded date again when a post was created (REQ-UPL-063). */
class DisplayUploadReloadTest {
    @Test
    fun `REQ-UPL-063 a post created for the shown date revalidates its first page`() = runTest {
        val creations = PostCreations()
        val r = displayRig(creations = creations.events)
        r.show()
        val before = r.repo.posts.calls.size
        creations.announce(PostCreated(TODAY, "post-1", ModerationStatus.VALIDATING)); r.idle()
        assertEquals(before + 1, r.repo.posts.calls.size)
        assertEquals(q(TODAY, PostSort.RECENT, page = 1), r.repo.posts.calls.last())
    }

    @Test
    fun `REQ-UPL-063 a post created for another date changes nothing in the shown list`() = runTest {
        val creations = PostCreations()
        val r = displayRig(creations = creations.events)
        r.show()
        val before = r.repo.posts.calls.size
        creations.announce(PostCreated(YESTERDAY, "post-1", ModerationStatus.VALIDATING)); r.idle()
        assertEquals(before, r.repo.posts.calls.size)
    }

    @Test
    fun `REQ-UPL-063 a post created before the first list is shown requests nothing`() = runTest {
        val creations = PostCreations()
        val r = displayRig(creations = creations.events)
        creations.announce(PostCreated(TODAY, "post-1", ModerationStatus.VALIDATING)); r.idle()
        assertEquals(0, r.repo.posts.calls.size)
    }
}
