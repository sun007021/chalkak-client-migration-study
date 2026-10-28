package kr.chalkak.feature.notification

import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

private const val PAGE1 = "notification/notifications__page1.json"
private const val ID1 = "33333333-3333-4333-8333-333333333301"
private const val ID2 = "33333333-3333-4333-8333-333333333302"
private const val ID3 = "33333333-3333-4333-8333-333333333303"
private const val ID4 = "33333333-3333-4333-8333-333333333304"
private const val ID5 = "33333333-3333-4333-8333-333333333305"
private const val POST = "22222222-2222-4222-8222-222222222201"

/** Payload parsing (TC-PUSH-045, 049, 050) from the `push/payload__*` fixtures. */
class PushPayloadTest {
    private val approved = PushPayload(
        type = "POST_APPROVED",
        notificationId = ID1,
        sourceType = "POST",
        sourceId = POST,
        eventId = "66666666-6666-4666-8666-666666666601",
    )

    @Test
    fun `TC-PUSH-050 a flat data map, Android intent extras and a plugin message all become the same PushPayload`() {
        val data = PushFixture.load("post-approved").data
        assertEquals(approved, PushPayloadParser.fromData(data))
        val extras = data + mapOf(
            "google.message_id" to "0:1793070000000000%abc",
            "google.sent_time" to 1_793_070_000_000L,
            "google.c.sender.id" to "1234567890",
            "from" to "1234567890",
            "collapse_key" to "kr.chalkak",
        )
        assertEquals(approved, PushPayloadParser.fromAndroidExtras(extras))
    }

    @Test
    fun `TC-PUSH-050 extras without google message_id are not an FCM tap`() {
        val data = PushFixture.load("post-approved").data
        assertNull(PushPayloadParser.fromAndroidExtras(data))
        assertNull(PushPayloadParser.fromAndroidExtras(emptyMap()))
    }

    @Test
    fun `TC-PUSH-050 a nested notification and data structure is not assumed`() {
        val nested = mapOf("data" to PushFixture.load("post-approved").data, "notification" to mapOf("title" to "x"))
        assertEquals(PushPayload(null, null, null, null, null), PushPayloadParser.fromData(nested))
    }

    @Test
    fun `TC-PUSH-049 numbers, nested objects and arrays are treated as missing and nothing throws`() {
        val payload = PushPayloadParser.fromData(PushFixture.load("non-string-values").data)
        assertEquals("POST_APPROVED", payload.type)
        assertEquals("POST", payload.sourceType)
        assertNull(payload.eventId)
        assertNull(payload.notificationId)
        assertNull(payload.sourceId)
    }

    @Test
    fun `TC-PUSH-049 a null value is missing too`() {
        val payload = PushPayloadParser.fromData(mapOf("type" to null, "notificationId" to ID1))
        assertNull(payload.type)
        assertEquals(ID1, payload.notificationId)
    }

    @Test
    fun `TC-PUSH-045 a payload without type has a null type`() {
        assertNull(PushPayloadParser.fromData(PushFixture.load("missing-type").data).type)
    }

    @Test
    fun `TC-PUSH-051 title and body are not part of the payload so they cannot steer routing`() {
        val a = PushMessage("제목 A", "본문 A", PushPayloadParser.fromData(PushFixture.load("post-approved").data))
        val b = PushMessage("전혀 다른 제목", null, PushPayloadParser.fromData(PushFixture.load("post-approved").data))
        assertEquals(a.payload, b.payload)
        assertEquals(NotificationTapPlanner.forPush(a.payload), NotificationTapPlanner.forPush(b.payload))
    }
}

/** The shared D-11 table for push taps (TC-PUSH-037..048) and inbox rows (TC-NOTI-024..031). */
class NotificationTapPlannerTest {
    private fun push(name: String) = NotificationTapPlanner.forPush(PushFixture.load(name).payload)

    private fun payload(
        type: String? = "POST_APPROVED",
        notificationId: String? = ID1,
        sourceType: String? = "POST",
        sourceId: String? = POST,
    ) = PushPayload(type, notificationId, sourceType, sourceId, eventId = "66666666-6666-4666-8666-666666666601")

    private fun row(id: String) = NotificationFixtureModels.itemById(PAGE1, id)

    // ---- push taps --------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-037 TOPIC goes home with scroll-to-top and refresh and sends no read`() {
        assertEquals(TapPlan(NotificationDestination.Home(scrollToTopAndRefresh = true), readNotificationId = null), push("topic"))
    }

    @Test
    fun `TC-PUSH-037 the TOPIC sourceId date is ignored whatever it is`() {
        val plan = NotificationTapPlanner.forPush(payload(type = "TOPIC", notificationId = null, sourceType = "TOPIC", sourceId = "not-a-uuid"))
        assertEquals(TapPlan(NotificationDestination.Home(true), null), plan)
    }

    @Test
    fun `TC-PUSH-038 REMINDER goes home without scroll and sends no read`() {
        assertEquals(TapPlan(NotificationDestination.Home(scrollToTopAndRefresh = false), null), push("reminder"))
    }

    @Test
    fun `TC-PUSH-039 POST_APPROVED reads the notification then opens my post sourceId`() {
        assertEquals(TapPlan(NotificationDestination.PostDetail(POST, openAiFeedbackSheet = false), ID1), push("post-approved"))
    }

    @Test
    fun `TC-PUSH-040 AI_REVIEW_COMPLETED and AI_REVIEW_FAILED read then open the post with the AI sheet flag`() {
        val completed = push("ai-review-completed")
        val failed = push("ai-review-failed")
        assertEquals(NotificationDestination.PostDetail(POST, openAiFeedbackSheet = true), completed.destination)
        assertEquals(NotificationDestination.PostDetail(POST, openAiFeedbackSheet = true), failed.destination)
        assertNotNull(completed.readNotificationId)
        assertNotNull(failed.readNotificationId)
        assertEquals(PushFixture.load("ai-review-failed").payload.notificationId, failed.readNotificationId)
    }

    @Test
    fun `TC-PUSH-041 POST_REJECTED reads then opens the notification detail by notificationId`() {
        val fixture = PushFixture.load("post-rejected").payload
        assertEquals(TapPlan(NotificationDestination.NotificationDetail(fixture.notificationId!!), fixture.notificationId), push("post-rejected"))
    }

    @Test
    fun `TC-PUSH-042 NOTICE opens the detail by notificationId, never by the notice sourceId`() {
        val fixture = PushFixture.load("notice").payload
        assertNotEquals(fixture.notificationId, fixture.sourceId)
        assertEquals(TapPlan(NotificationDestination.NotificationDetail(ID5), ID5), push("notice"))
    }

    @Test
    fun `TC-PUSH-043 NOTICE without a notificationId goes to the inbox without a read`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), push("missing-notification-id"))
    }

    @Test
    fun `TC-PUSH-043 NOTICE with a notificationId that is not a UUID goes to the inbox`() {
        val plan = NotificationTapPlanner.forPush(payload(type = "NOTICE", notificationId = "12345", sourceType = "NOTICE"))
        assertEquals(TapPlan(NotificationDestination.Inbox, null), plan)
    }

    @Test
    fun `TC-PUSH-044 an unknown type goes to the inbox with no read and no crash`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), push("unknown-type"))
    }

    @Test
    fun `TC-PUSH-045 a payload without type goes to the inbox with no read`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), push("missing-type"))
    }

    @Test
    fun `TC-PUSH-046 an id that is not a UUID goes to the inbox with no read`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), push("invalid-uuid"))
        assertEquals(TapPlan(NotificationDestination.Inbox, null), NotificationTapPlanner.forPush(payload(sourceId = "not-a-uuid")))
        assertEquals(TapPlan(NotificationDestination.Inbox, null), NotificationTapPlanner.forPush(payload(notificationId = "not-a-uuid")))
    }

    @Test
    fun `TC-PUSH-046 POST_APPROVED without a notificationId has nothing to read so it goes to the inbox`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), NotificationTapPlanner.forPush(payload(notificationId = null)))
        assertEquals(TapPlan(NotificationDestination.Inbox, null), NotificationTapPlanner.forPush(payload(sourceId = null)))
    }

    @Test
    fun `TC-PUSH-047 an AI review whose sourceType is not POST goes to the inbox`() {
        assertEquals(TapPlan(NotificationDestination.Inbox, null), push("ai-source-type-not-post"))
        assertEquals(TapPlan(NotificationDestination.Inbox, null), NotificationTapPlanner.forPush(payload(type = "AI_REVIEW_FAILED", sourceType = null)))
    }

    @Test
    fun `TC-PUSH-048 upper-case UUIDs are valid and leave the plan in lower-case`() {
        val upperNotification = "ABCDEF01-AAAA-4AAA-8AAA-ABCDEFABCDEF"
        val upperPost = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
        val plan = NotificationTapPlanner.forPush(payload(notificationId = upperNotification, sourceId = upperPost))
        assertEquals(
            TapPlan(NotificationDestination.PostDetail(upperPost.lowercase(), false), upperNotification.lowercase()),
            plan,
        )
        val detail = NotificationTapPlanner.forPush(payload(type = "POST_REJECTED", notificationId = upperNotification))
        assertEquals(TapPlan(NotificationDestination.NotificationDetail(upperNotification.lowercase()), upperNotification.lowercase()), detail)
    }

    @Test
    fun `TC-PUSH-052 eventId plays no part in the plan`() {
        val a = NotificationTapPlanner.forPush(payload().copy(eventId = "66666666-6666-4666-8666-666666666601"))
        val b = NotificationTapPlanner.forPush(payload().copy(eventId = null))
        assertEquals(a, b)
    }

    // ---- inbox rows -------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-027 a POST_APPROVED row reads its own id then opens my post`() {
        assertEquals(
            TapPlan(NotificationDestination.PostDetail(POST, openAiFeedbackSheet = false), readNotificationId = ID1),
            NotificationTapPlanner.forInboxRow(row(ID1)),
        )
    }

    @Test
    fun `TC-NOTI-028 AI_REVIEW_COMPLETED and AI_REVIEW_FAILED rows open the post with the AI sheet flag on`() {
        assertEquals(TapPlan(NotificationDestination.PostDetail(POST, true), ID3), NotificationTapPlanner.forInboxRow(row(ID3)))
        assertEquals(TapPlan(NotificationDestination.PostDetail(POST, true), ID4), NotificationTapPlanner.forInboxRow(row(ID4)))
    }

    @Test
    fun `TC-NOTI-029 an AI row whose sourceType is not POST or whose sourceId is not a UUID goes nowhere`() {
        val bad = NotificationFixtureModels.page("notification/notifications__bad-ai-source.json").items
        assertEquals(2, bad.size)
        for (item in bad) assertEquals(TapPlan(null, null), NotificationTapPlanner.forInboxRow(item), item.id)
    }

    @Test
    fun `TC-NOTI-030 a NOTICE row opens the detail of the row id, not of the notice sourceId`() {
        val notice = row(ID5)
        assertEquals(NotificationDestination.NotificationDetail(ID5), NotificationTapPlanner.forInboxRow(notice).destination)
        assertEquals(ID5, NotificationTapPlanner.forInboxRow(notice).readNotificationId)
        assertNotEquals(notice.sourceId, ID5)
    }

    @Test
    fun `TC-NOTI-031 a POST_REJECTED row reads then opens the notification detail`() {
        assertEquals(TapPlan(NotificationDestination.NotificationDetail(ID2), ID2), NotificationTapPlanner.forInboxRow(row(ID2)))
    }

    @Test
    fun `TC-NOTI-024 an unknown type row has no destination and no read`() {
        val unknown = NotificationFixtureModels.page("notification/notifications__unknown-type.json").items.single()
        assertEquals(TapPlan(null, null), NotificationTapPlanner.forInboxRow(unknown))
    }

    @Test
    fun `TC-NOTI-025 TOPIC and REMINDER rows go home and send no read`() {
        val rows = NotificationFixtureModels.page("notification/notifications__topic-reminder.json").items
        for (item in rows) {
            val plan = NotificationTapPlanner.forInboxRow(item)
            assertNotNull(plan.destination as? NotificationDestination.Home, item.rawType)
            assertNull(plan.readNotificationId, item.rawType)
        }
    }

    @Test
    fun `TC-NOTI-026 POST_APPROVED with null source fields has no destination and no read`() {
        val item = NotificationFixtureModels.page("notification/notifications__null-source.json").items.single()
        assertEquals(TapPlan(null, null), NotificationTapPlanner.forInboxRow(item))
    }
}

/** Where a command lands on the back stack (REQ-PUSH-029, TC-PUSH-064/065). */
class NavModesTest {
    @Test
    fun `TC-PUSH-064 the same post detail already on top is replaced, a different one is pushed`() {
        val dest = NotificationDestination.PostDetail(POST, openAiFeedbackSheet = true)
        assertEquals(NavMode.ReplaceTop, NavModes.resolve(dest, TopScreen.PostDetail(POST)))
        assertEquals(NavMode.Push, NavModes.resolve(dest, TopScreen.PostDetail("22222222-2222-4222-8222-222222222202")))
        assertEquals(NavMode.Push, NavModes.resolve(dest, TopScreen.Home))
    }

    @Test
    fun `TC-PUSH-064 the same notification detail on top is replaced`() {
        val dest = NotificationDestination.NotificationDetail(ID2)
        assertEquals(NavMode.ReplaceTop, NavModes.resolve(dest, TopScreen.NotificationDetail(ID2)))
        assertEquals(NavMode.Push, NavModes.resolve(dest, TopScreen.NotificationDetail(ID5)))
    }

    @Test
    fun `TC-PUSH-065 TOPIC while already on home opens nothing new`() {
        assertEquals(NavMode.AlreadyThere, NavModes.resolve(NotificationDestination.Home(true), TopScreen.Home))
        assertEquals(NavMode.AlreadyThere, NavModes.resolve(NotificationDestination.Home(false), TopScreen.Home))
    }
}
