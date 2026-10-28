package kr.chalkak.feature.upload

import java.time.LocalDate
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall

/** Loads the topic of the pinned [topicDate] into the screen state (REQ-UPL-009, 010). */
internal class UploadTopic(
    private val topicDate: LocalDate,
    private val home: HomeRepository,
    private val store: UploadStore,
) {
    suspend fun load() {
        store.update { it.copy(topic = TopicState.Loading) }
        val answer = guardedApiCall("topic") { home.topic(topicDate) }
        val next = when (answer) {
            is ApiResult.Success ->
                if (answer.value.topicDate == topicDate) TopicState.Loaded(answer.value.id, answer.value.title) else failed(TOPIC_FAILED)
            is ApiResult.Failure -> failureState(answer.error)
        }
        store.update { it.copy(topic = next) }
    }

    /** The loaded topic; a missing one is loaded now, and null (with the failure on screen) when that fails too. */
    suspend fun ensureLoaded(): TopicState.Loaded? {
        if (store.current.topic !is TopicState.Loaded) load()
        val topic = store.current.topic
        if (topic is TopicState.Failed) store.showError(topic.copyKey)
        return topic as? TopicState.Loaded
    }

    // D-02: only status / errorCode decide.
    private fun failureState(error: ApiError): TopicState = when {
        error is ApiError.Network -> failed(UploadCopyKeys.ERROR_NETWORK)
        error is ApiError.Http && error.status == HTTP_UNAUTHORIZED -> {
            store.emit(UploadEffect.ReauthRequired)
            failed(TOPIC_FAILED)
        }
        else -> failed(TOPIC_FAILED)
    }

    private fun failed(copyKey: String) = TopicState.Failed(copyKey)

    private companion object {
        const val TOPIC_FAILED = UploadCopyKeys.TOPIC_LOAD_FAILED
        const val HTTP_UNAUTHORIZED = 401
    }
}
