import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/feed/presentation/feed_view_model.dart'
    show FeedStatus;
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

/// 내 오늘 게시물을 상세까지 확정한 리그. 삭제 응답은 [replies].
FeedRig _open(FakeAsync async, List<Reply<Object?>> replies) {
  final r = FeedRig(target: targetFromRecord(myPostId));
  r.repo.onDetail(myPostId, [Reply.ok(detailFx(detailMineTodayFx))]);
  r.repo.onDelete(myPostId, replies);
  r.vm.load();
  settle(async);
  return r;
}

void main() {
  group('삭제 성공', () {
    fakeTest('TC-FEED-036 204이면 목록·기록·홈에서 뺄 이벤트와 성공 토스트, 화면 닫기가 한 번씩 나간다', (
      async,
    ) {
      final r = _open(async, [Reply.ok(null)]);
      r.vm.confirmDelete();
      settle(async);
      expect(r.repo.deleteCalls, [myPostId]);
      expect(r.removedIds, [myPostId]);
      expect(r.toastTexts, [Copy.feedDeleteSuccess]);
      expect(r.closeCount, 1);
    });

    fakeTest('TC-FEED-044 삭제한 id는 버스가 기억해 늦은 응답이 되살리지 못한다', (async) {
      final r = _open(async, [Reply.ok(null)]);
      r.vm.confirmDelete();
      settle(async);
      expect(r.bus.isRemoved(myPostId), isTrue);
    });

    fakeTest('TC-FEED-038 삭제 중 연타해도 DELETE는 한 번이고 완료 뒤 반복 탭도 무시된다', (async) {
      final r = _open(async, [
        Reply.ok(null, delay: const Duration(seconds: 1)),
      ]);
      r.vm.confirmDelete();
      settle(async);
      expect(r.state.isDeleting, isTrue);
      r.vm.confirmDelete();
      r.vm.confirmDelete();
      advance(async, const Duration(seconds: 2));
      r.vm.confirmDelete();
      settle(async);
      expect(r.repo.deleteCalls, hasLength(1));
      expect(r.toastTexts, [Copy.feedDeleteSuccess]);
      expect(r.closeCount, 1);
    });

    fakeTest('TC-FEED-045 삭제 중 화면을 떠나도 결과는 반영되고 토스트·닫기 이벤트는 나가지 않는다', (async) {
      final r = _open(async, [
        Reply.ok(null, delay: const Duration(seconds: 1)),
      ]);
      r.vm.confirmDelete();
      advance(async, const Duration(milliseconds: 300));
      r.vm.dispose();
      advance(async, const Duration(seconds: 2));
      expect(r.removedIds, [myPostId]);
      expect(r.bus.isRemoved(myPostId), isTrue);
      expect(r.events, isEmpty);
    });
  });

  group('삭제 실패', () {
    final cases = <String, (ApiError, String)>{
      'TC-FEED-039 400 이미지 처리 중': (
        errorFx(delete400ValidatingFx),
        Copy.feedDeleteErrorState,
      ),
      'TC-FEED-039 400 검수 거절': (
        errorFx(delete400RejectedFx),
        Copy.feedDeleteErrorState,
      ),
      'TC-FEED-040 403 본인이 아님(정지 문구가 아니다)': (
        errorFx(delete403Fx),
        Copy.feedDeleteErrorForbidden,
      ),
      'TC-FEED-042 401': (errorFx(delete401Fx), Copy.feedEditErrorLogin),
      'TC-FEED-042 연결 실패': (networkError(), Copy.commonErrorNetwork),
      'TC-FEED-042 500': (errorFx(delete500Fx), Copy.feedDeleteErrorOther),
    };
    for (final entry in cases.entries) {
      fakeTest('${entry.key}: 화면에 머문 채 토스트로 알리고 다시 시도할 수 있다', (async) {
        final r = _open(async, [Reply.fail(entry.value.$1), Reply.ok(null)]);
        r.vm.confirmDelete();
        settle(async);
        expect(r.toastTexts, [entry.value.$2]);
        expect(r.closeCount, 0);
        expect(r.removedIds, isEmpty);
        expect(r.state.isDeleting, isFalse);
        expect(r.state.status, FeedStatus.content);
        r.vm.confirmDelete();
        settle(async);
        expect(r.repo.deleteCalls, hasLength(2));
        expect(r.closeCount, 1);
      });
    }

    fakeTest('TC-FEED-041 404이면 "게시물을 찾을 수 없어요" 토스트와 함께 목록·캐시에서 뺀다', (async) {
      final r = _open(async, [Reply.fail(errorFx(delete404Fx))]);
      r.vm.confirmDelete();
      settle(async);
      expect(r.toastTexts, [Copy.feedErrorNotFound]);
      expect(r.removedIds, [myPostId]);
      expect(r.state.isDeleting, isFalse);
    });
  });

  group('정지 회원', () {
    fakeTest('TC-FEED-043 제목 수정이 403 정지로 막힌 회원도 삭제는 정상 처리된다', (async) {
      final r = _open(async, [Reply.ok(null)]);
      r.repo.onUpdateTitle(myPostId, [Reply.fail(errorFx(title403Fx))]);
      r.vm.saveTitle('가나다');
      settle(async);
      expect(r.state.titleError, Copy.feedEditErrorBanned);
      r.vm.confirmDelete();
      settle(async);
      expect(r.repo.deleteCalls, [myPostId]);
      expect(r.toastTexts, [Copy.feedDeleteSuccess]);
      expect(r.closeCount, 1);
    });
  });

  group('요청을 보내지 않는 경우', () {
    fakeTest('TC-FEED-034 남의 게시물은 삭제 요청을 보내지 않는다', (async) {
      final r = FeedRig(target: targetFromCard(recentP1Fx, postIdOf(2)));
      r.repo.onDetail(postIdOf(2), [Reply.ok(detailFx(detailOtherFx))]);
      r.repo.onDelete(postIdOf(2), [Reply.ok(null)]);
      r.vm.load();
      settle(async);
      expect(r.state.canDelete, isFalse);
      r.vm.confirmDelete();
      settle(async);
      expect(r.repo.deleteCalls, isEmpty);
    });
  });
}
