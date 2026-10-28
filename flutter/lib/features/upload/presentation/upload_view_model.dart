import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../edit/domain/image_codec.dart';
import '../../edit/domain/photo_edit.dart';
import '../../edit/domain/rgba_image.dart';
import '../../home/domain/home_models.dart';
import '../domain/gallery_saver.dart';
import '../domain/photo_picker.dart';
import '../domain/post_submitter.dart';
import '../domain/upload_preparer.dart';
import '../domain/upload_topic_source.dart';

enum UploadTopicStatus { loading, loaded, failed }

/// 백그라운드 사진 준비(정책 발급 + 인코딩) 상태.
enum PreparationStatus { none, preparing, ready, failed }

class UploadState {
  const UploadState({
    required this.topicDate,
    required this.topicStatus,
    required this.preparation,
    required this.edit,
    required this.title,
    required this.isSubmitting,
    required this.isCameraAvailable,
    this.topicTitle,
    this.photo,
    this.preview,
    this.error,
    this.topicError,
  });

  /// 게이트가 고정한 주제 날짜(REQ-UPL-008).
  final KstDate topicDate;
  final UploadTopicStatus topicStatus;
  final String? topicTitle;

  /// 편집을 마치고 확정된 사진. 편집 중인 후보는 포함하지 않는다.
  final PickedPhoto? photo;

  /// 업로드 화면에 원본 비율로 보여 줄 편집 결과 미리보기.
  final RgbaImage? preview;
  final PhotoEdit edit;
  final PreparationStatus preparation;

  /// 입력 그대로의 제목(strip 전). 10 code point 상한이 적용돼 있다.
  final String title;
  final bool isSubmitting;
  final bool isCameraAvailable;

  /// 준비·제출 실패 문구(`upload.error-message`).
  final String? error;

  /// 주제 로드 실패 문구(`Copy.uploadTopicLoadFailed`)와 "다시 시도".
  final String? topicError;

  /// 사진이 있고 제출 중이 아니면 활성. 준비 중이거나 준비 실패여도 활성이다(REQ-UPL-037).
  bool get canSubmit => photo != null && !isSubmitting;
}

sealed class UploadEvent {
  const UploadEvent();
}

/// 편집기를 연다(사진을 고른 직후 또는 사진 탭 재편집). [initialEdit]는 재편집이면 저장된 값.
final class OpenPhotoEditor extends UploadEvent {
  const OpenPhotoEditor(this.sourceBytes, this.initialEdit);

  final Uint8List sourceBytes;
  final PhotoEdit initialEdit;
}

/// 성공 화면으로 간다(업로드 화면은 백스택에서 제거, REQ-UPL-064).
final class UploadSucceeded extends UploadEvent {
  const UploadSucceeded({
    required this.topicTitle,
    required this.topicDate,
    required this.moderationStatus,
  });

  final String topicTitle;
  final KstDate topicDate;
  final ModerationStatus moderationStatus;
}

/// 로그인 화면으로 간다(401 재인증). 임시 파일과 정책은 이미 지웠다(TC-UPL-078).
final class UploadLoginRequired extends UploadEvent {
  const UploadLoginRequired();
}

/// 업로드 화면 상태(REQ-UPL-009~064).
///
/// - [start]: `screen_view photo_upload`를 한 번 보내고 `GET /topics?date={topicDate}`로 주제를
///   받는다. 실패하면 [UploadState.topicError]와 [onTopicRetry](주제만 다시 받는다).
/// - [onAlbumPressed], [onCameraPressed]: 선택기를 연다. 취소는 상태를 바꾸지 않는다. 가장 최근 선택의
///   결과만 반영하고 이전 선택의 늦은 결과는 버린다. 빈 데이터·읽을 수 없는 사진은 편집기를 열지 않고
///   `Copy.uploadErrorPrepare`를 [UploadState.error]에 둔다. 정상이면 [OpenPhotoEditor]를 낸다.
///   카메라 촬영본은 기기 앨범에 한 번만 저장한다(파일명 [CaptureFileName]; 앨범에서 고른 사진은
///   저장하지 않는다). 저장이 실패하면 `Copy.uploadCameraSaveFailed` 토스트만 띄우고 선택은 유지하며,
///   화면을 닫은 뒤 늦게 실패해도 [ToastSink]로 알린다.
/// - [onEditCompleted]: 처음 고른 사진이면 확정한다. 이전과 다른 사진·편집값이면 이전 준비를 취소하고
///   임시 파일을 지운 뒤 새로 준비하고, 같은 사진·같은 편집값이면 다시 준비하지 않는다.
/// - [onEditCancelled]: 처음 고른 사진이면 선택을 취소하고(사진 없음), 재편집이면 기존 선택과
///   준비 결과를 유지한다.
/// - [onPhotoTapped]: 저장된 편집값으로 [OpenPhotoEditor]를 다시 연다.
/// - [onSubmitPressed]: 제출 중이면 무시(연타해도 PUT·POST 1회). 준비 중이면 끝날 때까지 기다렸다가
///   이어 가고, 준비 실패·없음이면 정책 발급부터 다시 준비한다. 제출은 [PostSubmitter]가 하며
///   성공이면 [UploadSucceeded], 실패면 문구를 [UploadState.error]에 두고 사진·제목을 유지한다.
///   제출에는 진입 때 받은 `topicId`·`topicDate`를 쓰고 클라이언트 시계로 다시 계산하지 않는다.
///   [UploadFailure.discardPrepared]이면 준비물을 버리고 다음 제출이 처음부터 준비한다.
///   loginRequired는 임시 파일·정책을 지우고 [UploadLoginRequired]를 낸다(사진·제목 상태는 유지).
/// - [dispose]: 진행 중 작업을 취소하고 소유한 임시 파일을 지운다. 이후 성공 이벤트는 내지 않는다.
class UploadViewModel extends ChangeNotifier {
  UploadViewModel({
    required this.topicDate,
    required this.topics,
    required this.picker,
    required this.gallery,
    required this.decoder,
    required this.preparer,
    required this.submitter,
    required this.toast,
    required this.analytics,
  });

  final KstDate topicDate;
  final UploadTopicSource topics;
  final PhotoPicker picker;
  final GallerySaver gallery;
  final ImageDecoder decoder;
  final UploadPreparer preparer;
  final PostSubmitter submitter;

  /// 앱 전역 토스트. 화면이 닫힌 뒤에도 쓴다.
  final ToastSink toast;
  final AnalyticsTracker analytics;

  UploadState get state => throw UnimplementedError();
  Stream<UploadEvent> get events => throw UnimplementedError();

  Future<void> start() => throw UnimplementedError();
  Future<void> onTopicRetry() => throw UnimplementedError();
  Future<void> onAlbumPressed() => throw UnimplementedError();
  Future<void> onCameraPressed() => throw UnimplementedError();
  void onPhotoTapped() => throw UnimplementedError();
  Future<void> onEditCompleted(PhotoEdit edit, RgbaImage rendered) =>
      throw UnimplementedError();
  void onEditCancelled() => throw UnimplementedError();

  /// 제목 입력. 앞뒤 공백 제거 후 10 code point 상한을 넘으면 입력을 받지 않고 붙여넣기는 10
  /// code point까지만 받는다(D-01).
  void onTitleChanged(String next) => throw UnimplementedError();

  Future<void> onSubmitPressed() => throw UnimplementedError();
}
