/// 다른 기능(피드 상세 등)에서 일어난 게시물 변경을 기록이 받는 최소 창구.
///
/// 통합 지점: 표시·피드·좋아요 PR의 `PostEventBus`(`PostRemoved`)를 이 인터페이스로 어댑트해
/// `AppDependencies`/`MainDependencies`에서 주입한다. 기록은 제목을 보여 주지 않으므로
/// `PostTitleChanged`는 필요 없다. 삭제 이벤트는 기록 화면이 만들어지기 전에 일어났어도
/// 받을 수 있게 구현이 버퍼링하거나 [RecordViewModel]보다 오래 사는 객체여야 한다.
abstract interface class RecordPostEvents {
  /// 삭제된 게시물 id(REQ-REC-027~028, D-23).
  Stream<String> get removedPostIds;
}
