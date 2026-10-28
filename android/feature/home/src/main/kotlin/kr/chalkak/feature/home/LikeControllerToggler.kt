package kr.chalkak.feature.home

import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot

/**
 * Home's [LikeToggler] over the shared [LikeController], so home, display and feed show one like state per post (D-04).
 * The controller ignores posts it has never seen, so a post the home list shows first is registered with the values on
 * the tapped card; a post already known (e.g. from display) keeps the shared state and is simply flipped.
 * Failures (toast, rollback, removed post) are reported through [LikeController.events], not here.
 */
class LikeControllerToggler(private val controller: LikeController) : LikeToggler {
    override suspend fun toggle(postId: String, currentlyLiked: Boolean, likeCount: Int) {
        if (controller.state(postId) == null) {
            controller.merge(postId, LikeSnapshot(currentlyLiked, likeCount), controller.revision())
        }
        controller.toggle(postId)
    }
}
