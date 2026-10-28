import Foundation

/// 푸시 `data` 값 하나. 문자열이 아닌 값(숫자·객체·배열)은 `.other`이고 해당 필드는 누락으로 본다(TC-PUSH-049).
public enum PushValue: Sendable, Equatable {
    case string(String)
    case other
}

/// 플랫폼 어댑터가 만드는 공통 푸시 payload(`data`만 읽는다. `eventId`와 알림 제목·본문은 분기에 쓰지 않는다, REQ-PUSH-021).
/// `notificationId`·`sourceId`는 UUID 형식이 아니면 nil(대문자도 유효, 요청에는 소문자 정규형으로 나간다).
public struct PushPayload: Sendable, Equatable {
    /// 서버 `type` 원문. 없으면 nil.
    public var type: String?
    public var notificationId: UUID?
    public var sourceType: String?
    public var sourceId: UUID?

    public init(type: String? = nil, notificationId: UUID? = nil, sourceType: String? = nil, sourceId: UUID? = nil) {
        self.type = type
        self.notificationId = notificationId
        self.sourceType = sourceType
        self.sourceId = sourceId
    }

    /// `data` 맵(키 `type`, `notificationId`, `sourceType`, `sourceId`)에서 만든다. 문자열이 아닌 값은 누락으로 본다.
    public init(fields: [String: PushValue]) {
        func string(_ key: String) -> String? {
            if case let .string(text) = fields[key] { return text }
            return nil
        }
        self.init(
            type: string("type"),
            notificationId: string("notificationId").flatMap { UUID(uuidString: $0) },
            sourceType: string("sourceType"),
            sourceId: string("sourceId").flatMap { UUID(uuidString: $0) }
        )
    }

    /// 값이 모두 문자열인 맵(Android intent extras, Flutter/RN 플러그인 `data`).
    public init(strings: [String: String]) {
        self.init(fields: strings.mapValues { .string($0) })
    }

    /// iOS APNs `userInfo`(최상위 평탄 키. `aps`·`gcm.*` 같은 다른 키는 무시, 중첩 `notification/data`는 가정하지 않는다).
    public init(userInfo: [AnyHashable: Any]) {
        var fields: [String: PushValue] = [:]
        for key in ["type", "notificationId", "sourceType", "sourceId"] {
            guard let value = userInfo[AnyHashable(key)] else { continue }
            fields[key] = (value as? String).map(PushValue.string) ?? .other
        }
        self.init(fields: fields)
    }

    /// 프로세스 복원용 저장 표현(`init(strings:)`로 되돌리면 같은 payload). 값이 있는 필드만 담는다.
    public var storedFields: [String: String] {
        var fields: [String: String] = [:]
        if let type { fields["type"] = type }
        if let notificationId { fields["notificationId"] = notificationId.uuidString }
        if let sourceType { fields["sourceType"] = sourceType }
        if let sourceId { fields["sourceId"] = sourceId.uuidString }
        return fields
    }
}

public enum NotificationDestination: Sendable, Equatable {
    /// 홈. `refreshing`이면 맨 위로 스크롤하고 새로고침한다(TOPIC).
    case home(refreshing: Bool)
    /// 게시물 상세(내 게시물). `opensAIResult`면 AI 피드백 시트를 최신 GET 기준 한 번 자동으로 연다(AIR가 소비).
    case post(postId: UUID, opensAIResult: Bool)
    case notificationDetail(notificationId: UUID)
    case inbox
}

public enum NotificationTapPlan: Sendable, Equatable {
    /// 아무 일도 하지 않는다(알림함 행: 알 수 없는 type·필수 필드 누락).
    case ignore
    /// 읽음 요청 없이 이동.
    case navigate(NotificationDestination)
    /// `PATCH /notifications/{notificationId}/read` 후 결과에 따라 이동.
    case markReadThenNavigate(notificationId: UUID, destination: NotificationDestination)
}

/// 알림함 행 탭과 푸시 탭이 함께 쓰는 목적지 표(D-11). 순수 함수.
public enum NotificationRouting {
    /// 알림함 행 탭. 알 수 없는 type, 필요한 필드(`sourceId` UUID, AI 리뷰는 `sourceType == "POST"`) 누락은 `.ignore`.
    /// TOPIC·REMINDER는 읽음 없이 홈.
    public static func plan(forRow item: NotificationItem) -> NotificationTapPlan {
        let sourceId = item.sourceId.flatMap { UUID(uuidString: $0) }
        return plan(type: item.type, notificationId: item.id, sourceType: item.sourceType, sourceId: sourceId) ?? .ignore
    }

    /// 푸시 탭. 알 수 없는 type·필드 누락·UUID 아님·AI 리뷰의 sourceType 불일치는 읽음 없이 `.navigate(.inbox)`. `.ignore`는 돌려주지 않는다.
    public static func plan(forPush payload: PushPayload) -> NotificationTapPlan {
        guard let type = payload.type,
              let plan = plan(
                  type: NotificationType(rawValue: type), notificationId: payload.notificationId,
                  sourceType: payload.sourceType, sourceId: payload.sourceId
              )
        else { return .navigate(.inbox) }
        return plan
    }

    /// D-11 표. 행과 푸시가 같은 표를 쓴다. 표로 정할 수 없으면(알 수 없는 type, 필수 필드 없음) nil.
    /// 명세 확인 대상: 알림함 TOPIC 행의 `refreshing`(맨 위 + 새로고침)은 푸시 표와 같게 true로 한다.
    private static func plan(type: NotificationType, notificationId: UUID?, sourceType: String?, sourceId: UUID?) -> NotificationTapPlan? {
        switch type {
        case .topic:
            return .navigate(.home(refreshing: true))
        case .reminder:
            return .navigate(.home(refreshing: false))
        case .postApproved:
            guard let notificationId, let sourceId else { return nil }
            return .markReadThenNavigate(notificationId: notificationId, destination: .post(postId: sourceId, opensAIResult: false))
        case .aiReviewCompleted, .aiReviewFailed:
            guard let notificationId, let sourceId, sourceType == "POST" else { return nil }
            return .markReadThenNavigate(notificationId: notificationId, destination: .post(postId: sourceId, opensAIResult: true))
        case .postRejected, .notice:
            // 공지의 sourceId는 공지 ID라 쓰지 않는다. 알림 id로 상세를 연다.
            guard let notificationId else { return nil }
            return .markReadThenNavigate(notificationId: notificationId, destination: .notificationDetail(notificationId: notificationId))
        case .unknown:
            return nil
        }
    }
}
