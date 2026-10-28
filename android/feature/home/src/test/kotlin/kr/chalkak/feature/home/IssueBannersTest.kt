package kr.chalkak.feature.home

import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.BannerPage
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Pure banner paging rules (TC-BANR-005/007/008/009 at unit level). */
class IssueBannersTest {
    private fun banner(id: String) = Banner(id, "t$id", "s", "https://example.com/$id", null, Instant.EPOCH)
    private fun page(hasNext: Boolean, vararg ids: String) = BannerPage(1, 10, hasNext, ids.map(::banner))

    @Test
    fun `TC-BANR-005 an empty first page hides the section and duplicates are dropped`() {
        assertEquals(IssueState.Hidden, issueOf(page(false)))
        val ready = assertIs<IssueState.Ready>(issueOf(page(true, "a", "a", "b")))
        assertEquals(listOf("a", "b"), ready.banners.map { it.id })
        assertEquals(2, ready.nextPage)
    }

    @Test
    fun `TC-BANR-007 prefetch only within two cards of the end with hasNext and nothing loading`() {
        val ready = assertIs<IssueState.Ready>(issueOf(page(true, "a", "b", "c", "d")))
        assertFalse(ready.shouldPrefetch(0))
        assertTrue(ready.shouldPrefetch(2))
        assertFalse(ready.copy(loadingMore = true).shouldPrefetch(3))
        assertFalse(ready.copy(hasNext = false).shouldPrefetch(3))
    }

    @Test
    fun `TC-BANR-008 appending skips known ids and an empty page ends the paging`() {
        val ready = issueOf(page(true, "a", "b"))
        val appended = assertIs<IssueState.Ready>(ready.appended(page(true, "b", "c")))
        assertEquals(listOf("a", "b", "c"), appended.banners.map { it.id })
        assertEquals(3, appended.nextPage)
        val ended = assertIs<IssueState.Ready>(appended.appended(page(true)))
        assertFalse(ended.hasNext)
        assertEquals(3, ended.nextPage)
    }
}
