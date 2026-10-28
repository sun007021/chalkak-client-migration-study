import Foundation

/// 알림함·푸시 문구. 값은 `shared/copy/ko.json`의 `noti.*`·`push.*`와 같아야 한다.
public enum NotificationCopy {
    public static let inboxTitle = "알림"
    public static let loading = "알림을 불러오는 중이에요"
    public static let emptyTitle = "아직 알림이 없어요"
    public static let emptyBody = "승인이나 반려 소식이 생기면 여기에 모아둘게요"
    public static let inboxError = "알림을 불러오지 못했어요"
    public static let retry = "다시 시도"
    public static let refreshError = "알림을 새로고침하지 못했어요. 다시 시도해 주세요."
    public static let moreError = "다음 알림을 불러오지 못했어요. 다시 시도해 주세요."
    public static let network = "네트워크 연결을 확인해 주세요."
    public static let readErrorNetwork = "읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요."
    public static let gone = "더 이상 확인할 수 없는 알림이에요."
    public static let detailTitle = "알림 상세"
    public static let detailReason = "반려 사유"
    public static let detailToInbox = "알림함으로"
    public static let detailError = "알림을 불러오지 못했어요"
    public static let permissionError = "알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요."
    public static let pushDefaultBody = "새 알림이 있어요. 알림함에서 확인해 주세요."
}
