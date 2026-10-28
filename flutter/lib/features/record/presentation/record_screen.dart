import 'package:flutter/widgets.dart';

import '../domain/record_view_model.dart';

/// 기록 탭 화면. [RecordViewModel] 상태를 그리기만 한다(testids.md 기록 절의 식별자를 단다).
///
/// - 루트 `record.root`, 월 헤더(이전/다음 화살표는 `canGoPrevious/Next`에 따라 비활성),
///   요일 머리글 `Copy.recordWeekday`, 7열 격자(오늘 강조), 선택한 날의 사진 영역, 저장 버튼.
/// - 내용 상태별 표시: 로딩 `record.loading`, 오류 `record.error-state`(401은
///   `record.login-required-state` + `record.login-button`, 400은 `record.invalid-month-message`,
///   그 밖은 `record.retry-button`), 빈 달 `record.empty-state`는 사진 0건일 때만.
/// - PENDING: `record.pending-badge`(탭하면 `record.pending-tooltip` 열기/닫기), 동작 버튼 없음.
///   APPROVED: `record.view-feed-button`·`record.view-display-button`.
/// - 날짜 칸 `record.day-{yyyy-mm-dd}`는 사진이 있을 때만 눌린다. 선택 상태를 시맨틱스에 노출한다.
/// - 화면 생성 시 [RecordViewModel.enter], 사라질 때 [RecordViewModel.onHidden]을 부르는 일은
///   셸 통합 단계에서 정한다(테스트는 VM을 직접 구동).
class RecordScreen extends StatelessWidget {
  const RecordScreen({super.key, required this.viewModel});

  final RecordViewModel viewModel;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
