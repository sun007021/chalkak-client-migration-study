package com.stonefive.chalkak.ui.home

import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.Section

/**
 * Feeds the home ranking/popular lists into the shared [LikeController] (`merge`) once per list that the holder produced.
 * The revision passed to `merge` is the one taken before the load started ([markLoadStart], or the moment a section was seen
 * Loading), so a like the user tapped while the request was in flight is never overwritten by the older server value.
 */
class HomeLikeSync(private val likes: LikeController) {
    private var revisionAtLoad: Long = likes.revision()
    private var yesterday: List<HomePost>? = null
    private var popular: List<HomePost>? = null

    /** Call right before anything that makes the holder load (first show, pull to refresh, retry). */
    fun markLoadStart() {
        revisionAtLoad = likes.revision()
    }

    fun onState(state: HomeUiState) {
        if (state.yesterday is Section.Loading || state.popular is Section.Loading) markLoadStart()
        yesterday = mergeIfNew(state.yesterday, yesterday)
        popular = mergeIfNew(state.popular, popular)
    }

    private fun mergeIfNew(section: Section<List<HomePost>>, merged: List<HomePost>?): List<HomePost>? {
        val posts = (section as? Section.Ready)?.value ?: return if (section is Section.Loading) null else merged
        if (posts === merged) return merged
        posts.forEach { likes.merge(it.id, LikeSnapshot(it.isLiked, it.likeCount), revisionAtLoad) }
        return posts
    }
}
