import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport

private func userInfo(_ name: String) throws -> [AnyHashable: Any] {
    let data = try #require(try Fixture.load("push/\(name).json").object()["data"] as? [String: Any])
    return Dictionary(uniqueKeysWithValues: data.map { (AnyHashable($0.key), $0.value) })
}

private func payload(_ name: String) throws -> PushPayload { PushPayload(userInfo: try userInfo(name)) }

private func uuid(_ text: String) -> UUID { UUID(uuidString: text)! }

private let notification01 = uuid("33333333-3333-4333-8333-333333333301")
private let post01 = uuid("22222222-2222-4222-8222-222222222201")

@Suite("PUSH payload 파싱·목적지 결정", .timeLimit(.minutes(1)))
struct PushRoutingTests {
    // MARK: 파싱

    @Test("TC-PUSH-050 iOS userInfo(평탄 구조, aps·gcm 키 포함), 문자열 맵, 필드 맵은 모두 같은 PushPayload가 된다")
    func adaptersProduceSamePayload() throws {
        let strings = [
            "type": "POST_APPROVED", "notificationId": "33333333-3333-4333-8333-333333333301",
            "sourceType": "POST", "sourceId": "22222222-2222-4222-8222-222222222201",
        ]
        var flat: [AnyHashable: Any] = strings
        flat["aps"] = ["alert": ["title": "t", "body": "b"]]
        flat["gcm.message_id"] = "0:123"
        flat["google.c.a.e"] = "1"
        let expected = PushPayload(type: "POST_APPROVED", notificationId: notification01, sourceType: "POST", sourceId: post01)

        #expect(PushPayload(userInfo: flat) == expected)
        #expect(PushPayload(strings: strings) == expected)
        #expect(PushPayload(fields: strings.mapValues { .string($0) }) == expected)
        #expect(try payload("payload__post-approved") == expected)
    }

    @Test("TC-PUSH-050 iOS 중첩 notification/data 구조는 가정하지 않는다(최상위 키만 읽는다)")
    func nestedStructureIsNotAssumed() {
        let nested: [AnyHashable: Any] = ["data": ["type": "POST_APPROVED", "notificationId": "33333333-3333-4333-8333-333333333301"]]
        #expect(PushPayload(userInfo: nested) == PushPayload())
    }

    @Test("TC-PUSH-048 대문자 UUID도 유효한 UUID로 읽는다")
    func uppercaseUUIDIsValid() throws {
        let parsed = try payload("payload__uppercase-uuid")
        #expect(parsed.notificationId == uuid("33333333-3333-4333-8333-3333333333AB"))
        #expect(parsed.sourceId == post01)
    }

    @Test("TC-PUSH-049 data 값이 숫자·객체·배열이면 해당 필드를 누락으로 보고 예외가 없다")
    func nonStringValuesAreMissing() throws {
        let parsed = try payload("payload__non-string-values")
        #expect(parsed.type == "POST_APPROVED")
        #expect(parsed.notificationId == nil)
        #expect(parsed.sourceId == nil)
        #expect(parsed.sourceType == "POST")
        #expect(NotificationRouting.plan(forPush: parsed) == .navigate(.inbox))
    }

    @Test("TC-PUSH-050 저장 표현(storedFields)을 되돌리면 같은 payload다(프로세스 복원)")
    func storedFieldsRoundTrip() throws {
        let original = try payload("payload__ai-review-completed")
        #expect(original.type == "AI_REVIEW_COMPLETED")
        #expect(original.sourceId == post01)
        #expect(PushPayload(strings: original.storedFields) == original)
        #expect(PushPayload().storedFields.isEmpty)
    }

    // MARK: 푸시 탭 목적지(D-11 표)

    @Test("TC-PUSH-037 TOPIC은 읽음 없이 홈(맨 위 + 새로고침)이며 sourceId 날짜는 쓰지 않는다")
    func topic() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__topic")) == .navigate(.home(refreshing: true)))
    }

    @Test("TC-PUSH-038 REMINDER는 읽음 없이 홈으로 간다")
    func reminder() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__reminder")) == .navigate(.home(refreshing: false)))
    }

    @Test("TC-PUSH-039 POST_APPROVED는 읽음 후 sourceId 게시물 상세로 간다")
    func postApproved() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__post-approved"))
            == .markReadThenNavigate(notificationId: notification01, destination: .post(postId: post01, opensAIResult: false)))
    }

    @Test("TC-PUSH-040 AI_REVIEW_COMPLETED·FAILED는 읽음 후 게시물 상세 + AI 결과 자동 열기다", arguments: [
        ("payload__ai-review-completed", "33333333-3333-4333-8333-333333333303"),
        ("payload__ai-review-failed", "33333333-3333-4333-8333-333333333304"),
    ])
    func aiReview(name: String, notificationId: String) throws {
        #expect(NotificationRouting.plan(forPush: try payload(name))
            == .markReadThenNavigate(notificationId: uuid(notificationId), destination: .post(postId: post01, opensAIResult: true)))
    }

    @Test("TC-PUSH-041 POST_REJECTED는 읽음 후 notificationId로 알림 상세를 연다")
    func postRejected() throws {
        let id = uuid("33333333-3333-4333-8333-333333333302")
        #expect(NotificationRouting.plan(forPush: try payload("payload__post-rejected"))
            == .markReadThenNavigate(notificationId: id, destination: .notificationDetail(notificationId: id)))
    }

    @Test("TC-PUSH-042 NOTICE는 sourceId(공지 ID)가 아니라 notificationId로 알림 상세를 연다")
    func notice() throws {
        let id = uuid("33333333-3333-4333-8333-333333333305")
        let plan = NotificationRouting.plan(forPush: try payload("payload__notice"))
        #expect(plan == .markReadThenNavigate(notificationId: id, destination: .notificationDetail(notificationId: id)))
    }

    @Test("TC-PUSH-043 NOTICE에 notificationId가 없으면 읽음 없이 알림함으로 간다")
    func noticeWithoutNotificationId() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__missing-notification-id")) == .navigate(.inbox))
    }

    @Test("TC-PUSH-044 알 수 없는 type은 읽음 없이 알림함으로 간다")
    func unknownType() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__unknown-type")) == .navigate(.inbox))
    }

    @Test("TC-PUSH-045 type 누락은 읽음 없이 알림함으로 간다")
    func missingType() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__missing-type")) == .navigate(.inbox))
        #expect(NotificationRouting.plan(forPush: PushPayload()) == .navigate(.inbox))
    }

    @Test("TC-PUSH-046 notificationId·sourceId가 UUID 형식이 아니면 읽음 없이 알림함으로 간다")
    func invalidUUID() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__invalid-uuid")) == .navigate(.inbox))
    }

    @Test("TC-PUSH-047 AI 리뷰인데 sourceType이 POST가 아니면 알림함으로 간다")
    func aiSourceTypeNotPost() throws {
        #expect(NotificationRouting.plan(forPush: try payload("payload__ai-source-type-not-post")) == .navigate(.inbox))
    }

    @Test("TC-PUSH-046 POST_APPROVED에 sourceId가 없거나 notificationId가 없어도 알림함으로 간다", arguments: [
        PushPayload(type: "POST_APPROVED", notificationId: nil, sourceType: "POST", sourceId: post01),
        PushPayload(type: "POST_APPROVED", notificationId: notification01, sourceType: "POST", sourceId: nil),
        PushPayload(type: "POST_REJECTED", notificationId: nil, sourceType: "POST", sourceId: post01),
    ])
    func requiredFieldsMissing(payload: PushPayload) {
        #expect(NotificationRouting.plan(forPush: payload) == .navigate(.inbox))
    }

    @Test("TC-PUSH-051 TC-PUSH-052 같은 payload는 문구·eventId와 무관하게 항상 같은 목적지다(두 번 처리해도 같다)")
    func decisionIgnoresTitleAndEventId() throws {
        let base = try userInfo("payload__post-approved")
        var other = base
        other["eventId"] = "66666666-6666-4666-8666-666666666699"
        other["title"] = "전혀 다른 문구"
        let first = NotificationRouting.plan(forPush: PushPayload(userInfo: base))
        #expect(first != .ignore)
        #expect(NotificationRouting.plan(forPush: PushPayload(userInfo: other)) == first)
        #expect(NotificationRouting.plan(forPush: PushPayload(userInfo: base)) == first)
    }

    // MARK: 알림함 행 탭

    private func item(_ type: NotificationType, sourceType: String? = "POST", sourceId: String? = "22222222-2222-4222-8222-222222222201") -> NotificationItem {
        NotificationItem(
            id: notification01, type: type, sourceType: sourceType, sourceId: sourceId, title: "t", body: "b",
            createdAt: Instant.parse("2026-10-27T01:30:00Z")!
        )
    }

    @Test("TC-NOTI-027 승인 행은 읽음 후 게시물 상세(내 게시물)로 간다")
    func rowApproved() {
        #expect(NotificationRouting.plan(forRow: item(.postApproved))
            == .markReadThenNavigate(notificationId: notification01, destination: .post(postId: post01, opensAIResult: false)))
    }

    @Test("TC-NOTI-028 AI 리뷰 행은 읽음 후 게시물 상세 + AI 결과 자동 열기 플래그다", arguments: [NotificationType.aiReviewCompleted, .aiReviewFailed])
    func rowAI(type: NotificationType) {
        #expect(NotificationRouting.plan(forRow: item(type))
            == .markReadThenNavigate(notificationId: notification01, destination: .post(postId: post01, opensAIResult: true)))
    }

    @Test("TC-NOTI-029 AI 행의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 이동하지 않는다", arguments: [
        ("NOTICE", "22222222-2222-4222-8222-222222222201"), ("POST", "not-a-uuid"), (nil, nil),
    ] as [(String?, String?)])
    func rowBadAISource(sourceType: String?, sourceId: String?) {
        #expect(NotificationRouting.plan(forRow: item(.aiReviewCompleted, sourceType: sourceType, sourceId: sourceId)) == .ignore)
    }

    @Test("TC-NOTI-030 공지 행은 읽음 후 notificationId로 알림 상세를 연다(공지 sourceId가 아니다)")
    func rowNotice() {
        let plan = NotificationRouting.plan(forRow: item(.notice, sourceType: "NOTICE", sourceId: "77777777-7777-4777-8777-777777777701"))
        #expect(plan == .markReadThenNavigate(notificationId: notification01, destination: .notificationDetail(notificationId: notification01)))
    }

    @Test("TC-NOTI-031 반려 행은 읽음 후 알림 상세를 연다")
    func rowRejected() {
        #expect(NotificationRouting.plan(forRow: item(.postRejected))
            == .markReadThenNavigate(notificationId: notification01, destination: .notificationDetail(notificationId: notification01)))
    }

    @Test("TC-NOTI-024 알 수 없는 type 행은 탭해도 이동·읽음 요청이 없다")
    func rowUnknownType() {
        #expect(NotificationRouting.plan(forRow: item(.unknown("FUTURE_TYPE"), sourceType: nil, sourceId: nil)) == .ignore)
    }

    @Test("TC-NOTI-025 TOPIC·REMINDER 행은 읽음 없이 홈으로 간다", arguments: [NotificationType.topic, .reminder])
    func rowTopicReminder(type: NotificationType) {
        let plan = NotificationRouting.plan(forRow: item(type, sourceType: "TOPIC", sourceId: "11111111-1111-4111-8111-111111111127"))
        guard case .navigate(.home) = plan else {
            Issue.record("읽음 없이 홈으로 가야 한다: \(plan)")
            return
        }
    }

    @Test("TC-NOTI-026 sourceType·sourceId가 null인 승인 행은 이동도 읽음 요청도 없다")
    func rowNullSource() {
        #expect(NotificationRouting.plan(forRow: item(.postApproved, sourceType: nil, sourceId: nil)) == .ignore)
    }
}
