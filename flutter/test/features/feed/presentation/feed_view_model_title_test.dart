import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:chalkak/features/feed/presentation/feed_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

const _pastMineId = '22222222-2222-4222-8222-222222222290';

/// 내 오늘 게시물(비 오는 날)을 상세까지 확정한 리그.
FeedRig _open(
  FakeAsync async, {
  List<Reply<PostTitleResult>>? titleReplies,
  List<Reply<PostDetail>>? detailReplies,
}) {
  final r = FeedRig(target: targetFromRecord(myPostId));
  r.repo.onDetail(
    myPostId,
    detailReplies ?? [Reply.ok(detailFx(detailMineTodayFx))],
  );
  r.repo.onUpdateTitle(
    myPostId,
    titleReplies ?? [Reply.ok(titleResultFx(titleOkFx))],
  );
  r.vm.load();
  settle(async);
  return r;
}

void main() {
  group('저장 성공', () {
    fakeTest('TC-FEED-021 앞뒤 공백을 제거한 값을 보내고 응답 title로 화면을 갱신한다', (async) {
      final r = _open(async);
      final done = start(async, r.vm.saveTitle(' 가나다라마바사아자차 '));
      expect(done.value, TitleSaveResult.saved);
      expect(r.repo.titleCalls.single.postId, myPostId);
      expect(r.repo.titleCalls.single.title, '가나다라마바사아자차');
      expect(r.state.displayTitle, '가나다라마바사아자차');
      expect(r.state.isSavingTitle, isFalse);
      expect(r.state.titleError, isNull);
    });

    fakeTest('TC-FEED-022 공백만 있으면 title을 null로 보내고 성공 뒤 "무제"로 표시한다', (async) {
      final r = _open(
        async,
        titleReplies: [Reply.ok(titleResultFx(titleNullFx))],
      );
      final done = start(async, r.vm.saveTitle('   '));
      expect(done.value, TitleSaveResult.saved);
      expect(r.repo.titleCalls.single.title, isNull);
      expect(r.state.displayTitle, Copy.feedTitleNone);
      expect(r.titleChanges.single.title, isNull);
    });

    fakeTest('TC-FEED-024 성공하면 토스트가 한 번 뜨고 다른 화면에 새 제목을 알린다', (async) {
      final r = _open(async);
      r.vm.saveTitle('가나다라마바사아자차');
      settle(async);
      expect(r.toastTexts, [Copy.feedEditSuccess]);
      expect(r.titleChanges, hasLength(1));
      expect(r.titleChanges.single.postId, myPostId);
      expect(r.titleChanges.single.title, '가나다라마바사아자차');
    });

    fakeTest('TC-FEED-025 저장 중에는 isSavingTitle이고 연타해도 PUT은 한 번만 나간다', (async) {
      final r = _open(
        async,
        titleReplies: [
          Reply.ok(titleResultFx(titleOkFx), delay: const Duration(seconds: 1)),
        ],
      );
      final first = start(async, r.vm.saveTitle('가나다'));
      expect(r.state.isSavingTitle, isTrue);
      final second = start(async, r.vm.saveTitle('가나다'));
      expect(second.value, TitleSaveResult.ignored);
      advance(async, const Duration(seconds: 2));
      expect(first.value, TitleSaveResult.saved);
      expect(r.repo.titleCalls, hasLength(1));
      expect(r.state.isSavingTitle, isFalse);
    });

    fakeTest('TC-FEED-026 상세 재조회가 진행 중일 때 제목을 수정하면 늦은 상세 응답이 수정한 제목을 덮지 않는다', (
      async,
    ) {
      final r = _open(
        async,
        detailReplies: [
          Reply.ok(detailFx(detailMineTodayFx)),
          Reply.ok(
            detailFx(detailMineTodayFx),
            delay: const Duration(seconds: 2),
          ),
        ],
      );
      r.vm.load(); // 재조회: 옛 제목 "비 오는 날"을 싣고 늦게 온다
      advance(async, const Duration(milliseconds: 500));
      r.vm.saveTitle('가나다라마바사아자차');
      advance(async, const Duration(milliseconds: 500));
      expect(r.state.displayTitle, '가나다라마바사아자차');
      advance(async, const Duration(seconds: 3));
      expect(r.state.displayTitle, '가나다라마바사아자차');
    });

    fakeTest('TC-FEED-033 응답이 유실돼 같은 제목으로 다시 저장해도 200 멱등 응답을 성공으로 처리한다', (
      async,
    ) {
      final r = _open(
        async,
        titleReplies: [
          Reply.fail(networkError()),
          Reply.ok(titleResultFx(titleOkFx)),
        ],
      );
      final a = start(async, r.vm.saveTitle('가나다라마바사아자차'));
      expect(a.value, TitleSaveResult.failed);
      final b = start(async, r.vm.saveTitle('가나다라마바사아자차'));
      expect(b.value, TitleSaveResult.saved);
      expect(r.state.titleError, isNull);
    });
  });

  group('저장 실패', () {
    final cases = <String, (ApiError, String)>{
      'TC-FEED-027 400 상태 변경·참여 기간 종료': (
        errorFx(title400StateFx),
        Copy.feedEditErrorState,
      ),
      'TC-FEED-028 400 제목 길이(클라 우회)': (
        errorFx(title400LongFx),
        Copy.feedEditErrorState,
      ),
      'TC-FEED-029 403 정지 회원': (errorFx(title403Fx), Copy.feedEditErrorBanned),
      'TC-FEED-031 401 갱신 뒤에도 인증 실패': (
        errorFx(title401Fx),
        Copy.feedEditErrorLogin,
      ),
      'TC-FEED-032 연결 실패': (networkError(), Copy.commonErrorNetwork),
      'TC-FEED-032 500 그 밖의 실패': (errorFx(title500Fx), Copy.feedEditErrorOther),
      'TC-FEED-032 응답 계약 위반': (
        ApiError.invalidResponse(),
        Copy.feedEditErrorOther,
      ),
    };
    for (final entry in cases.entries) {
      fakeTest('${entry.key}: 다이얼로그를 유지하고 사유를 보여 주며 제목은 변경 전 값이다', (async) {
        final r = _open(async, titleReplies: [Reply.fail(entry.value.$1)]);
        final done = start(async, r.vm.saveTitle('가나다'));
        expect(done.value, TitleSaveResult.failed);
        expect(r.state.titleError, entry.value.$2);
        expect(r.state.displayTitle, '비 오는 날');
        expect(r.state.isSavingTitle, isFalse);
        expect(r.toastTexts, isEmpty);
        expect(r.titleChanges, isEmpty);
        expect(r.closeCount, 0);
      });
    }

    fakeTest('TC-FEED-029 403 뒤에는 같은 요청을 다시 보내지 않는다', (async) {
      final r = _open(async, titleReplies: [Reply.fail(errorFx(title403Fx))]);
      r.vm.saveTitle('가나다');
      advance(async, const Duration(seconds: 10));
      expect(r.repo.titleCalls, hasLength(1));
    });

    fakeTest('TC-FEED-023 실패 뒤 다시 저장할 수 있고 성공하면 titleError가 사라진다', (async) {
      final r = _open(
        async,
        titleReplies: [
          Reply.fail(errorFx(title500Fx)),
          Reply.ok(titleResultFx(titleOkFx)),
        ],
      );
      r.vm.saveTitle('가나다라마바사아자차');
      settle(async);
      expect(r.state.titleError, isNotNull);
      final done = start(async, r.vm.saveTitle('가나다라마바사아자차'));
      expect(done.value, TitleSaveResult.saved);
      expect(r.state.titleError, isNull);
    });

    fakeTest('TC-FEED-018 다이얼로그를 닫을 때 titleError를 지운다', (async) {
      final r = _open(async, titleReplies: [Reply.fail(errorFx(title500Fx))]);
      r.vm.saveTitle('가나다');
      settle(async);
      r.vm.clearTitleError();
      expect(r.state.titleError, isNull);
      expect(r.repo.titleCalls, hasLength(1), reason: '취소는 요청을 보내지 않는다');
    });

    fakeTest('TC-FEED-030 404이면 "게시물을 찾을 수 없어요" 토스트 후 상세를 닫고 목록에서 뺀다', (async) {
      final r = _open(async, titleReplies: [Reply.fail(errorFx(title404Fx))]);
      final done = start(async, r.vm.saveTitle('가나다'));
      expect(done.value, TitleSaveResult.notFound);
      expect(r.toastTexts, [Copy.feedErrorNotFound]);
      expect(r.closeCount, 1);
      expect(r.removedIds, [myPostId]);
    });
  });

  group('요청을 보내지 않는 경우', () {
    fakeTest('TC-FEED-016 남의 게시물은 수정 요청을 보내지 않는다', (async) {
      final r = FeedRig(target: targetFromCard(recentP1Fx, postIdOf(2)));
      r.repo.onDetail(postIdOf(2), [Reply.ok(detailFx(detailOtherFx))]);
      r.repo.onUpdateTitle(postIdOf(2), [Reply.ok(titleResultFx(titleOkFx))]);
      r.vm.load();
      settle(async);
      final done = start(async, r.vm.saveTitle('가나다'));
      expect(done.value, TitleSaveResult.ignored);
      expect(r.repo.titleCalls, isEmpty);
    });

    fakeTest('TC-FEED-016 지난 주제의 내 게시물은 수정 요청 자체를 보내지 않는다', (async) {
      final r = FeedRig(target: targetFromRecord(_pastMineId));
      r.repo.onDetail(_pastMineId, [Reply.ok(detailFx(detailMinePastFx))]);
      r.repo.onUpdateTitle(_pastMineId, [Reply.ok(titleResultFx(titleOkFx))]);
      r.vm.load();
      settle(async);
      final done = start(async, r.vm.saveTitle('가나다'));
      expect(done.value, TitleSaveResult.ignored);
      expect(r.repo.titleCalls, isEmpty);
    });

    fakeTest('TC-FEED-016 화면이 열린 채 자정을 지나면 저장 시점에 다시 판정해 요청을 보내지 않는다', (async) {
      final r = _open(async);
      async.elapse(const Duration(hours: 13));
      final done = start(async, r.vm.saveTitle('가나다'));
      expect(done.value, TitleSaveResult.ignored);
      expect(r.repo.titleCalls, isEmpty);
    });
  });
}
