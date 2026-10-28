package com.stonefive.chalkak.testing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.notification.testing.FakeNotificationRepository
import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import com.stonefive.chalkak.ui.home.ActiveHomeUnread
import kr.chalkak.feature.notification.NotificationDetailStateHolder
import kr.chalkak.feature.notification.NotificationInboxStateHolder
import kr.chalkak.feature.notification.NotificationPermissionFlow
import kr.chalkak.feature.notification.NotificationTapHandler
import kr.chalkak.feature.notification.PushNavigationEvent
import kr.chalkak.feature.notification.UnreadStatusRefresher
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Notification side of the app tests: the REAL inbox/detail holders and tap handler over a scripted [FakeNotificationRepository]
 * (`shared/fixtures/notification`), the OS permission flow over fakes, and the channel that stands in for `PushTapQueue.events`.
 * Holders get a recording tracker here; the app container gives them a tracker that drops everything (the navigation controller owns
 * `screen_view`, D-22), which is why host-level tests read screen views from [MainRig.analytics].
 */
class NotificationRig {
    val repo = FakeNotificationRepository()
    val unread = RecordingUnreadRefresher()
    val holderAnalytics = RecordingAnalytics()
    val clock = FakeClock()

    val inboxHolders = CopyOnWriteArrayList<NotificationInboxStateHolder>()
    val detailHolders = CopyOnWriteArrayList<NotificationDetailStateHolder>()

    /** `openSheetOnEntry` of every AI holder the host asked for through `newAiReviewHolderOnEntry`, in order. */
    val aiOpenFlags = CopyOnWriteArrayList<Boolean>()

    val permission = FakePermissionPort()
    val promptStore = InMemoryPromptStore()
    val permissionFlow = NotificationPermissionFlow(permission, promptStore)

    /** Stands in for `PushTapQueue.events`; tests `trySend` the events the queue would release. */
    val pushEvents = Channel<PushNavigationEvent>(Channel.UNLIMITED)

    /** Real `ActiveHomeUnread`: re-checks the unread dot of the home holder that the host attached. */
    val homeUnread = ActiveHomeUnread()

    /** What the tap handler and the detail holder call: recorded, then forwarded to the real home bridge. */
    private val unreadChain = UnreadStatusRefresher {
        unread.refresh()
        homeUnread.refresh()
    }

    fun tapHandler() = NotificationTapHandler(repo, unreadChain)

    fun newInboxHolder(scope: CoroutineScope): NotificationInboxStateHolder =
        NotificationInboxStateHolder(scope, repo, tapHandler(), holderAnalytics, clock).also { inboxHolders += it }

    fun newDetailHolder(scope: CoroutineScope): NotificationDetailStateHolder =
        NotificationDetailStateHolder(scope, repo, holderAnalytics, unreadChain).also { detailHolders += it }

    /** Next `GET /notifications` answers with the fixture (path under `shared/fixtures/notification/`, without the folder). */
    fun listFixture(name: String) {
        repo.listResults += NotificationFixtureModels.success("notification/$name.json")
    }

    fun detailFixture(name: String) {
        repo.detailResults += kr.chalkak.core.network.ApiResult.Success(NotificationFixtureModels.detail("notification/notification-detail__$name.json"))
    }

    companion object {
        const val APPROVED = "33333333-3333-4333-8333-333333333301"
        const val REJECTED = "33333333-3333-4333-8333-333333333302"
        const val AI_COMPLETED = "33333333-3333-4333-8333-333333333303"
        const val AI_FAILED = "33333333-3333-4333-8333-333333333304"
        const val NOTICE = "33333333-3333-4333-8333-333333333305"
        const val READ_APPROVED = "33333333-3333-4333-8333-333333333306"
        const val TOPIC = "33333333-3333-4333-8333-333333333331"
        const val REMINDER = "33333333-3333-4333-8333-333333333332"

        /** Post of the page1 rows 01..04. */
        const val POST = "22222222-2222-4222-8222-222222222201"
    }
}
