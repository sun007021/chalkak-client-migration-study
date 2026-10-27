package kr.chalkak.feature.home

import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import java.time.LocalDate

/** Today / yesterday ranking (topic then top posts) and the topic header, which belongs to the "today" topic only. */
internal class RankingLoader(private val core: HomeCore, private val home: HomeRepository) {

    suspend fun load(batch: Batch, kind: RankingKind, date: LocalDate) =
        core.section("ranking.$kind", { error -> topicFailed(batch, kind, error) }) {
            when (val topic = core.guarded { home.topic(date) }) {
                is ApiResult.Success -> {
                    if (kind == RankingKind.Today) {
                        core.update(batch) { it.copy(topic = TopicHeader.Ready(DateFormats.todayTopicLabel(date), topic.value.title)) }
                    }
                    loadPosts(batch, kind, topic.value.topicDate)
                }
                is ApiResult.Failure -> if (!topic.error.isCancelled()) topicFailed(batch, kind, topic.error)
            }
        }

    /** Retry: back to Loading (the header only for the today topic). */
    fun markLoading(kind: RankingKind) = core.state.value.let {
        val header = if (kind == RankingKind.Today) TopicHeader.Loading else it.topic
        core.state.value = it.copy(topic = header).withRanking(kind, Section.Loading)
    }

    private fun topicFailed(batch: Batch, kind: RankingKind, error: ApiError) {
        if (error.isHttp(404)) {
            core.update(batch) { it.withRanking(kind, Section.Ready(emptyList())).withHeader(kind, TopicHeader.NotReady) }
        } else {
            core.update(batch) {
                it.withRanking(kind, sectionAfterFailure(batch, it.ranking(kind), error))
                    .withHeader(kind, headerAfterFailure(batch, it.topic, error))
            }
        }
    }

    private suspend fun loadPosts(batch: Batch, kind: RankingKind, topicDate: LocalDate) {
        when (val posts = core.guarded { home.popularPosts(topicDate) }) {
            is ApiResult.Success -> core.update(batch) { it.withRanking(kind, rankingOf(posts.value)) }
            is ApiResult.Failure -> when {
                posts.error.isCancelled() -> Unit
                posts.error.isHttp(404) -> core.update(batch) { it.withRanking(kind, Section.Ready(emptyList())) }
                else -> core.update(batch) { it.withRanking(kind, sectionAfterFailure(batch, it.ranking(kind), posts.error)) }
            }
        }
    }

    private fun HomeUiState.ranking(kind: RankingKind) = if (kind == RankingKind.Today) popular else yesterday

    private fun HomeUiState.withRanking(kind: RankingKind, section: Section<List<HomePost>>) =
        if (kind == RankingKind.Today) copy(popular = section) else copy(yesterday = section)

    private fun HomeUiState.withHeader(kind: RankingKind, header: TopicHeader) =
        if (kind == RankingKind.Today) copy(topic = header) else this

    private fun headerAfterFailure(batch: Batch, shown: TopicHeader, error: ApiError): TopicHeader =
        if (batch.keepContent && shown is TopicHeader.Ready) {
            batch.noteFailure(error)
            shown
        } else {
            TopicHeader.Error
        }
}
