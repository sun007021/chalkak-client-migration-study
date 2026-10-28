package kr.chalkak.feature.upload

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** TC-UPL-011..013, 087, 088: topic lookup of the upload screen, the pinned topicDate, analytics. */
class UploadTopicTest {
    @Test
    fun `TC-UPL-011 topic is read for the pinned date and gives topicId and title`() = runTest {
        val rig = uploadRig()
        rig.show()
        assertEquals(listOf(ENTRY_DATE), rig.home.topicCalls.toList())
        assertEquals(TopicState.Loaded(TOPIC_FIXTURE.id, TOPIC_FIXTURE.title), rig.s.topic)
        assertTrue(Copy[UploadCopyKeys.TOPIC_LOAD_FAILED].isNotBlank())
    }

    @Test
    fun `TC-UPL-011 a topic answer whose topicDate differs from the request is a load failure`() = runTest {
        val rig = uploadRig()
        rig.home.topicHandler = { ApiResult.Success(HomeFixtureModels.topic("upload/topics__mismatch-date.json")) }
        rig.show()
        assertEquals(TopicState.Failed(UploadCopyKeys.TOPIC_LOAD_FAILED), rig.s.topic)
    }

    @Test
    fun `TC-UPL-011 an InvalidResponse topic answer is a load failure`() = runTest {
        val rig = uploadRig()
        rig.home.topicHandler = { ApiResult.Failure(ApiError.InvalidResponse("topicDate mismatch")) }
        rig.show()
        assertEquals(TopicState.Failed(UploadCopyKeys.TOPIC_LOAD_FAILED), rig.s.topic)
    }

    @Test
    fun `TC-UPL-012 404 and 500 show the topic load failure, a connection failure shows the network text, not a create error`() = runTest {
        val cases = listOf(
            HomeFixtureModels.failure("home/topics__404-not-found.json") to UploadCopyKeys.TOPIC_LOAD_FAILED,
            HomeFixtureModels.failure("upload/topics__500-server-error.json") to UploadCopyKeys.TOPIC_LOAD_FAILED,
            ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE)) to UploadCopyKeys.ERROR_NETWORK,
            ApiResult.Failure(ApiError.Network(NetworkKind.TIMEOUT)) to UploadCopyKeys.ERROR_NETWORK,
        )
        cases.forEach { (failure, key) ->
            val rig = uploadRig()
            rig.home.topicHandler = { failure }
            rig.show()
            assertEquals(TopicState.Failed(key), rig.s.topic, "for $failure")
            assertNull(rig.s.error, "the topic error lives in the topic state, not in the submit error")
        }
    }

    @Test
    fun `TC-UPL-012 a 401 that survived the refresh asks for re-login`() = runTest {
        val rig = uploadRig()
        rig.home.topicHandler = { ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)) }
        rig.show()
        assertTrue(UploadEffect.ReauthRequired in rig.effects, "effects: ${rig.effects}")
    }

    @Test
    fun `TC-UPL-012 retry reloads only the topic`() = runTest {
        val rig = uploadRig()
        rig.home.topicHandler = { HomeFixtureModels.failure("upload/topics__500-server-error.json") }
        rig.show()
        assertEquals(TopicState.Failed(UploadCopyKeys.TOPIC_LOAD_FAILED), rig.s.topic)
        rig.home.topicHandler = { ApiResult.Success(TOPIC_FIXTURE) }
        rig.holder.onTopicRetryClicked()
        rig.idle()
        assertEquals(2, rig.home.topicCalls.size)
        assertEquals(TopicState.Loaded(TOPIC_FIXTURE.id, TOPIC_FIXTURE.title), rig.s.topic)
        assertTrue(rig.creation.uploadCalls.isEmpty())
        assertTrue(rig.home.todayCalls.isEmpty())
    }

    @Test
    fun `TC-UPL-013 the topicDate and topicId taken at entry are used for the submit, nothing is recomputed`() = runTest {
        val rig = uploadRig()
        rig.ready()
        // 23:59:30 -> 00:01 KST: the holder has no clock; the only inputs are the entry date and the topic answer received at entry.
        rig.advanceSeconds(31.0)
        rig.submit()
        assertEquals(listOf(ENTRY_DATE), rig.home.topicCalls.toList(), "the topic is never re-read for another date")
        assertTrue(rig.home.todayCalls.isEmpty())
        assertEquals(TOPIC_FIXTURE.id, rig.creation.createCalls.single().topicId)
        assertEquals(ENTRY_DATE, rig.published.single().topicDate)
    }

    @Test
    fun `TC-UPL-087 dates stay on the pinned KST date whatever the device time zone is`() {
        listOf("America/Los_Angeles", "UTC", "Asia/Seoul").forEach { zone ->
            withDevice(zoneId = zone) {
                runTest {
                    val rig = uploadRig(topicDate = LocalDate.of(2026, 10, 27))
                    rig.ready()
                    rig.submit()
                    assertEquals(listOf(LocalDate.of(2026, 10, 27)), rig.home.topicCalls.toList(), zone)
                    val success = rig.effects.filterIsInstance<UploadEffect.ShowSuccess>().single()
                    assertEquals(LocalDate.of(2026, 10, 27), success.info.topicDate, zone)
                }
            }
        }
    }

    @Test
    fun `TC-UPL-088 photo_upload is sent once per screen, photo_upload_success once on success`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onScreenShown()
        rig.idle()
        assertEquals(listOf("photo_upload"), rig.analytics.screens.toList())
        rig.pickAndConfirm()
        rig.submit()
        assertEquals(listOf("photo_upload", "photo_upload_success"), rig.analytics.screens.toList())
    }
}
