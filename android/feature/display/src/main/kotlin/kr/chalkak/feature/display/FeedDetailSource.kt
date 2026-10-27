package kr.chalkak.feature.display

import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.core.data.post.PostDetail
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/** `GET /posts/{id}` for the detail screen: checks the answer is the requested post and folds its like value into [LikeController]. */
internal class FeedDetailSource(
    private val repository: PostRepository,
    private val likes: LikeController,
    private val postId: String,
) {
    suspend fun load(): ApiResult<PostDetail> {
        val revision = likes.revision()
        val result = guardedApiCall("detail") {
            when (val answer = repository.detail(postId)) {
                is ApiResult.Success ->
                    if (answer.value.id.equals(postId, ignoreCase = true)) answer else ApiResult.Failure(ApiError.InvalidResponse("id mismatch"))
                is ApiResult.Failure -> answer
            }
        }
        if (result is ApiResult.Success) {
            val loaded = result.value
            likes.merge(loaded.id, LikeSnapshot(loaded.isLiked, loaded.likeCount), revision)
        }
        return result
    }
}

/** D-26: with a detail, mine = `authorId == logged-in user`; before it, the entry's value (until an account change). */
internal class FeedOwnership(private val entry: FeedEntry, private val user: CurrentUser) {
    private var provisional = true

    fun dropProvisional() {
        provisional = false
    }

    fun isMine(detail: PostDetail?): Boolean {
        if (detail == null) {
            return provisional && when (entry) {
                is FeedEntry.FromDisplay -> entry.post.isMine
                else -> true
            }
        }
        val userId = user.userId() ?: return false
        return detail.authorId.equals(userId, ignoreCase = true)
    }
}
