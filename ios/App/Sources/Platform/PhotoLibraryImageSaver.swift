import Foundation
import Photos
import ChalkakFeatures

/// 사진 보관함에 이미지를 추가한다("사진 추가 전용" 권한만 쓴다, REQ-REC-038).
/// 촬영본 JPEG(`CapturedPhotoSaving`)와 달력 PNG(`CalendarImageSaving`)가 같이 쓴다.
struct PhotoLibraryImageSaver: CapturedPhotoSaving, CalendarImageSaving {
    private enum SaveError: Error {
        case denied
    }

    func save(_ jpeg: Data, fileName: String) async throws {
        try await add(jpeg, fileName: fileName)
    }

    func savePNG(_ data: Data, fileName: String) async throws {
        do {
            try await add(data, fileName: fileName)
        } catch SaveError.denied {
            throw CalendarImageSaveError.permissionDenied
        }
    }

    private func add(_ data: Data, fileName: String) async throws {
        guard await PhotoLibraryAccess.requestAddAccess() else { throw SaveError.denied }
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = fileName
            request.addResource(with: .photo, data: data, options: options)
        }
    }
}

enum PhotoLibraryAccess {
    /// 사진 추가 권한이 있는가. 아직 정하지 않았으면 시스템 요청을 띄운다.
    static func requestAddAccess() async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return status == .authorized || status == .limited
    }
}
