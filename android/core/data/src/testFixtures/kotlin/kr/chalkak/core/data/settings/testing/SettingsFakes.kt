package kr.chalkak.core.data.settings.testing

import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.settings.FeedbackReceipt
import kr.chalkak.core.data.settings.FeedbackRepository
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.data.settings.NotificationSettingsRepository
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.core.network.ApiResult
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Scripted [NotificationSettingsRepository]. Unscripted calls succeed (all switches on / 204).
 * Results are taken when the call STARTS; gates are read at call start and awaited before returning, so a test can
 * hold one call in flight, clear the gate property, and let a later call finish first (late-response tests).
 */
class FakeNotificationSettingsRepository : NotificationSettingsRepository {
    val loadCalls = CopyOnWriteArrayList<Int>()
    val updateCalls = CopyOnWriteArrayList<Pair<PushSetting, Boolean>>()
    val loadResults = ArrayDeque<ApiResult<NotificationSettings>>()
    /** Per-setting scripted PATCH results. */
    val updateResults = mutableMapOf<PushSetting, ArrayDeque<ApiResult<Unit>>>()
    var loadGate: CompletableDeferred<Unit>? = null
    /** Per-setting PATCH gates (settings without a gate are not held). */
    val updateGates = mutableMapOf<PushSetting, CompletableDeferred<Unit>>()

    fun scriptUpdate(setting: PushSetting, vararg results: ApiResult<Unit>) {
        updateResults.getOrPut(setting) { ArrayDeque() }.addAll(results)
    }

    override suspend fun load(): ApiResult<NotificationSettings> {
        loadCalls += loadCalls.size + 1
        val result = loadResults.removeFirstOrNull() ?: ApiResult.Success(ALL_ON)
        loadGate?.await()
        return result
    }

    override suspend fun update(setting: PushSetting, enabled: Boolean): ApiResult<Unit> {
        updateCalls += setting to enabled
        val result = updateResults[setting]?.removeFirstOrNull() ?: ApiResult.Success(Unit)
        updateGates[setting]?.await()
        return result
    }

    companion object {
        val ALL_ON = NotificationSettings(topic = true, moderation = true, aiReview = true)
    }
}

/** Scripted [FeedbackRepository]. Unscripted calls succeed with a fixed receipt. */
class FakeFeedbackRepository : FeedbackRepository {
    val sent = CopyOnWriteArrayList<String>()
    val results = ArrayDeque<ApiResult<FeedbackReceipt>>()
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun send(content: String): ApiResult<FeedbackReceipt> {
        sent += content
        val result = results.removeFirstOrNull() ?: ApiResult.Success(RECEIPT)
        gate?.await()
        return result
    }

    companion object {
        val RECEIPT = FeedbackReceipt("12121212-1212-4121-8121-121212121201", Instant.parse("2026-10-27T03:00:00Z"))
    }
}
