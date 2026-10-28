package kr.chalkak.feature.home

import kr.chalkak.core.data.home.BannerPage

/** Pure banner-list rules of the ISSUE section (REQ-BANR-005/007/008/009); the holder only decides when to apply them. */

/** Prefetch the next page once the last visible card is within this many cards of the end. */
internal const val BANNER_PREFETCH_DISTANCE = 2

/** First page: duplicates by id are dropped; no banner at all hides the section. */
internal fun issueOf(page: BannerPage): IssueState {
    val unique = page.banners.distinctBy { it.id }
    return if (unique.isEmpty()) IssueState.Hidden else IssueState.Ready(unique, page.hasNext)
}

internal fun IssueState.withoutLoadingMore(): IssueState =
    if (this is IssueState.Ready && loadingMore) copy(loadingMore = false) else this

internal fun IssueState.Ready.shouldPrefetch(lastVisibleIndex: Int): Boolean =
    !loadingMore && hasNext && lastVisibleIndex >= banners.size - BANNER_PREFETCH_DISTANCE

/** New banners (unknown ids) are appended; an empty page ends the paging. */
internal fun IssueState.appended(page: BannerPage): IssueState {
    if (this !is IssueState.Ready) return this
    val known = banners.map { it.id }.toSet()
    val added = page.banners.filter { it.id !in known }.distinctBy { it.id }
    return copy(
        banners = banners + added,
        hasNext = page.banners.isNotEmpty() && page.hasNext,
        nextPage = if (page.banners.isEmpty()) nextPage else nextPage + 1,
        loadingMore = false,
    )
}
