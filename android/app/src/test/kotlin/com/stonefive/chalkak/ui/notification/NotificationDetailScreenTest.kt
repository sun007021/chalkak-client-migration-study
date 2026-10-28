package com.stonefive.chalkak.ui.notification

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.NotificationRig
import com.stonefive.chalkak.testing.RecordingImage
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.core.data.notification.NotificationDetail
import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import kr.chalkak.core.data.notification.testing.httpFail
import kr.chalkak.core.data.notification.testing.offlineFail
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.notification.DetailUiState
import kr.chalkak.feature.notification.NotiCopyKeys
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Stateless `NotificationDetailScreen`; states come from the real `NotificationDetailStateHolder` over fixtures (testids.md `notification-detail.*`). */
@RunWith(RobolectricTestRunner::class)
class NotificationDetailScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val scope = HolderScope()
    private val noti = NotificationRig()
    private val images = RecordingImage()

    private val backs = CopyOnWriteArrayList<Unit>()
    private val retries = CopyOnWriteArrayList<Unit>()
    private val toInbox = CopyOnWriteArrayList<Unit>()

    @After
    fun tearDown() = scope.close()

    private fun fixture(name: String): NotificationDetail = NotificationFixtureModels.detail("notification/notification-detail__$name.json")

    /** The state the holder reaches after [result]. */
    private fun stateAfter(result: ApiResult<NotificationDetail>): DetailUiState {
        noti.repo.detailResults += result
        val holder = noti.newDetailHolder(scope.scope)
        holder.onShown("33333333-3333-4333-8333-333333333302")
        return holder.state.value
    }

    private fun show(state: DetailUiState) {
        rule.setContent {
            TestApp(copy) {
                NotificationDetailScreen(
                    state = state,
                    callbacks = NotificationDetailCallbacks(
                        onBack = { backs += Unit },
                        onRetry = { retries += Unit },
                        onToInbox = { toInbox += Unit },
                    ),
                    image = images.slot,
                )
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    @Test
    fun `로딩 중에는 로딩 표시만 있고 제목 바와 뒤로 버튼은 있다`() {
        show(DetailUiState())
        tag("notification-detail.root").assertIsDisplayed()
        tag("notification-detail.screen-title").assertShowsAll(copy[NotiCopyKeys.DETAIL_TITLE])
        tag("notification-detail.back-button").assertIsDisplayed()
        tag("notification-detail.loading").assertIsDisplayed()
        count("notification-detail.title").assertCountEquals(0)
        count("notification-detail.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-042 반려 상세는 원본 사진과 반려 사유 섹션과 알림함으로 버튼을 보이고 새로 올리기는 없다`() {
        val detail = fixture("rejected")
        show(stateAfter(ApiResult.Success(detail)))
        tag("notification-detail.title").assertShowsAll(detail.title)
        tag("notification-detail.body").assertShowsAll(detail.body)
        tag("notification-detail.photo").assertIsDisplayed()
        assertTrue(detail.originalImageUrl in images.urls, "original photo url is handed to the image slot")
        tag("notification-detail.rejection-section").assertShowsAll(copy[NotiCopyKeys.DETAIL_REASON])
        tag("notification-detail.rejection-reason").assertShowsAll(detail.rejectionReason!!)
        tag("notification-detail.back-to-inbox-button").assertShowsAll(copy[NotiCopyKeys.DETAIL_TO_INBOX])
        rule.onAllNodesWithText(copy["noti.detail.reupload"]).assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-042 알림함으로 버튼과 뒤로 버튼은 각자의 콜백을 부른다`() {
        show(stateAfter(ApiResult.Success(fixture("rejected"))))
        tag("notification-detail.back-to-inbox-button").performClick()
        assertEquals(1, toInbox.size)
        tag("notification-detail.back-button").performClick()
        assertEquals(1, backs.size)
    }

    @Test
    fun `TC-NOTI-043 반려 사유 500자 긴 텍스트도 스크롤하면 전문이 보인다`() {
        val detail = fixture("rejected-long-reason")
        show(stateAfter(ApiResult.Success(detail)))
        tag("notification-detail.rejection-reason").performScrollTo().assertTextEquals(detail.rejectionReason!!)
        tag("notification-detail.back-to-inbox-button").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-044 공지 상세는 제목과 본문 전문만 보이고 사진 반려 사유 알림함으로 버튼은 없다`() {
        val detail = fixture("notice")
        show(stateAfter(ApiResult.Success(detail)))
        tag("notification-detail.title").assertShowsAll(detail.title)
        tag("notification-detail.body").assertShowsAll(detail.body)
        count("notification-detail.photo").assertCountEquals(0)
        count("notification-detail.rejection-section").assertCountEquals(0)
        count("notification-detail.rejection-reason").assertCountEquals(0)
        count("notification-detail.back-to-inbox-button").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-045 상세가 404 면 찾을 수 없음 상태만 보이고 이전 알림 정보는 없다`() {
        show(stateAfter(httpFail(404)))
        tag("notification-detail.not-found-state").assertShowsAll(copy[NotiCopyKeys.GONE])
        count("notification-detail.title").assertCountEquals(0)
        count("notification-detail.body").assertCountEquals(0)
        count("notification-detail.photo").assertCountEquals(0)
        count("notification-detail.loading").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-046 상세 로드가 500 이면 오류 상태와 다시 시도 버튼을 보이고 누르면 콜백이 불린다`() {
        show(stateAfter(httpFail(500, ErrorCode.INTERNAL_ERROR)))
        tag("notification-detail.error-state").assertShowsAll(copy[NotiCopyKeys.DETAIL_ERROR])
        tag("notification-detail.retry-button").assertShowsAll(copy[NotiCopyKeys.INBOX_RETRY]).performClick()
        assertEquals(1, retries.size)
    }

    @Test
    fun `TC-NOTI-046 네트워크 오류는 네트워크 확인 문구를 보인다`() {
        show(stateAfter(offlineFail()))
        tag("notification-detail.error-state").assertShowsAll(copy[NotiCopyKeys.NETWORK])
    }

    @Test
    fun `TC-NOTI-047 승인 상세는 사진이 있으면 보이고 없으면 제목과 본문만 보이며 깨지지 않는다`() {
        val withPhoto = fixture("approved")
        show(stateAfter(ApiResult.Success(withPhoto)))
        tag("notification-detail.photo").assertIsDisplayed()
        tag("notification-detail.title").assertShowsAll(withPhoto.title)
        count("notification-detail.rejection-section").assertCountEquals(0)
        count("notification-detail.back-to-inbox-button").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-047 승인 상세에 원본 사진 url 이 없으면 사진 영역이 없다`() {
        val withoutPhoto = fixture("approved").copy(originalImageUrl = null)
        show(stateAfter(ApiResult.Success(withoutPhoto)))
        tag("notification-detail.title").assertShowsAll(withoutPhoto.title)
        tag("notification-detail.body").assertShowsAll(withoutPhoto.body)
        count("notification-detail.photo").assertCountEquals(0)
    }
}
