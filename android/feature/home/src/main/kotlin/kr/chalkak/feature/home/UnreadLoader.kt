package kr.chalkak.feature.home

import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.network.ApiResult

/** Unread dot of the bell. Failures are ignored on purpose: the dot keeps its previous value (TC-HOME-052). */
internal class UnreadLoader(private val core: HomeCore, private val home: HomeRepository) {
    suspend fun load(batch: Batch) = core.section("unread", onCrash = {}) {
        if (!core.member) return@section
        val result = core.guarded { home.unreadStatus() }
        if (result is ApiResult.Success) core.update(batch) { it.copy(hasUnread = result.value) }
    }
}
