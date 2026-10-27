package kr.chalkak.feature.home

import kotlinx.coroutines.flow.update
import kr.chalkak.core.data.home.BannerRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/** ISSUE banner section: first page, prefetch decision, paging and page failures (REQ-BANR-005..009, D-20). */
internal class IssueBannerPager(private val core: HomeCore, private val banners: BannerRepository) {

    suspend fun loadFirstPage(batch: Batch) =
        core.section("issue", { error -> update(batch) { it.copy(issue = issueAfterFailure(batch, it.issue, error)) } }) {
            when (val result = core.guarded { banners.banners(1) }) {
                is ApiResult.Success -> update(batch) { it.copy(issue = issueOf(result.value)) }
                is ApiResult.Failure -> if (!result.error.isCancelled()) {
                    update(batch) { it.copy(issue = issueAfterFailure(batch, it.issue, result.error)) }
                }
            }
        }

    /** Page to request now (marking it loading), or null when the scroll position needs no request. */
    fun requestNextPage(lastVisibleIndex: Int): Int? {
        val issue = core.state.value.issue as? IssueState.Ready ?: return null
        if (!issue.shouldPrefetch(lastVisibleIndex)) return null
        core.state.update { it.copy(issue = issue.copy(loadingMore = true)) }
        return issue.nextPage
    }

    suspend fun loadMore(batch: Batch, page: Int) =
        core.section("issue.more", { error -> pageFailed(batch, error) }) {
            when (val result = core.guarded { banners.banners(page) }) {
                is ApiResult.Success -> update(batch) { it.copy(issue = it.issue.appended(result.value)) }
                is ApiResult.Failure -> pageFailed(batch, result.error)
            }
        }

    private fun update(batch: Batch, transform: (HomeUiState) -> HomeUiState) = core.update(batch, transform)

    private fun pageFailed(batch: Batch, error: ApiError) {
        update(batch) { it.copy(issue = it.issue.withoutLoadingMore()) }
        if (core.isCurrent(batch) && !error.isCancelled()) core.showToast(error.toastKey())
    }

    private fun issueAfterFailure(batch: Batch, shown: IssueState, error: ApiError): IssueState =
        if (batch.keepContent && (shown is IssueState.Ready || shown == IssueState.Hidden)) {
            batch.noteFailure(error)
            shown
        } else {
            IssueState.Error
        }
}
