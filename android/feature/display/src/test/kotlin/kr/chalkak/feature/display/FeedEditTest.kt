package kr.chalkak.feature.display

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.TitleUpdateResult
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Title edit dialog and save (TC-FEED-018..033). The post is my own post of today (fixture 201). */
class FeedEditTest {
    private val saved = "가나다라마바사아자차"
    private val family = "👨‍👩‍👧" // 5 code points, 1 grapheme

    private fun TestScope.openDialog(now: String? = null): FeedRig {
        val r = feedRig(FeedEntry.FromRecord(POST_MINE, null), now = now)
        r.repo.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        r.repo.updates.always(POST_MINE, PostFixtures.titleResult("feed/posts-title-update__200.json"))
        r.show()
        r.holder.onEditClicked(); r.idle()
        return r
    }

    private fun FeedRig.type(text: String) { holder.onTitleInput(text); idle() }
    private val FeedRig.input get() = s.edit?.input

    @Test
    fun `TC-FEED-018 the dialog opens with the current title, cancel sends nothing`() = runTest {
        val r = openDialog()
        val edit = assertNotNull(r.s.edit)
        assertEquals("비 오는 날", edit.input)
        assertFalse(edit.saving)
        assertNull(edit.errorCopyKey)
        assertEquals("제목을 입력해 주세요.", Copy["feed.edit.placeholder"])
        assertEquals(listOf("취소", "저장"), listOf("feed.edit.cancel", "feed.edit.save").map { Copy[it] })
        r.holder.onEditCancelled(); r.idle()
        assertNull(r.s.edit)
        assertTrue(r.repo.sentTitles.isEmpty())
    }

    @Test
    fun `TC-FEED-019 ten emojis fit, an eleventh is not entered`() = runTest {
        val r = openDialog()
        val ten = "😀".repeat(10)
        r.type(ten)
        assertEquals(ten, r.input)
        r.type(ten + "😀")
        assertEquals(ten, r.input)
    }

    @Test
    fun `TC-FEED-020 combined emoji count by code point so two families plus one letter are cut, and a paste keeps 10`() = runTest {
        val r = openDialog()
        r.type(family + family)
        assertEquals(family + family, r.input) // 10 code points
        r.type(family + family + "가")
        assertEquals(family + family, r.input)
        r.type("가나다라마바사아자차카")
        assertEquals("가나다라마바사아자차", r.input)
    }

    @Test
    fun `TC-FEED-021 surrounding spaces do not count and the trimmed title is what is sent and shown`() = runTest {
        val r = openDialog()
        r.type(" $saved ")
        assertEquals(10, " $saved ".trim().length)
        r.holder.onSaveClicked(); r.idle()
        assertEquals(listOf(POST_MINE to saved), r.repo.sentTitles.toList())
        assertEquals(saved, r.s.content?.title)
        assertNull(r.s.edit)
    }

    @Test
    fun `TC-FEED-022 an empty or blank input sends null and the title then shows as untitled`() = runTest {
        for (blank in listOf("", "   ")) {
            val r = openDialog()
            r.repo.updates.always(POST_MINE, PostFixtures.titleResult("feed/posts-title-update__200-null-title.json"))
            r.type(blank)
            r.holder.onSaveClicked(); r.idle()
            assertEquals(listOf<Pair<String, String?>>(POST_MINE to null), r.repo.sentTitles.toList(), "'$blank'")
            assertNull(r.s.content?.title)
            assertEquals("무제", r.s.content?.displayTitle)
        }
    }

    @Test
    fun `TC-FEED-023 TC-FEED-024 a successful save updates the detail and the shared caches, closes the dialog and toasts once`() = runTest {
        val r = openDialog()
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertEquals(saved, r.s.content?.title)
        assertEquals(saved, r.changes.titles.value[POST_MINE])
        assertNull(r.s.edit)
        val toast = r.toasts().single()
        assertEquals("feed.edit.success", toast.copyKey)
        assertEquals("제목을 수정했어요", Copy[toast.copyKey])
    }

    @Test
    fun `TC-FEED-025 pressing save repeatedly sends one PUT and shows the saving label`() = runTest {
        val r = openDialog()
        val gate = gated(PostFixtures.titleResult("feed/posts-title-update__200.json"))
        r.repo.updates.enqueue(POST_MINE, gate)
        r.type(saved)
        r.holder.onSaveClicked(); r.holder.onSaveClicked(); r.holder.onSaveClicked(); runCurrent()
        assertTrue(r.s.edit?.saving == true)
        assertEquals("저장 중...", Copy["feed.edit.saving"])
        assertEquals(1, r.repo.sentTitles.size)
        gate.release(); advanceUntilIdle()
        assertEquals(1, r.repo.sentTitles.size)
        assertNull(r.s.edit)
    }

    @Test
    fun `TC-FEED-026 a detail reload that was sent before the save cannot bring the old title back`() = runTest {
        val r = openDialog()
        val gate = gated(PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        r.repo.details.enqueue(POST_MINE, gate)
        r.holder.onScreenShown(); runCurrent() // reload in flight
        r.type(saved)
        r.holder.onSaveClicked(); advanceUntilIdle()
        assertEquals(saved, r.s.content?.title)
        gate.release(); advanceUntilIdle()
        assertEquals(saved, r.s.content?.title) // stale answer still says "비 오는 날"
    }

    @Test
    fun `TC-FEED-027 a 400 keeps the dialog and the input, shows the state message, and leaves the title unchanged`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__400-not-editable.json"))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        val edit = assertNotNull(r.s.edit)
        assertEquals(saved, edit.input)
        assertFalse(edit.saving)
        assertEquals("feed.edit.error.state", edit.errorCopyKey)
        assertEquals("수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요", Copy["feed.edit.error.state"])
        assertEquals("비 오는 날", r.s.content?.title)
    }

    @Test
    fun `TC-FEED-028 a server rejection of a too long title keeps the dialog open with the input`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__400-title-too-long.json"))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        val edit = assertNotNull(r.s.edit)
        assertEquals(saved, edit.input)
        assertFalse(edit.saving)
        // the failure is shown either as the server message or as the 400 copy (D-02: never branch on the message)
        assertTrue(edit.serverMessage == "제목은 10자 이하여야 합니다." || edit.errorCopyKey == "feed.edit.error.state")
        assertEquals("비 오는 날", r.s.content?.title)
    }

    @Test
    fun `TC-FEED-029 a banned member's 403 shows the banned text and the request is not repeated`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__403-banned.json"))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertEquals("feed.edit.error.banned", r.s.edit?.errorCopyKey)
        assertEquals("이용이 제한되어 제목을 수정할 수 없어요.", Copy["feed.edit.error.banned"])
        assertEquals(1, r.repo.sentTitles.size)
        assertNotNull(r.s.edit)
    }

    @Test
    fun `TC-FEED-030 a 404 on save closes the dialog, shows not-found and tells the screen to close and refresh the list`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__404-not-found.json"))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertNull(r.s.edit)
        assertEquals(FeedStatus.NotFound, r.s.status)
        assertEquals("feed.error.not-found", r.s.errorCopyKey)
        assertTrue(FeedEffect.Closed(POST_MINE) in r.effects)
    }

    @Test
    fun `TC-FEED-031 a 401 that survived the refresh says login is needed and keeps the dialog`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__401-unauthorized.json"))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertEquals("feed.edit.error.login", r.s.edit?.errorCopyKey)
        assertEquals("로그인이 필요해요", Copy["feed.edit.error.login"])
        assertEquals(1, r.repo.sentTitles.size)
    }

    @Test
    fun `TC-FEED-032 after the retries a lost connection says network and a 5xx the generic save error`() = runTest {
        val net = openDialog()
        net.repo.updates.enqueue(POST_MINE, PostFixtures.network())
        net.type(saved)
        net.holder.onSaveClicked(); net.idle()
        assertEquals("common.error.network", net.s.edit?.errorCopyKey)

        val server = openDialog()
        server.repo.updates.enqueue(POST_MINE, PostFixtures.failure("feed/posts-title-update__500-server-error.json"))
        server.type(saved)
        server.holder.onSaveClicked(); server.idle()
        assertEquals("feed.edit.error.other", server.s.edit?.errorCopyKey)
        assertEquals("게시물 제목을 수정하지 못했어요", Copy["feed.edit.error.other"])
        assertNotNull(server.s.edit)
        assertEquals(saved, server.s.edit?.input)
    }

    @Test
    fun `TC-FEED-033 saving the same title again after a lost response is a normal success`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(
            POST_MINE,
            PostFixtures.network(),
            ApiResult.Success(TitleUpdateResult(POST_MINE, saved)),
        )
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertNotNull(r.s.edit)
        r.holder.onSaveClicked(); r.idle()
        assertNull(r.s.edit)
        assertEquals(saved, r.s.content?.title)
        assertEquals(listOf(POST_MINE to saved, POST_MINE to saved), r.repo.sentTitles.toList())
        assertEquals("feed.edit.success", r.toasts().last().copyKey)
    }

    @Test
    fun `TC-FEED-031 re-authentication required during save is not shown as a save error`() = runTest {
        val r = openDialog()
        r.repo.updates.enqueue(POST_MINE, ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)))
        r.type(saved)
        r.holder.onSaveClicked(); r.idle()
        assertTrue(FeedEffect.LoginRequired in r.effects)
    }
}
