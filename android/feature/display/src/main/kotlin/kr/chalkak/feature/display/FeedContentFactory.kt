package kr.chalkak.feature.display

import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostDetail
import kr.chalkak.core.data.post.PostSummary

/**
 * Builds what the detail screen renders from the best known source: the loaded detail, else the entry's seed.
 * Like count / title always come from the shared hubs when they know the post, so an older answer never wins
 * over a finished like or title edit (REQ-FEED-008).
 */
internal class FeedContentFactory(
    private val entry: FeedEntry,
    private val likes: LikeController,
    private val changes: PostChanges,
) {
    private val postId: String = entry.postId

    /** Null when nothing is known yet ([detail] null and no seed, or the seed was dropped by an account change). */
    fun create(detail: PostDetail?, seedActive: Boolean): FeedContent? {
        detail?.let { return fromDetail(it) }
        if (!seedActive) return null
        return when (entry) {
            is FeedEntry.FromDisplay -> fromSeed(entry.post)
            is FeedEntry.FromRecord -> entry.thumbnailUrl?.let(::thumbnailOnly)
            is FeedEntry.FromPush -> null
        }
    }

    private fun sharedTitle(own: String?): String? {
        val edited = changes.titles.value
        return if (postId in edited) edited[postId] else own
    }

    private fun sharedLike(isLiked: Boolean, likeCount: Int): LikeSnapshot =
        likes.state(postId)?.snapshot ?: LikeSnapshot(isLiked, likeCount)

    private fun fromDetail(d: PostDetail): FeedContent {
        val like = sharedLike(d.isLiked, d.likeCount)
        return FeedContent(
            postId = d.id,
            originalImageUrl = d.originalImageUrl,
            thumbnailImageUrl = d.thumbnailOrOriginalUrl,
            signatureImageUrl = d.signatureOriginalImageUrl,
            title = sharedTitle(d.title),
            likeCount = like.likeCount,
            isLiked = like.isLiked,
            topicDate = d.topic.date,
        )
    }

    private fun fromSeed(post: PostSummary): FeedContent {
        val like = sharedLike(post.isLiked, post.likeCount)
        return FeedContent(
            postId = post.id,
            originalImageUrl = post.originalImageUrl,
            thumbnailImageUrl = post.thumbnailOrOriginalUrl,
            signatureImageUrl = post.signatureOriginalImageUrl,
            title = sharedTitle(post.title),
            likeCount = like.likeCount,
            isLiked = like.isLiked,
            topicDate = null,
        )
    }

    private fun thumbnailOnly(url: String) = FeedContent(
        postId = postId,
        originalImageUrl = null,
        thumbnailImageUrl = url,
        signatureImageUrl = null,
        title = null,
        likeCount = null,
        isLiked = null,
        topicDate = null,
    )
}
