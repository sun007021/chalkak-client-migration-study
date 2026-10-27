// ignore_for_file: unused_field
import 'package:flutter/foundation.dart';

import '../../../core/constants/app_constants.dart';
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
  BannerListController({
    required this._repository,
    this._pageSize = AppConstants.bannerPageSize,
  });

  final BannerRepository _repository;
  final int _pageSize;

  BannerListState get state => throw UnimplementedError();

  Future<void> loadFirst() => throw UnimplementedError();

  /// 성공이면 null, 실패면 그 오류(취소는 null).
  Future<ApiError?> refresh() => throw UnimplementedError();

  void onItemVisible(int index) => throw UnimplementedError();

  /// 최초 조회 실패 뒤 다시 시도.
  Future<void> retry() => throw UnimplementedError();

  /// 화면 이탈 시 진행 중 요청만 취소한다(dispose 전에 부를 수 있다).
  void cancelPending() => throw UnimplementedError();
}
