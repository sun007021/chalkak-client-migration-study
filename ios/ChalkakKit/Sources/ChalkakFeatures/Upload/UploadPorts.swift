import Foundation
import ChalkakCore

// 업로드 흐름이 플랫폼에 기대는 부분. ChalkakKit은 Foundation만 쓰므로 이미지 디코딩·인코딩, 앨범 저장은
// App 타깃이 이 프로토콜을 구현해 꽂는다(ARCHITECTURE.md §2).

/// 사진 선택기·카메라가 준 원본을 App이 보관하는 핸들. Kit은 EXIF 방향을 반영한(화면에 보이는) 크기만 안다.
public struct LoadedPhoto: Sendable, Hashable {
    public let id: UUID
    public let size: PixelSize
    public init(id: UUID, size: PixelSize) {
        self.id = id
        self.size = size
    }
}

public enum PhotoLoadError: Error, Sendable, Equatable {
    /// 빈 데이터·0바이트·손상으로 읽을 수 없다(REQ-UPL-018).
    case unreadable
}

public protocol PhotoLoading: Sendable {
    /// 바이트를 디코딩할 수 있는지 확인하고 원본을 보관한다. 실패는 `PhotoLoadError.unreadable`. 취소에 협조한다.
    func load(_ data: Data) async throws -> LoadedPhoto
    /// 보관한 원본을 버린다(사진 교체·화면 이탈).
    func release(_ photo: LoadedPhoto) async
}

/// 업로드용으로 인코딩해 임시 파일에 둔 WebP.
public struct PreparedImage: Sendable, Hashable {
    public let id: UUID
    public let byteCount: Int64
    public init(id: UUID, byteCount: Int64) {
        self.id = id
        self.byteCount = byteCount
    }
}

public enum PhotoPrepareError: Error, Sendable, Equatable {
    /// `WebPSizeLadder`가 `sizeLimitExceeded`로 실패했다.
    case sizeLimitExceeded
    /// 플랫폼 디코더가 지원하지 않는 형식.
    case unsupported
}

public protocol PhotoPreparing: Sendable {
    /// 원본에 편집값을 적용(`edit.isIdentity`면 다시 그리지 않음)하고 `maxBytes` 이하 WebP로 인코딩해 임시 파일에 쓴다.
    /// 취소되면 만든 파일을 지우고 `CancellationError`를 던진다. 성공한 결과의 삭제는 호출 측이 `discard`로 한다.
    func prepare(_ photo: LoadedPhoto, edit: PhotoEdit, maxBytes: Int64) async throws -> PreparedImage
    func contents(of image: PreparedImage) async throws -> Data
    func discard(_ image: PreparedImage) async
}

public protocol CapturedPhotoSaving: Sendable {
    /// 촬영본(JPEG)을 기기 앨범에 저장한다. 권한 거부·실패는 오류.
    func save(_ jpeg: Data, fileName: String) async throws
}

/// 업로드 화면을 나간 뒤에도 알려야 하는 토스트(늦게 끝난 촬영본 저장 실패, D-20).
@MainActor
public protocol GlobalNoticePosting: AnyObject {
    func postNotice(_ message: String)
}

/// 사진을 얻은 경로.
public enum PhotoSource: Sendable, Equatable {
    /// 시스템 사진 선택기. 앨범에 다시 저장하지 않는다.
    case album
    /// 카메라 촬영본. 앨범에 한 번만 저장한다.
    case camera
}

/// 촬영본 파일 이름 규칙.
public enum CapturedPhotoName {
    /// `chalkak-photo-<식별 문자열>.jpg` (REQ-UPL-014 JPEG). 같은 순간·다른 id면 다른 이름이어야 한다.
    public static func make(at date: Date, id: UUID) -> String {
        "chalkak-photo-\(Int(date.timeIntervalSince1970))-\(id.uuidString.lowercased()).jpg"
    }
}
