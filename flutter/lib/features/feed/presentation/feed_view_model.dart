import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/post_events/post_event_bus.dart';
import '../../../core/text/code_points.dart';
import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_format.dart';
import '../../like/domain/like_store.dart';
import '../../like/domain/toast_message.dart';
import '../domain/feed_target.dart';
import '../domain/post_detail.dart';
import '../domain/post_repository.dart';

enum FeedStatus { loading, content, notFound, error }

/// 화면에 그리는 게시물 값. 시드나 상세 응답에서 온다.
class FeedContent {
  const FeedContent({
    required this.postId,
    required this.originalImageUrl,
    required this.signatureImageUrl,
    required this.title,
    required this.topicDate,
    required this.likeCount,
    required this.isLiked,
  });

  final String postId;
  final String originalImageUrl;
  final String? signatureImageUrl;

  /// 서버 값 그대로(null 가능). 화면은 [FeedState.displayTitle]을 쓴다.
  final String? title;

  /// 상세 응답 전에 시드에 날짜가 없으면 null(기록·푸시 진입).
  final KstDate? topicDate;
  final int likeCount;
  final bool isLiked;
}

class FeedState {
  const FeedState({
    required this.status,
    required this.isConfirmed,
    required this.isMine,
    required this.canEditTitle,
    required this.canDelete,
    required this.likeEnabled,
    this.content,
    this.dateLabel,
    this.displayTitle = '',
    this.errorText,
    this.isSavingTitle = false,
    this.titleError,
    this.isDeleting = false,
    this.loadingImageUrl,
    this.photoLabel = '',
  });

  final FeedStatus status;
  final FeedContent? content;

  /// 사진의 접근성 라벨: 제목이 있으면 "{제목} 사진" 형태, 없으면 `Copy.feedPhotoAltNone`.
  final String photoLabel;

  /// 상세 응답을 받아 확정되었는가. 확정 전에는 좋아요·수정·삭제가 막힌다.
  final bool isConfirmed;

  /// 응답 전 진입 경로 값, 응답 후 `authorId == userId`(D-26). 게스트·userId 없음은 false.
  final bool isMine;

  /// 수정 버튼 노출: 내 게시물 + topicDate가 KST 오늘(D-23).
  final bool canEditTitle;

  /// 삭제 버튼 노출: 내 게시물.
  final bool canDelete;
  final bool likeEnabled;

  /// "M월 d일의 주제". topicDate를 모르면 null.
  final String? dateLabel;

  /// 제목, null·빈 값이면 `Copy.feedTitleNone`("무제").
  final String displayTitle;

  /// [FeedStatus.error] 문구: 404가 아니면 연결 실패 `Copy.commonErrorNetwork`,
  /// 응답 계약 위반 `Copy.feedErrorInvalid`, 그 밖 `Copy.feedErrorLoad`.
  final String? errorText;
  final bool isSavingTitle;

  /// 제목 수정 다이얼로그 안에 보여 줄 실패 사유(다이얼로그는 닫지 않는다).
  final String? titleError;
  final bool isDeleting;

  /// 기록에서 넘겨받은 썸네일. 상세 응답 전 로딩 동안 먼저 보여 줄 수 있다(REQ-FEED-002).
  final String? loadingImageUrl;
}

sealed class FeedEvent {
  const FeedEvent();
}

final class FeedToast extends FeedEvent {
  const FeedToast(this.message);
  final ToastMessage message;
}

/// 상세를 닫고 이전 화면으로 돌아간다(삭제 성공, 수정 404).
final class FeedClose extends FeedEvent {
  const FeedClose();
}

enum TitleSaveResult {
  /// 저장 성공: 다이얼로그를 닫는다.
  saved,

  /// 실패: 다이얼로그를 유지하고 [FeedState.titleError]를 보여 준다.
  failed,

  /// 404: 게시물이 없다. 다이얼로그를 닫고 [FeedClose]가 나간다.
  notFound,

  /// 요청을 보내지 않았다(확정 전, 내 게시물 아님, 지난 주제, 저장 중).
  ignored,
}

/// 게시물 상세 상태(REQ-FEED-001~030, REQ-LIKE-009·011).
///
/// 로드
/// - [load]: 시드가 있으면 즉시 content(미확정)로 보여 주고, 없으면 loading. `GET /posts/{postId}`
///   응답이 오면 확정(content, isConfirmed)으로 교체한다. 404는 notFound(`Copy.feedErrorNotFound`),
///   시드가 있었으면 [PostEventBus.publishRemoved]도 한다. 404가 아닌 실패는 시드가 있으면 내용을
///   유지하고 토스트(연결 실패 `Copy.commonErrorNetwork`, 계약 위반 `Copy.feedErrorInvalid`, 그 밖
///   `Copy.feedErrorLoad`), 시드가 없으면 error. 화면 이탈(dispose) 뒤 응답은 무시한다.
/// - 상세 응답은 이미 끝났거나 진행 중인 좋아요·제목 수정 결과를 덮지 않는다
///   ([LikeStore.reconcile]의 `since`, 제목은 수정 성공 이후 응답이면 수정 값 유지).
/// - 응답의 `authorId == userId`로 isMine을 다시 판정한다. 시드 값은 응답 전 임시값이다.
///
/// 좋아요: [onLikeTapped]는 확정 전이면 무시(`likeEnabled == false`), 게스트는 토스트만, 그 밖은
/// [LikeStore.toggle]. 값은 [LikeStore]의 최신 값을 따른다. 작성자 본인도 누를 수 있다.
///
/// 제목 수정: [saveTitle]은 확정되지 않았거나 내 게시물이 아니거나 topicDate가 KST 오늘이 아니면
/// (요청 시점에 다시 판정) 요청 없이 ignored, 저장 중이면 ignored. strip한 값(공백뿐이면 null)을
/// `PUT`으로 보낸다. 성공: 상세·[PostEventBus.publishTitleChanged] 반영 + `Copy.feedEditSuccess` 토스트.
/// 실패는 [FeedState.titleError]에 400 `feedEditErrorState`, 403 `feedEditErrorBanned`(재전송 없음),
/// 401 `feedEditErrorLogin`, 연결 실패 `commonErrorNetwork`, 그 밖 `feedEditErrorOther`.
/// 404는 `feedErrorNotFound` 토스트 + removed 발행 + [FeedClose].
///
/// 삭제: [confirmDelete]는 확정 전·내 게시물 아님·삭제 중·이미 삭제됨이면 요청 없이 무시.
/// 204면 [PostEventBus.publishRemoved] + `Copy.feedDeleteSuccess` 토스트 + [FeedClose]. 화면을
/// 이탈한 뒤 도착해도 removed는 발행하되 이벤트는 내지 않는다. 실패는 화면에 머문 채 토스트:
/// 400 `feedDeleteErrorState`, 403 `feedDeleteErrorForbidden`, 404는 게시물이 이미 없으므로 토스트 없이
/// removed 발행 + [FeedClose](팀 결정, REQ-FEED-029·030), 401 `feedEditErrorLogin`, 연결 실패 `commonErrorNetwork`, 그 밖 `feedDeleteErrorOther`. 실패 뒤 다시 시도할 수 있다.
class FeedViewModel extends ChangeNotifier {
  FeedViewModel({
    required this._target,
    required this._repository,
    required this._likes,
    required this._postEvents,
    required this._userId,
    this._clock = const KstClock(),
  }) : _today = _clock.today() {
    final seed = _target.seed;
    if (seed != null) {
      _view = _View.fromSeed(seed);
      // 저장소가 이 게시물을 아직 모르면 시드 값으로 채운다(이미 알면 그 값이 더 최신이다).
      if (_likes.stateOf(_target.postId) == null) {
        _likes.reconcile(
          _target.postId,
          isLiked: seed.isLiked,
          likeCount: seed.likeCount,
          since: _likes.version,
        );
      }
    }
    _likes.addListener(_publish);
    _state = _buildState();
  }

  final FeedTarget _target;
  final PostRepository _repository;
  final LikeStore _likes;
  final PostEventBus _postEvents;
  final String? _userId;
  final KstClock _clock;

  final StreamController<FeedEvent> _events =
      StreamController<FeedEvent>.broadcast();
  final CancelToken _cancelToken = CancelToken();

  late FeedState _state;
  _View? _view;
  KstDate _today;
  FeedStatus? _terminal;
  String? _errorText;
  bool _confirmed = false;
  bool _savingTitle = false;
  bool _deleting = false;
  bool _deleted = false;
  String? _titleError;
  int _loadSeq = 0;
  int _titleVersion = 0;
  int _toastSequence = 0;
  bool _disposed = false;

  FeedState get state => _state;

  /// broadcast. 화면이 보이는 동안만 구독한다.
  Stream<FeedEvent> get events => _events.stream;

  Future<void> load() async {
    if (_disposed) return;
    final seq = ++_loadSeq;
    final since = _likes.version;
    final titleVersion = _titleVersion;
    try {
      final detail = await _repository.fetchDetail(
        _target.postId,
        cancelToken: _cancelToken,
      );
      if (_disposed || seq != _loadSeq) return;
      _applyDetail(detail, since: since, titleVersion: titleVersion);
    } on Object catch (error, stack) {
      if (_disposed || seq != _loadSeq) return;
      _onLoadFailure(error, stack);
    }
  }

  /// error 상태의 "다시 시도".
  Future<void> retry() {
    if (_terminal == FeedStatus.error) {
      _terminal = null;
      _errorText = null;
      _publish();
    }
    return load();
  }

  Future<void> onLikeTapped() async {
    if (_disposed || !_confirmed) return;
    await _likes.toggle(_target.postId);
  }

  /// 화면이 다시 보일 때: KST 오늘을 다시 계산해 수정 버튼 판정을 갱신한다(자정 경과).
  void onResumed() {
    if (_disposed) return;
    _today = _clock.today();
    _publish();
  }

  Future<TitleSaveResult> saveTitle(String input) async {
    // 요청 시점에 오늘을 다시 계산해 자정을 넘긴 화면도 막는다.
    _today = _clock.today();
    if (_disposed || _savingTitle || !_canEditTitle) {
      return TitleSaveResult.ignored;
    }
    _savingTitle = true;
    _titleError = null;
    _publish();
    try {
      // 서버를 바꾸는 요청은 화면을 떠나도 취소하지 않는다(결과는 버스로 알린다).
      final result = await _repository.updateTitle(
        _target.postId,
        PostTitle.normalize(input),
      );
      _titleVersion++;
      _view = _view?.withTitle(result.title);
      _postEvents.publishTitleChanged(_target.postId, result.title);
      _toast(Copy.feedEditSuccess);
      return TitleSaveResult.saved;
    } on Object catch (error, stack) {
      return _onTitleFailure(error, stack);
    } finally {
      _savingTitle = false;
      _publish();
    }
  }

  /// 다이얼로그를 닫을 때 titleError를 지운다.
  void clearTitleError() {
    if (_disposed || _titleError == null) return;
    _titleError = null;
    _publish();
  }

  Future<void> confirmDelete() async {
    if (_disposed || _deleting || _deleted || !_confirmed || !_isMine) return;
    _deleting = true;
    _publish();
    try {
      await _repository.deletePost(_target.postId);
      _deleted = true;
      _postEvents.publishRemoved(_target.postId);
      _toast(Copy.feedDeleteSuccess);
      _emit(const FeedClose());
    } on Object catch (error, stack) {
      _onDeleteFailure(error, stack);
    } finally {
      _deleting = false;
      _publish();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelToken.cancel();
    _likes.removeListener(_publish);
    unawaited(_events.close());
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // 판정
  // ---------------------------------------------------------------------------

  /// 응답 전에는 진입 경로 값, 응답 뒤에는 `authorId == userId`(D-26). userId를 모르면 항상 false.
  bool get _isMine {
    if (_userId == null) return false;
    final authorId = _view?.authorId;
    return authorId == null ? _target.isMine : authorId == _userId;
  }

  bool get _isTopicToday => _view?.topicDate == _today;

  bool get _canEditTitle => _confirmed && _isMine && _isTopicToday;

  // ---------------------------------------------------------------------------
  // 응답 처리
  // ---------------------------------------------------------------------------

  void _applyDetail(
    PostDetail detail, {
    required int since,
    required int titleVersion,
  }) {
    _likes.reconcile(
      detail.id,
      isLiked: detail.isLiked,
      likeCount: detail.likeCount,
      since: since,
    );
    // 요청 뒤에 제목 수정이 성공했다면 옛 제목으로 되돌리지 않는다.
    final next = _View.fromDetail(detail);
    _view = titleVersion == _titleVersion ? next : next.withTitle(_view?.title);
    _confirmed = true;
    _terminal = null;
    _errorText = null;
    _publish();
  }

  void _onLoadFailure(Object error, StackTrace stack) {
    final apiError = _asApiError(error, stack);
    final hasSeed = _view != null;
    if (apiError.status == 404) {
      _terminal = FeedStatus.notFound;
      if (hasSeed) _postEvents.publishRemoved(_target.postId);
      _publish();
      return;
    }
    final text = _loadErrorText(apiError);
    if (hasSeed) {
      if (!_isSilent(apiError)) _toast(text);
      return;
    }
    _terminal = FeedStatus.error;
    _errorText = text;
    _publish();
  }

  TitleSaveResult _onTitleFailure(Object error, StackTrace stack) {
    final apiError = _asApiError(error, stack);
    if (apiError.status == 404) {
      _postEvents.publishRemoved(_target.postId);
      _toast(Copy.feedErrorNotFound);
      _emit(const FeedClose());
      return TitleSaveResult.notFound;
    }
    _titleError = _titleErrorText(apiError);
    return TitleSaveResult.failed;
  }

  void _onDeleteFailure(Object error, StackTrace stack) {
    final apiError = _asApiError(error, stack);
    if (apiError.status == 404) {
      // 이미 없는 게시물: 실패가 아니라 원하던 결과이므로 조용히 목록에서 빼고 닫는다.
      _deleted = true;
      _postEvents.publishRemoved(_target.postId);
      _emit(const FeedClose());
      return;
    }
    if (apiError.isCancelled) return;
    _toast(_deleteErrorText(apiError));
  }

  String _loadErrorText(ApiError error) {
    if (error.isNetwork) return Copy.commonErrorNetwork;
    if (error.isInvalidResponse) return Copy.feedErrorInvalid;
    return Copy.feedErrorLoad;
  }

  String _titleErrorText(ApiError error) {
    if (error.isNetwork) return Copy.commonErrorNetwork;
    return switch (error.status) {
      400 => Copy.feedEditErrorState,
      403 => Copy.feedEditErrorBanned,
      401 => Copy.feedEditErrorLogin,
      _ => Copy.feedEditErrorOther,
    };
  }

  String _deleteErrorText(ApiError error) {
    if (error.isNetwork) return Copy.commonErrorNetwork;
    return switch (error.status) {
      400 => Copy.feedDeleteErrorState,
      403 => Copy.feedDeleteErrorForbidden,
      401 => Copy.feedEditErrorLogin,
      _ => Copy.feedDeleteErrorOther,
    };
  }

  /// 취소(화면 이탈)와 401(세션 해제는 앱이 처리)은 토스트를 내지 않는다.
  bool _isSilent(ApiError error) => error.isCancelled || error.status == 401;

  /// 예상 밖 예외는 보고하고 일반 실패로 다룬다(화면이 멈추지 않게).
  ApiError _asApiError(Object error, StackTrace stack) {
    if (error is ApiError) return error;
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: error,
        stack: stack,
        library: 'chalkak feed',
      ),
    );
    return ApiError.invalidResponse(cause: error);
  }

  // ---------------------------------------------------------------------------
  // 상태
  // ---------------------------------------------------------------------------

  void _toast(String text) =>
      _emit(FeedToast(ToastMessage(id: ++_toastSequence, text: text)));

  void _emit(FeedEvent event) {
    if (!_disposed) _events.add(event);
  }

  void _publish() {
    if (_disposed) return;
    _state = _buildState();
    notifyListeners();
  }

  static String _photoLabel(String? title) =>
      title == null || title.trim().isEmpty
      ? Copy.feedPhotoAltNone
      : Copy.fill(Copy.feedPhotoAlt, {'제목': title});

  FeedState _buildState() {
    final view = _view;
    final like = _likes.stateOf(_target.postId);
    final status =
        _terminal ?? (view == null ? FeedStatus.loading : FeedStatus.content);
    final topicDate = view?.topicDate;
    final isMine = _isMine;
    return FeedState(
      status: status,
      content: view == null
          ? null
          : FeedContent(
              postId: _target.postId,
              originalImageUrl: view.originalImageUrl,
              signatureImageUrl: view.signatureImageUrl,
              title: view.title,
              topicDate: topicDate,
              likeCount: like?.likeCount ?? view.likeCount,
              isLiked: like?.isLiked ?? view.isLiked,
            ),
      isConfirmed: _confirmed,
      isMine: isMine,
      canEditTitle: isMine && _isTopicToday,
      canDelete: isMine,
      likeEnabled: _confirmed,
      dateLabel: topicDate == null ? null : KstFormat.topicLabel(topicDate),
      displayTitle: PostTitle.display(view?.title),
      errorText: _errorText,
      isSavingTitle: _savingTitle,
      titleError: _titleError,
      isDeleting: _deleting,
      loadingImageUrl: view == null ? _target.thumbnailUrl : null,
      photoLabel: _photoLabel(view?.title),
    );
  }
}

/// 화면에 그리는 값의 원본: 시드나 상세 응답. 좋아요 값은 [LikeStore]가 덮는다.
class _View {
  const _View({
    required this.originalImageUrl,
    required this.signatureImageUrl,
    required this.title,
    required this.topicDate,
    required this.likeCount,
    required this.isLiked,
    required this.authorId,
  });

  factory _View.fromSeed(FeedSeed seed) => _View(
    originalImageUrl: seed.originalImageUrl,
    signatureImageUrl: seed.signatureImageUrl,
    title: seed.title,
    topicDate: seed.topicDate,
    likeCount: seed.likeCount,
    isLiked: seed.isLiked,
    // 시드의 작성자는 응답 전 임시값이다. 판정은 진입 경로의 isMine을 쓴다.
    authorId: null,
  );

  factory _View.fromDetail(PostDetail detail) => _View(
    originalImageUrl: detail.originalImageUrl,
    signatureImageUrl: detail.signatureOriginalImageUrl,
    title: detail.title,
    topicDate: detail.topicDate,
    likeCount: detail.likeCount,
    isLiked: detail.isLiked,
    authorId: detail.authorId,
  );

  final String originalImageUrl;
  final String? signatureImageUrl;
  final String? title;
  final KstDate? topicDate;
  final int likeCount;
  final bool isLiked;

  /// 상세 응답에서만 안다.
  final String? authorId;

  _View withTitle(String? title) => _View(
    originalImageUrl: originalImageUrl,
    signatureImageUrl: signatureImageUrl,
    title: title,
    topicDate: topicDate,
    likeCount: likeCount,
    isLiked: isLiked,
    authorId: authorId,
  );
}
