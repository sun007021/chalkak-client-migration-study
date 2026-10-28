import '../../../core/time/kst_date.dart';
import 'display_models.dart';

/// 전시 캐시 키: (날짜, 정렬). 아카이브는 `popular` 고정이라 날짜만 달라진다.
class ExhibitKey {
  const ExhibitKey(this.date, this.sort);

  final KstDate date;
  final DisplaySort sort;

  bool get isRandom => sort == DisplaySort.random;

  @override
  bool operator ==(Object other) =>
      other is ExhibitKey && other.date == date && other.sort == sort;

  @override
  int get hashCode => Object.hash(date, sort);

  @override
  String toString() => 'ExhibitKey(${date.toApiString()}, ${sort.wire})';
}

/// 한 (날짜, 정렬)에서 지금까지 받은 페이지들(REQ-DISP-022·023·026·027).
///
/// 첫 페이지 재검증은 첫 페이지만 교체하고 이미 받은 뒤쪽 페이지는 유지한다. 단 랜덤의 시드가
/// 바뀌었다면 순서가 달라졌으므로 뒤쪽 페이지를 버린다.
class Exhibit {
  Exhibit({
    required this.key,
    required this.topic,
    required List<PostCard> firstPage,
    required this._hasNext,
    String? randomSeed,
  }) : _pages = [firstPage],
       _seed = key.isRandom ? randomSeed : null;

  final ExhibitKey key;

  /// 재검증에서 다시 확인한 주제로 갱신된다.
  DisplayTopic topic;
  final List<List<PostCard>> _pages;
  bool _hasNext;
  String? _seed;

  /// 랜덤순 첫 페이지 응답에서 받은 시드. 랜덤이 아니면 항상 null.
  String? get randomSeed => _seed;

  /// 다음에 요청할 페이지 번호(1부터).
  int get nextPage => _pages.length + 1;

  /// 시드 없는 랜덤 응답은 `hasNext`여도 2페이지를 요청할 수 없다(TC-DISP-016·019).
  bool get canLoadMore => _hasNext && (!key.isRandom || _seed != null);

  /// 첫 페이지의 카드(중복 없음).
  List<PostCard> get firstPage => _unique(_pages.first);

  /// 받은 모든 페이지를 이어 붙이고 페이지 경계의 중복 id는 처음 것만 남긴다.
  List<PostCard> get cards => _unique(_pages.expand((page) => page));

  /// 첫 페이지 재검증 결과를 반영한다.
  void applyFirstPage(
    List<PostCard> cards, {
    required bool hasNext,
    String? randomSeed,
  }) {
    final seedChanged =
        key.isRandom &&
        randomSeed != null &&
        _seed != null &&
        randomSeed != _seed;
    if (seedChanged) _pages.removeRange(1, _pages.length);
    _pages[0] = cards;
    if (_pages.length == 1) _hasNext = hasNext;
    if (key.isRandom && randomSeed != null) _seed = randomSeed;
  }

  /// [nextPage]번째 페이지를 이어 붙인다.
  void appendPage(List<PostCard> cards, {required bool hasNext}) {
    _pages.add(cards);
    _hasNext = hasNext;
  }

  static List<PostCard> _unique(Iterable<PostCard> cards) {
    final seen = <String>{};
    return [
      for (final card in cards)
        if (seen.add(card.id)) card,
    ];
  }
}
