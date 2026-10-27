import Foundation
import ChalkakCore

/// 같은 그리기·미리보기 화면을 쓰는 두 흐름.
public enum SignatureFlowKind: Sendable, Equatable {
    /// 가입 2~3단계(`onboarding_signature`, `onboarding_signature_preview`).
    case onboarding
    /// 설정의 사인 변경(`change_signature`, `change_signature_preview`).
    case change
}

/// 그리기 화면에서 확정한, 1 MiB 이하로 확인된 PNG.
public struct SignatureDraft: Sendable, Equatable {
    public let pngData: Data
    public init(pngData: Data) { self.pngData = pngData }
}

/// 미리보기 화면(가입·변경 공통)의 상태.
public enum SignaturePreviewState: Sendable, Equatable {
    /// 확정 버튼 활성.
    case ready
    /// 요청 중(PENDING 대기 포함). 진행 표시, 확정 버튼 비활성.
    case submitting
    /// 오류 알림을 보이는 중. 미리보기에 머물고 확정 버튼은 다시 눌린다(그린 사인 유지). 다음 시도는 항상 업로드 발급부터.
    case failed(Notice)
    case finished(SignaturePreviewOutcome)
}

public enum SignaturePreviewOutcome: Sendable, Equatable {
    /// "다시 그리기": 서버 호출 없음.
    case redraw
    /// 사인이 거절돼(`400 BUSINESS_ERROR`) 오류 문구와 함께 그리기 화면으로 돌아간다.
    case returnToDrawing(Notice)
    /// 가입 컨텍스트를 폐기하고 로그인 화면으로(401·컨텍스트 소실): `sign.error.expired`.
    case loginRequired(Notice)
    /// 가입(또는 기존 계정 로그인) 완료: 푸시 등록을 시작했고, 가입 화면 전체를 백스택에서 빼고 메인(회원)으로 간다.
    case signedUp
    /// 변경 성공: 설정으로 돌아가(그리기·미리보기 제거) 토스트 `sign.change.done`. 사인 카드는 설정이 보일 때 `GET`으로 다시 불러온다.
    case changed(Notice)
}
