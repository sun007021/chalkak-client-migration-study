import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("UPL·EDIT 문구와 shared/copy 대조", .timeLimit(.minutes(1)))
struct UploadCopyTests {
    @Test("TC-UPL-089 업로드 문구는 shared/copy/ko.json과 같다", arguments: [
        ("upload.gate.login-required", UploadCopy.loginRequired),
        ("upload.gate.already-posted", UploadCopy.alreadyPosted),
        ("upload.gate.no-open-topic", UploadCopy.noOpenTopic),
        ("upload.gate.banned", UploadCopy.banned),
        ("upload.gate.check-failed", UploadCopy.checkFailed),
        ("upload.topic.load-failed", UploadCopy.topicLoadFailed),
        ("upload.topic.retry", UploadCopy.topicRetry),
        ("upload.title", UploadCopy.title),
        ("upload.submit", UploadCopy.submit),
        ("upload.submitting", UploadCopy.submitting),
        ("upload.subheading", UploadCopy.subheading),
        ("upload.permission.save", UploadCopy.permissionTitle),
        ("upload.permission.settings", UploadCopy.permissionSettings),
        ("upload.no-save-capture", UploadCopy.permissionShootWithoutSaving),
        ("upload.caption.placeholder", UploadCopy.captionPlaceholder),
        ("upload.camera.save-failed", UploadCopy.cameraSaveFailed),
        ("upload.error.network", UploadCopy.errorNetwork),
        ("upload.error.prepare", UploadCopy.errorPrepare),
        ("upload.error.upload", UploadCopy.errorUpload),
        ("upload.error.create", UploadCopy.errorCreate),
        ("upload.error.duplicate", UploadCopy.errorDuplicate),
        ("upload.error.topic-changed", UploadCopy.errorTopicChanged),
        ("upload.success.pending", UploadCopy.successPending),
        ("upload.success.validating", UploadCopy.successValidating),
        ("upload.success.confirm", UploadCopy.successConfirm),
    ])
    func uploadCopy(key: String, actual: String) throws {
        let expected = try SharedCopy.require(key)
        #expect(!expected.isEmpty)
        #expect(actual == expected)
    }

    @Test("TC-UPL-089 주제 안내 문구는 ‘주제’ 자리에 제목을 넣는다")
    func heading() throws {
        let template = try SharedCopy.require("upload.heading")
        #expect(UploadCopy.heading(topicTitle: "가을 하늘") == template.replacingOccurrences(of: "{주제}", with: "가을 하늘"))
    }

    @Test("TC-EDIT-002 편집기 문구는 shared/copy/ko.json과 같다", arguments: [
        ("edit.top.cancel", EditCopy.cancel), ("edit.top.done", EditCopy.done),
        ("edit.tab.crop", EditCopy.tabCrop), ("edit.tab.adjust", EditCopy.tabAdjust), ("edit.tab.filter", EditCopy.tabFilter),
        ("edit.crop.rotate", EditCopy.rotate), ("edit.crop.reset", EditCopy.cropReset), ("edit.adjust.reset", EditCopy.adjustReset),
        ("edit.error.render", EditCopy.renderError),
    ])
    func editCopy(key: String, actual: String) throws {
        let expected = try SharedCopy.require(key)
        #expect(!expected.isEmpty)
        #expect(actual == expected)
    }

    @Test("TC-EDIT-013 비율 라벨은 9종 모두 shared/copy의 edit.ratio.*와 같다", arguments: CropAspect.allCases)
    func ratioLabels(aspect: CropAspect) throws {
        let expected = try SharedCopy.require(aspect.copyKey)
        #expect(!expected.isEmpty)
        #expect(EditCopy.label(for: aspect) == expected)
    }

    @Test("TC-EDIT-039 필터 라벨은 6종 모두 shared/copy의 edit.filter.*와 같다", arguments: [
        (PhotoFilter.original, "edit.filter.original"), (.mono, "edit.filter.mono"), (.warm, "edit.filter.warm"),
        (.cool, "edit.filter.cool"), (.vintage, "edit.filter.vintage"), (.vivid, "edit.filter.vivid"),
    ])
    func filterLabels(filter: PhotoFilter, key: String) throws {
        let expected = try SharedCopy.require(key)
        #expect(!expected.isEmpty)
        #expect(EditCopy.label(for: filter) == expected)
    }

    @Test("TC-EDIT-023 조정 항목 라벨은 자동 + 7종 모두 shared/copy의 edit.adjust.*와 같다", arguments: [
        (AdjustmentItem.auto, "edit.adjust.auto"), (.value(.exposure), "edit.adjust.exposure"), (.value(.contrast), "edit.adjust.contrast"),
        (.value(.highlights), "edit.adjust.highlights"), (.value(.shadows), "edit.adjust.shadows"),
        (.value(.blackPoint), "edit.adjust.black-point"), (.value(.saturation), "edit.adjust.saturation"), (.value(.warmth), "edit.adjust.warmth"),
    ])
    func adjustLabels(item: AdjustmentItem, key: String) throws {
        let expected = try SharedCopy.require(key)
        #expect(!expected.isEmpty)
        #expect(EditCopy.label(for: item) == expected)
    }

    @Test("TC-UPL-084 성공 문구의 조사: 받침이 있으면 을, 없으면 를", arguments: [
        ("하늘", "을"), ("꽃", "을"), ("우산", "을"), ("바다", "를"), ("나무", "를"),
    ])
    func objectParticle(topic: String, particle: String) {
        #expect(UploadCopy.successTitle(topicTitle: topic) == "‘\(topic)’\(particle) 기록했어요.")
    }

    @Test("TC-UPL-084 끝 공백은 조사 판단에서 무시하고, 빈 주제·한글이 아닌 끝 글자는 를이다")
    func objectParticleEdgeCases() {
        #expect(UploadCopy.successTitle(topicTitle: "겨울 ").hasSuffix("’을 기록했어요."))
        #expect(UploadCopy.successTitle(topicTitle: "").hasSuffix("’를 기록했어요."))
        #expect(UploadCopy.successTitle(topicTitle: "Sky").hasSuffix("’를 기록했어요."))
        #expect(UploadCopy.successTitle(topicTitle: "2026").hasSuffix("’를 기록했어요."))
    }

    @Test("TC-UPL-016 촬영본 파일 이름은 chalkak-photo-*.jpg 규칙이고 id가 다르면 이름도 다르다")
    func capturedPhotoName() {
        let date = Date(timeIntervalSince1970: 1_800_000_000)
        let a = CapturedPhotoName.make(at: date, id: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!)
        let b = CapturedPhotoName.make(at: date, id: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!)
        #expect(a.hasPrefix("chalkak-photo-") && a.hasSuffix(".jpg"))
        #expect(a != b)
    }
}
