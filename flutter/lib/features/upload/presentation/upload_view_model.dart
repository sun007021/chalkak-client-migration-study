import 'dart:async';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/text/code_points.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../edit/domain/image_codec.dart';
import '../../edit/domain/photo_edit.dart';
import '../../edit/domain/rgba_image.dart';
import '../../home/domain/home_models.dart';
import '../domain/gallery_saver.dart';
import '../domain/photo_picker.dart';
import '../domain/post_submitter.dart';
import '../domain/upload_models.dart';
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

  UploadState copyWith({
    UploadTopicStatus? topicStatus,
    String? topicTitle,
    PickedPhoto? photo,
    RgbaImage? preview,
    PhotoEdit? edit,
    PreparationStatus? preparation,
    String? title,
    bool? isSubmitting,
    String? error,
    String? topicError,
    bool clearPhoto = false,
    bool clearError = false,
    bool clearTopicError = false,
  }) => UploadState(
    topicDate: topicDate,
    topicStatus: topicStatus ?? this.topicStatus,
    topicTitle: topicTitle ?? this.topicTitle,
    photo: clearPhoto ? null : (photo ?? this.photo),
    preview: clearPhoto ? null : (preview ?? this.preview),
    edit: edit ?? this.edit,
    preparation: preparation ?? this.preparation,
    title: title ?? this.title,
    isSubmitting: isSubmitting ?? this.isSubmitting,
    isCameraAvailable: isCameraAvailable,
    error: clearError ? null : (error ?? this.error),
    topicError: clearTopicError ? null : (topicError ?? this.topicError),
  );
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
    this.preview,
  });

  final String topicTitle;
  final KstDate topicDate;
  final ModerationStatus moderationStatus;

  /// 성공 화면 카드에 보여 줄 전시한 사진(편집 결과 미리보기).
  final RgbaImage? preview;
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
  }) : _state = UploadState(
         topicDate: topicDate,
         topicStatus: UploadTopicStatus.loading,
         preparation: PreparationStatus.none,
         edit: PhotoEdit.identity,
         title: '',
         isSubmitting: false,
         isCameraAvailable: picker.isCameraAvailable,
       );

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

  final StreamController<UploadEvent> _events =
      StreamController<UploadEvent>.broadcast(sync: true);
  UploadState _state;
  bool _disposed = false;
  bool _started = false;

  /// 진입 때 받은 주제. 제출은 이 값만 쓰고 시계로 다시 계산하지 않는다.
  Topic? _topic;
  Future<void>? _topicLoad;
  final CancelToken _topicToken = CancelToken();

  int _pickSeq = 0;

  /// 편집기를 열어 둔 새로 고른 사진(아직 확정되지 않음).
  PickedPhoto? _candidate;

  /// 확정된 사진을 다시 편집하는 중인가.
  bool _reediting = false;

  PreparedUpload? _prepared;
  Future<void>? _preparing;
  CancelToken? _prepareToken;
  int _prepareGeneration = 0;

  CancelToken? _submitToken;
  bool _completed = false;

  UploadState get state => _state;
  Stream<UploadEvent> get events => _events.stream;

  void _emit(UploadState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  void _send(UploadEvent event) {
    if (!_disposed) _events.add(event);
  }

  // ------------------------------------------------------------------ 주제

  Future<void> start() {
    if (!_started) {
      _started = true;
      analytics.logEvent(AnalyticsEvent.screenView(ScreenNames.photoUpload));
    }
    return _loadTopic();
  }

  Future<void> onTopicRetry() {
    if (_state.topicStatus == UploadTopicStatus.loading) return _loadTopic();
    _emit(
      _state.copyWith(
        topicStatus: UploadTopicStatus.loading,
        clearTopicError: true,
      ),
    );
    return _loadTopic();
  }

  /// 주제를 받아 둔다. 이미 받았으면 다시 받지 않고, 받는 중이면 그 결과를 기다린다.
  Future<void> _loadTopic() {
    if (_topic != null) return Future.value();
    return _topicLoad ??= _fetchTopic().whenComplete(() => _topicLoad = null);
  }

  Future<void> _fetchTopic() async {
    try {
      final topic = await topics.topicOn(topicDate, cancelToken: _topicToken);
      if (_disposed) return;
      _topic = topic;
      _emit(
        _state.copyWith(
          topicStatus: UploadTopicStatus.loaded,
          topicTitle: topic.title,
          clearTopicError: true,
        ),
      );
    } on ApiError catch (error) {
      if (_disposed || error.isCancelled) return;
      if (error.status == 401) {
        _send(const UploadLoginRequired());
        _emit(_state.copyWith(topicStatus: UploadTopicStatus.failed));
        return;
      }
      _emit(
        _state.copyWith(
          topicStatus: UploadTopicStatus.failed,
          topicError: error.isNetwork
              ? Copy.uploadErrorNetwork
              : Copy.uploadTopicLoadFailed,
        ),
      );
    } on Object {
      if (_disposed) return;
      _emit(
        _state.copyWith(
          topicStatus: UploadTopicStatus.failed,
          topicError: Copy.uploadTopicLoadFailed,
        ),
      );
    }
  }

  // ------------------------------------------------------------------ 사진 선택

  Future<void> onAlbumPressed() => _pick(picker.pickFromAlbum);

  Future<void> onCameraPressed() => _pick(picker.capture);

  Future<void> _pick(Future<PickResult> Function() open) async {
    if (_state.isSubmitting || _completed) return;
    // 가장 최근 선택의 결과만 반영한다.
    final seq = ++_pickSeq;
    final PickResult result;
    try {
      result = await open();
    } on Object {
      if (_disposed || seq != _pickSeq) return;
      _emit(_state.copyWith(error: Copy.uploadErrorPrepare));
      return;
    }
    if (_disposed || seq != _pickSeq) return;
    switch (result) {
      case PhotoPickCancelled():
        return;
      case PhotoPicked(:final photo):
        await _onPicked(photo, seq);
    }
  }

  Future<void> _onPicked(PickedPhoto photo, int seq) async {
    // 빈 데이터·손상된 사진은 편집기를 열지 않는다(REQ-UPL-018).
    if (photo.bytes.isEmpty) {
      _emit(_state.copyWith(error: Copy.uploadErrorPrepare));
      return;
    }
    try {
      await decoder.readBounds(photo.bytes);
    } on Object {
      if (_disposed || seq != _pickSeq) return;
      _emit(_state.copyWith(error: Copy.uploadErrorPrepare));
      return;
    }
    if (_disposed || seq != _pickSeq) return;
    if (photo.origin == PhotoOrigin.camera) unawaited(_saveCapture(photo));
    _candidate = photo;
    _reediting = false;
    _emit(_state.copyWith(clearError: true));
    _send(OpenPhotoEditor(photo.bytes, PhotoEdit.identity));
  }

  /// 촬영본을 앨범에 한 번만 저장한다. 실패해도 선택은 유지하고 토스트로만 알린다.
  /// 화면이 닫힌 뒤 늦게 실패해도 전역 [toast]로 알린다.
  Future<void> _saveCapture(PickedPhoto photo) async {
    try {
      await gallery.saveJpeg(
        photo.bytes,
        fileName: CaptureFileName.next(clock.now()),
      );
    } on Object {
      toast.show(Copy.uploadCameraSaveFailed);
    }
  }

  void onPhotoTapped() {
    final photo = _state.photo;
    if (photo == null || _state.isSubmitting || _completed) return;
    _candidate = null;
    _reediting = true;
    _send(OpenPhotoEditor(photo.bytes, _state.edit));
  }

  // ------------------------------------------------------------------ 편집 결과

  Future<void> onEditCompleted(PhotoEdit edit, RgbaImage rendered) async {
    final candidate = _candidate;
    final current = _state.photo;
    if (candidate != null) {
      _candidate = null;
      final same =
          current != null &&
          listEquals(current.bytes, candidate.bytes) &&
          edit == _state.edit;
      _emit(
        _state.copyWith(
          photo: candidate,
          preview: rendered,
          edit: edit,
          clearError: true,
        ),
      );
      if (same && _state.preparation != PreparationStatus.failed) return;
      _beginPreparation();
      return;
    }
    if (_reediting && current != null) {
      _reediting = false;
      if (edit == _state.edit) {
        // 같은 사진·같은 편집값이면 다시 준비하지 않는다.
        _emit(_state.copyWith(preview: rendered));
        return;
      }
      _emit(_state.copyWith(preview: rendered, edit: edit, clearError: true));
      _beginPreparation();
    }
  }

  void onEditCancelled() {
    // 처음 고른 사진이면 선택이 없던 일이 되고, 재편집이면 기존 선택과 준비 결과를 유지한다.
    _candidate = null;
    _reediting = false;
  }

  // ------------------------------------------------------------------ 준비

  /// 이전 준비를 취소·삭제하고 정책 발급 + 인코딩을 새로 시작한다.
  void _beginPreparation() {
    final photo = _state.photo;
    if (photo == null || _disposed) return;
    _cancelPreparation();
    final token = CancelToken();
    final generation = ++_prepareGeneration;
    _prepareToken = token;
    final edit = _state.edit;
    _emit(_state.copyWith(preparation: PreparationStatus.preparing));
    _preparing = _runPreparation(photo, edit, token, generation);
  }

  Future<void> _runPreparation(
    PickedPhoto photo,
    PhotoEdit edit,
    CancelToken token,
    int generation,
  ) async {
    try {
      final prepared = await preparer.prepare(
        photo.bytes,
        edit,
        cancelToken: token,
      );
      if (_disposed || generation != _prepareGeneration) {
        // 뒤늦게 끝난 이전 준비는 새 상태를 덮지 않고 파일만 지운다.
        await preparer.discard(prepared);
        return;
      }
      _prepared = prepared;
      _emit(_state.copyWith(preparation: PreparationStatus.ready));
    } on UploadFailure catch (failure) {
      if (_disposed || generation != _prepareGeneration) return;
      switch (failure.kind) {
        case UploadFailureKind.cancelled:
          return;
        case UploadFailureKind.loginRequired:
          _emit(_state.copyWith(preparation: PreparationStatus.failed));
          _send(const UploadLoginRequired());
        case UploadFailureKind.failed:
          _emit(
            _state.copyWith(
              preparation: PreparationStatus.failed,
              error: failure.message,
            ),
          );
      }
    }
  }

  /// 진행 중인 준비를 취소하고 만들어 둔 임시 파일을 지운다.
  void _cancelPreparation() {
    _prepareGeneration++;
    _prepareToken?.cancel();
    _prepareToken = null;
    _preparing = null;
    final prepared = _prepared;
    _prepared = null;
    if (prepared != null) unawaited(preparer.discard(prepared));
  }

  // ------------------------------------------------------------------ 제목·제출

  void onTitleChanged(String next) {
    if (_state.isSubmitting || _completed) return;
    final title = PostTitle.applyInput(previous: _state.title, next: next);
    if (title == _state.title) {
      // 거절된 입력도 화면의 입력창이 상태와 같아지도록 다시 알린다.
      if (!_disposed) notifyListeners();
      return;
    }
    _emit(_state.copyWith(title: title));
  }

  Future<void> onSubmitPressed() async {
    if (_disposed || _completed || _state.photo == null) return;
    if (_state.isSubmitting) return;
    final photo = _state.photo!;
    final token = CancelToken();
    _submitToken = token;
    _emit(_state.copyWith(isSubmitting: true, clearError: true));
    try {
      // 주제(topicId)는 진입 때 받은 것을 쓴다. 아직 못 받았다면 지금 받는다.
      await _loadTopic();
      final topic = _topic;
      if (_disposed) return;
      if (topic == null) {
        _emit(
          _state.copyWith(
            isSubmitting: false,
            error: _state.topicError ?? Copy.uploadErrorTopicLoad,
          ),
        );
        return;
      }

      // 준비 중이면 끝날 때까지 기다렸다가 이어 간다. 준비가 없거나 실패했다면 처음부터 준비한다.
      if (_state.preparation == PreparationStatus.none ||
          _state.preparation == PreparationStatus.failed) {
        _beginPreparation();
      }
      await _preparing;
      if (_disposed) return;
      final prepared = _prepared;
      if (prepared == null) {
        // 준비 실패: 문구는 준비 쪽이 이미 상태에 두었다.
        _emit(_state.copyWith(isSubmitting: false));
        return;
      }

      final outcome = await submitter.submit(
        prepared: prepared,
        source: photo.bytes,
        target: UploadTarget(topicId: topic.id, topicDate: topicDate),
        title: PostTitle.normalize(_state.title),
        cancelToken: token,
      );
      if (_disposed) {
        // 화면이 닫힌 뒤 끝난 제출이 남긴 준비물(네트워크 실패 등)의 임시 파일을 지운다.
        if (outcome case SubmitFailed(:final retained?)) {
          unawaited(preparer.discard(retained));
        }
        return;
      }
      switch (outcome) {
        case SubmitSucceeded(:final moderationStatus):
          _prepared = null;
          _completed = true;
          _send(
            UploadSucceeded(
              topicTitle: topic.title,
              topicDate: topicDate,
              moderationStatus: moderationStatus,
              preview: _state.preview,
            ),
          );
        case SubmitFailed(:final failure, :final retained):
          _prepared = retained;
          final nextPreparation = retained == null
              ? PreparationStatus.none
              : PreparationStatus.ready;
          switch (failure.kind) {
            case UploadFailureKind.cancelled:
              _emit(
                _state.copyWith(
                  isSubmitting: false,
                  preparation: nextPreparation,
                ),
              );
            case UploadFailureKind.loginRequired:
              _emit(
                _state.copyWith(
                  isSubmitting: false,
                  preparation: nextPreparation,
                ),
              );
              _send(const UploadLoginRequired());
            case UploadFailureKind.failed:
              _emit(
                _state.copyWith(
                  isSubmitting: false,
                  preparation: nextPreparation,
                  error: failure.message,
                ),
              );
          }
      }
    } finally {
      if (identical(_submitToken, token)) _submitToken = null;
    }
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _topicToken.cancel();
    _prepareToken?.cancel();
    _submitToken?.cancel();
    _prepareGeneration++;
    final prepared = _prepared;
    _prepared = null;
    if (prepared != null) unawaited(preparer.discard(prepared));
    unawaited(_events.close());
    super.dispose();
  }
}
