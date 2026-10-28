import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/network/api_error.dart';
import 'banner_models.dart';
import 'banner_repository.dart';

enum BannerListStatus {
  /// 최초 조회 중.
  loading,

  /// 1건 이상.
  ready,

  /// 성공했지만 0건. ISSUE 섹션을 숨긴다.
  empty,

  /// 최초 조회 실패. ISSUE 섹션을 그리지 않는다(testids: 오류면 존재하지 않음).
  error,
}

class BannerListState {
  const BannerListState({
    required this.status,
    this.items = const [],
    this.hasNext = false,
    this.isLoadingMore = false,
  });

  final BannerListStatus status;
  final List<BannerItem> items;
  final bool hasNext;
  final bool isLoadingMore;
}

/// 배너 무한 목록(REQ-BANR-007~011, TC-BANR-008~016).
/// - [loadFirst]: 1페이지. 성공이면 ready/empty, 실패면 error.
/// - [onItemVisible]: 보이는 마지막 카드 index가 `items.length - 2` 이상이면 다음 페이지.
///   로딩 중, hasNext=false, 직전 추가 페이지가 비었으면 요청하지 않는다. 같은 id는 한 번만.
///   추가 페이지 실패는 목록을 유지하고 같은 page 번호로 다시 요청할 수 있다.
/// - [refresh]: 보이는 목록을 유지한 채 1페이지를 받아 교체하고 다음 요청은 page 2부터.
///   실패하면 유지하고 오류를 돌려주며, 빈 성공이면 목록을 비운다. 새로고침 이전에 보낸
///   추가 페이지의 늦은 응답은 버린다.
/// - [dispose]하면 진행 중 요청을 취소하고 이후 상태를 바꾸지 않는다. 취소는 오류가 아니다.
class BannerListController extends ChangeNotifier {
  BannerListController({required this._repository});

  final BannerRepository _repository;

  BannerListState _state = const BannerListState(
    status: BannerListStatus.loading,
  );
  CancelToken _token = CancelToken();

  /// 새 조회(최초·새로고침)가 시작될 때마다 올라간다. 이전 세대의 응답은 버린다.
  int _generation = 0;
  int _nextPage = 1;

  /// 직전 추가 페이지가 비었다. 새 1페이지를 받을 때까지 더 요청하지 않는다.
  bool _exhausted = false;
  bool _firstInFlight = false;
  Future<ApiError?>? _refreshing;
  bool _disposed = false;

  BannerListState get state => _state;

  Future<void> loadFirst() async {
    final generation = _beginGeneration();
    final token = _token;
    _firstInFlight = true;
    _emit(const BannerListState(status: BannerListStatus.loading));
    try {
      final page = await _repository.fetchPage(1, cancelToken: token);
      if (!_isCurrent(generation)) return;
      _applyFirstPage(page);
    } on Object catch (error) {
      if (!_isCurrent(generation)) return;
      // 취소는 오류가 아니다. 상태를 그대로 두고 다시 시도할 수 있게 한다.
      if (!_asApiError(error).isCancelled) {
        _emit(const BannerListState(status: BannerListStatus.error));
      }
    } finally {
      if (_isCurrent(generation)) _firstInFlight = false;
    }
  }

  /// 프리로드로 이미 받은 1페이지로 최초 조회를 대신한다(요청 없음).
  /// 진행 중이던 조회는 취소되고 이후 다음 요청은 2페이지부터다.
  void seed(BannerPage page) {
    if (_disposed) return;
    _beginGeneration();
    _firstInFlight = false;
    _applyFirstPage(page);
  }

  /// 성공이면 null, 실패면 그 오류(취소는 null).
  Future<ApiError?> refresh() => _refreshing ??= _refresh().whenComplete(() {
    _refreshing = null;
  });

  Future<ApiError?> _refresh() async {
    final generation = _beginGeneration();
    final token = _token;
    // 진행 중이던 추가 페이지는 취소했으니 로딩 표시도 거둔다.
    _firstInFlight = false;
    if (_state.isLoadingMore) _emit(_copy(isLoadingMore: false));
    try {
      final page = await _repository.fetchPage(1, cancelToken: token);
      if (!_isCurrent(generation)) return null;
      _applyFirstPage(page);
      return null;
    } on Object catch (error) {
      if (!_isCurrent(generation)) return null;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return null;
      // 보이는 목록은 유지한다. 아직 아무것도 받지 못했다면 오류 상태로 둔다.
      if (_state.status == BannerListStatus.loading) {
        _emit(const BannerListState(status: BannerListStatus.error));
      }
      return apiError;
    }
  }

  void onItemVisible(int index) {
    final state = _state;
    if (state.status != BannerListStatus.ready ||
        !state.hasNext ||
        state.isLoadingMore ||
        _exhausted ||
        index < state.items.length - 2) {
      return;
    }
    unawaited(_loadMore());
  }

  Future<void> _loadMore() async {
    final generation = _generation;
    final token = _token;
    final page = _nextPage;
    _emit(_copy(isLoadingMore: true));
    try {
      final result = await _repository.fetchPage(page, cancelToken: token);
      if (!_isCurrent(generation)) return;
      _exhausted = result.banners.isEmpty;
      _nextPage = page + 1;
      _emit(
        BannerListState(
          status: BannerListStatus.ready,
          items: _merge(_state.items, result.banners),
          hasNext: result.hasNext && !_exhausted,
        ),
      );
    } on Object {
      if (!_isCurrent(generation)) return;
      // 실패·취소 모두 쌓인 목록을 두고 같은 페이지를 다시 요청할 수 있게 한다.
      _emit(_copy(isLoadingMore: false));
    }
  }

  /// 최초 조회 실패 뒤 다시 시도.
  Future<void> retry() async {
    final status = _state.status;
    final stuck = status == BannerListStatus.loading && !_firstInFlight;
    if (status != BannerListStatus.error && !stuck) return;
    await loadFirst();
  }

  /// 화면 이탈 시 진행 중 요청만 취소한다(dispose 전에 부를 수 있다).
  void cancelPending() {
    _token.cancel();
    _token = CancelToken();
  }

  @override
  void dispose() {
    _disposed = true;
    _token.cancel();
    super.dispose();
  }

  int _beginGeneration() {
    _token.cancel();
    _token = CancelToken();
    return ++_generation;
  }

  bool _isCurrent(int generation) => !_disposed && generation == _generation;

  void _applyFirstPage(BannerPage page) {
    _nextPage = 2;
    _exhausted = false;
    final items = _merge(const [], page.banners);
    _emit(
      BannerListState(
        status: items.isEmpty ? BannerListStatus.empty : BannerListStatus.ready,
        items: items,
        hasNext: items.isNotEmpty && page.hasNext,
      ),
    );
  }

  BannerListState _copy({bool? isLoadingMore}) => BannerListState(
    status: _state.status,
    items: _state.items,
    hasNext: _state.hasNext,
    isLoadingMore: isLoadingMore ?? _state.isLoadingMore,
  );

  /// 같은 id는 먼저 온 것만 둔다.
  static List<BannerItem> _merge(
    List<BannerItem> existing,
    List<BannerItem> incoming,
  ) {
    final seen = {for (final item in existing) item.id};
    return List.unmodifiable([
      ...existing,
      for (final item in incoming)
        if (seen.add(item.id)) item,
    ]);
  }

  static ApiError _asApiError(Object error) =>
      error is ApiError ? error : ApiError.invalidResponse(cause: error);

  void _emit(BannerListState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }
}
