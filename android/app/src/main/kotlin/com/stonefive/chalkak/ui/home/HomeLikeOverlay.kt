package com.stonefive.chalkak.ui.home

import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.post.LikePostState
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.Section

/**
 * What the home screen shows is the holder's state with the shared like state and removals applied on top (D-04): a like tapped in
 * display or feed shows here too, and a post that was deleted or answered 404 never comes back from a late list response.
 */
object HomeLikeOverlay {
    fun apply(state: HomeUiState, likes: Map<String, LikePostState>, removed: Set<String>): HomeUiState =
        if (likes.isEmpty() && removed.isEmpty()) {
            state
        } else {
            state.copy(yesterday = overlay(state.yesterday, likes, removed), popular = overlay(state.popular, likes, removed))
        }

    private fun overlay(section: Section<List<HomePost>>, likes: Map<String, LikePostState>, removed: Set<String>): Section<List<HomePost>> {
        if (section !is Section.Ready) return section
        val posts = section.value.filter { it.id !in removed }.map { post ->
            val shared = likes[post.id]?.snapshot ?: return@map post
            post.copy(isLiked = shared.isLiked, likeCount = shared.likeCount)
        }
        return Section.Ready(posts)
    }
}
