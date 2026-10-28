import Foundation
import ChalkakCore

/// 업로드·성공 화면 문구. 값은 `shared/copy/ko.json`의 `upload.*`와 같아야 한다(UploadCopyTests가 대조).
public enum UploadCopy {
    public static let loginRequired = "게시물을 추가하려면 로그인이 필요해요"      // upload.gate.login-required
    public static let alreadyPosted = "이미 이 주제에 게시물을 작성했어요."      // upload.gate.already-posted
    public static let noOpenTopic = "지금 참여할 수 있는 주제가 없어요."        // upload.gate.no-open-topic
    public static let banned = "이용이 정지되어 게시물을 작성할 수 없어요."             // upload.gate.banned
    public static let checkFailed = "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."        // upload.gate.check-failed
    public static let topicLoadFailed = "주제를 불러오지 못했어요. 다시 시도해 주세요."    // upload.topic.load-failed
    public static let topicRetry = "다시 시도"         // upload.topic.retry
    public static let title = "전시하기"              // upload.title
    public static let submit = "전시하기"             // upload.submit
    public static let submitting = "전시 중..."         // upload.submitting
    public static let subheading = "앨범에서 고르거나 지금 찍어요"            // upload.subheading
    public static let permissionTitle = "촬영 사진 저장 권한"          // upload.permission.save
    public static let permissionSettings = "설정 열기"             // upload.permission.settings
    public static let permissionShootWithoutSaving = "저장 없이 촬영"  // upload.no-save-capture
    public static let captionPlaceholder = "작품 제목은 선택이에요." // upload.caption.placeholder
    public static let cameraSaveFailed = "사진을 갤러리에 저장하지 못했어요."   // upload.camera.save-failed
    public static let errorNetwork = "네트워크 연결을 확인해 주세요."       // upload.error.network
    public static let errorPrepare = "사진을 준비하지 못했어요. 다시 시도해 주세요."       // upload.error.prepare
    public static let errorUpload = "사진을 업로드하지 못했어요. 다시 시도해 주세요."        // upload.error.upload
    public static let errorCreate = "전시를 완료하지 못했어요. 다시 시도해 주세요."        // upload.error.create
    public static let errorDuplicate = "이미 이 주제에 전시한 사진이 있어요."     // upload.error.duplicate
    public static let errorTopicChanged = "주제가 변경되어 전시할 수 없어요."  // upload.error.topic-changed
    public static let successPending = "검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"     // upload.success.pending
    public static let successValidating = "사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"  // upload.success.validating
    public static let successConfirm = "확인했어요."     // upload.success.confirm

    /// "주제 ‘{주제}’에 맞는 한 장" (upload.heading)
    public static func heading(topicTitle: String) -> String { "주제 ‘\(topicTitle)’에 맞는 한 장" }

    /// "‘{주제}’을/를 기록했어요." 받침이 있는 한글 음절로 끝나면 을, 받침이 없거나 한글이 아니거나 비어 있으면 를. 끝 공백은 무시한다.
    public static func successTitle(topicTitle: String) -> String {
        "‘\(topicTitle)’\(hasFinalConsonant(topicTitle) ? "을" : "를") 기록했어요."
    }

    /// 마지막(끝 공백 제외) 글자가 받침 있는 한글 음절이면 true.
    private static func hasFinalConsonant(_ text: String) -> Bool {
        guard let last = text.unicodeScalars.last(where: { !CharacterSet.whitespacesAndNewlines.contains($0) }),
              (0xAC00...0xD7A3).contains(last.value) else { return false }
        return (last.value - 0xAC00) % 28 != 0
    }
}

/// 편집기 문구. 값은 `shared/copy/ko.json`의 `edit.*`와 같아야 한다.
public enum EditCopy {
    public static let cancel = "취소"        // edit.top.cancel
    public static let done = "완료"          // edit.top.done
    public static let tabCrop = "자르기"       // edit.tab.crop
    public static let tabAdjust = "조정"     // edit.tab.adjust
    public static let tabFilter = "필터"     // edit.tab.filter
    public static let rotate = "90도 회전"        // edit.crop.rotate
    public static let cropReset = "초기화"     // edit.crop.reset
    public static let adjustReset = "초기화"   // edit.adjust.reset
    public static let renderError = "사진을 편집하지 못했어요. 다시 시도해 주세요."   // edit.error.render

    public static func label(for aspect: CropAspect) -> String {
        switch aspect {
        case .original: "원본"
        case .free: "자유"
        case .square: "1:1"
        case .portrait4x5: "4:5"
        case .landscape5x4: "5:4"
        case .portrait3x4: "3:4"
        case .landscape4x3: "4:3"
        case .portrait9x16: "9:16"
        case .landscape16x9: "16:9"
        }
    }

    public static func label(for filter: PhotoFilter) -> String {
        switch filter {
        case .original: "원본"
        case .mono: "흑백"
        case .warm: "따뜻하게"
        case .cool: "차갑게"
        case .vintage: "빈티지"
        case .vivid: "선명하게"
        }
    }

    public static func label(for item: AdjustmentItem) -> String {
        switch item {
        case .auto: "자동"
        case .value(.exposure): "노출"
        case .value(.contrast): "대비"
        case .value(.highlights): "하이라이트"
        case .value(.shadows): "그림자"
        case .value(.blackPoint): "블랙 포인트"
        case .value(.saturation): "채도"
        case .value(.warmth): "따뜻함"
        }
    }
}
