package com.stonefive.chalkak.testing

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.ui.common.RemoteImage
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.PostsQuery
import kr.chalkak.core.data.post.testing.FakeLikeServer
import kr.chalkak.core.data.post.testing.FakePostRepository
import kr.chalkak.core.data.post.testing.FakeUser
import kr.chalkak.core.data.post.testing.USER_A_ID
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder

val TODAY: LocalDate = LocalDate.of(2026, 10, 27)
val YESTERDAY: LocalDate = LocalDate.of(2026, 10, 26)
val FIRST_DATE: LocalDate = LocalDate.of(2026, 9, 17)

fun recentQuery(date: LocalDate = TODAY, page: Int = 1) = PostsQuery(date, PostSort.RECENT, page)
fun popularQuery(date: LocalDate = YESTERDAY, page: Int = 1) = PostsQuery(date, PostSort.POPULAR, page)

/**
 * Real display/feed holders over [FakePostRepository] (answers from `shared/fixtures`), one shared [LikeController] and
 * [PostChanges], and a [HolderScope] that runs eagerly on the caller thread. The fake clock starts at FIXTURE_NOW
 * (2026-10-27 12:00 KST). With [auto] every date/query is answered from fixtures; scripted replies take priority.
 */
class PostHarness(
    userId: String? = USER_A_ID,
    now: String? = null,
    auto: Boolean = true,
    likeCount: Int = 38,
) {
    private val holderScope = HolderScope()
    val clock = FakeClock().also { c -> now?.let { c.set(it) } }
    val repo = FakePostRepository().also { if (auto) it.autoRespond() }
    val server = FakeLikeServer(initialLiked = false, initialCount = likeCount)
    val user = FakeUser(userId)
    val changes = PostChanges()
    val analytics = RecordingAnalytics()
    val likes: LikeController

    init {
        repo.likeHandler = { put, id -> server.handle(put, id) }
        likes = LikeController(holderScope.scope, repo, { user.id != null }, changes)
    }

    fun display(initialDate: LocalDate? = null, initialSort: PostSort? = null) =
        DisplayStateHolder(holderScope.scope, repo, likes, changes, user, KstCalendar(clock), analytics, initialDate, initialSort)

    fun feed(entry: FeedEntry) =
        FeedStateHolder(holderScope.scope, repo, likes, changes, user, KstCalendar(clock), analytics, entry)

    fun close() = holderScope.close()
}

/**
 * `RemoteImage` fake. Draws a box that carries the caller's modifier (so the caller's `testTag` appears), sized by the image
 * ratio registered with [ratio]/[ratiosOf] (default 1:1). Records every url it was asked to draw and the laid-out size per url.
 * [fails] simulates a failed load: such urls draw nothing (the real slot does the same).
 */
class ImageProbe {
    val urls = CopyOnWriteArrayList<String?>()
    val sizes = ConcurrentHashMap<String, IntSize>()
    private val ratios = ConcurrentHashMap<String, Float>()
    @Volatile var fails: (String?) -> Boolean = { false }

    fun ratio(url: String, widthOverHeight: Float) { ratios[url] = widthOverHeight }

    /** Registers the ratio parsed from `original-<w>x<h>.webp` for both the original and the thumbnail url of each post. */
    fun ratiosOf(posts: List<PostSummary>) {
        posts.forEach { post ->
            val match = Regex("original-(\\d+)x(\\d+)").find(post.originalImageUrl) ?: return@forEach
            val ratio = match.groupValues[1].toFloat() / match.groupValues[2].toFloat()
            ratio(post.originalImageUrl, ratio)
            post.thumbnailImageUrl?.let { ratio(it, ratio) }
        }
    }

    fun drewUrl(url: String): Boolean = url in urls

    val slot: RemoteImage = { url, modifier ->
        urls += url
        if (!fails(url)) {
            val ratio = url?.let { ratios[it] }
            Box(
                (if (ratio == null) modifier.defaultMinSize(8.dp, 8.dp) else modifier.aspectRatio(ratio))
                    .onGloballyPositioned { if (url != null) sizes[url] = it.size },
            )
        }
    }
}

