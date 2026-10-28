import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:chalkak/features/feed/presentation/feed_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

final _other = postIdOf(2);
const _pastMineId = '22222222-2222-4222-8222-222222222290';

PostDetail _withAuthor(PostDetail d, String authorId) => PostDetail(
  id: d.id,
  authorId: authorId,
  topicId: d.topicId,
  topicTitle: d.topicTitle,
  topicDate: d.topicDate,
  originalImageUrl: d.originalImageUrl,
  thumbnailImageUrl: d.thumbnailImageUrl,
  signatureOriginalImageUrl: d.signatureOriginalImageUrl,
  title: d.title,
  likeCount: d.likeCount,
  isLiked: d.isLiked,
);

/// 전시 목록의 남의 게시물(은행잎)로 연 리그. 상세 응답은 [reply]로 정한다.
FeedRig _fromDisplay({
  String postId = '',
  String fixture = recentP1Fx,
  List<Reply<PostDetail>>? replies,
  String? userId = myUserId,
  bool manualLikes = false,
}) {
  final id = postId.isEmpty ? _other : postId;
  final r = FeedRig(
    target: targetFromCard(fixture, id),
    userId: userId,
    manualLikes: manualLikes,
  );
  r.repo.onDetail(id, replies ?? [Reply.ok(detailFx(detailOtherFx))]);
  r.likeRepo.seedServer(id, likeCount: cardOf(fixture, id).likeCount);
  return r;
}

/// 기록·푸시로 연 리그: 시드 없이 내 게시물.
FeedRig _fromRecord(String postId, List<Reply<PostDetail>> replies) {
  final r = FeedRig(target: targetFromRecord(postId));
  r.repo.onDetail(postId, replies);
  return r;
}

void _load(FakeAsync async, FeedRig r, [Duration wait = Duration.zero]) {
  r.vm.load();
  advance(async, wait);
}

void main() {
  group('로드와 시드', () {
    fakeTest('TC-FEED-001 전시 시드는 응답 전에도 보이고 좋아요가 비활성이며 상세 확정 뒤 활성이 된다', (
      async,
    ) {
      final r = _fromDisplay(
        replies: [
          Reply.ok(detailFx(detailOtherFx), delay: const Duration(seconds: 1)),
        ],
      );
      _load(async, r, const Duration(milliseconds: 500));
      expect(r.state.status, FeedStatus.content);
      expect(r.state.isConfirmed, isFalse);
      expect(r.state.content!.likeCount, 38);
      expect(r.state.content!.originalImageUrl, contains(_other));
      expect(r.state.displayTitle, '은행잎');
      expect(r.state.likeEnabled, isFalse);
      advance(async, const Duration(seconds: 1));
      expect(r.state.isConfirmed, isTrue);
      expect(r.state.likeEnabled, isTrue);
      expect(r.repo.detailCalls, [_other]);
    });

    fakeTest('TC-FEED-002 기록·푸시로 열면 응답 전에는 loading이고 응답 뒤 확정된다', (async) {
      final r = _fromRecord(myPostId, [
        Reply.ok(
          detailFx(detailMineTodayFx),
          delay: const Duration(seconds: 1),
        ),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      expect(r.state.status, FeedStatus.loading);
      expect(r.state.content, isNull);
      advance(async, const Duration(seconds: 1));
      expect(r.state.status, FeedStatus.content);
      expect(r.state.isConfirmed, isTrue);
      expect(r.state.displayTitle, '비 오는 날');
    });

    fakeTest('TC-FEED-013 날짜 라벨은 topicDate의 "M월 d일의 주제"이고 제목이 없으면 "무제"다', (
      async,
    ) {
      final r = _fromRecord(myPostId, [Reply.ok(detailFx(detailMineTodayFx))]);
      _load(async, r);
      expect(r.state.dateLabel, '10월 27일의 주제');
      final noTitle = postIdOf(4);
      final r2 = _fromRecord(noTitle, [Reply.ok(detailFx(detailNoTitleFx))]);
      _load(async, r2);
      expect(r2.state.displayTitle, Copy.feedTitleNone);
    });
  });

  group('내 게시물 판정 (D-26)', () {
    fakeTest('TC-FEED-004 기록 진입은 응답 전에도 내 게시물이고 authorId가 내 id면 응답 뒤에도 유지된다', (
      async,
    ) {
      final r = _fromRecord(myPostId, [
        Reply.ok(
          detailFx(detailMineTodayFx),
          delay: const Duration(seconds: 1),
        ),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      expect(r.state.isMine, isTrue);
      advance(async, const Duration(seconds: 1));
      expect(r.state.isMine, isTrue);
      expect(r.state.canDelete, isTrue);
      expect(r.state.canEditTitle, isTrue);
    });

    fakeTest('TC-FEED-004 진입 값과 응답이 다르면 응답(authorId == userId) 기준이다', (async) {
      // 내 게시물이라 믿고 열었지만 작성자가 다른 경우
      final a = _fromRecord(_other, [
        Reply.ok(_withAuthor(detailFx(detailOtherFx), otherUserId)),
      ]);
      _load(async, a);
      expect(a.state.isMine, isFalse);
      expect(a.state.canDelete, isFalse);
      expect(a.state.canEditTitle, isFalse);
      // 남의 게시물로 열었지만(목록 isMine=false) 작성자가 나인 경우
      final b = _fromDisplay(
        replies: [Reply.ok(_withAuthor(detailFx(detailOtherFx), myUserId))],
      );
      _load(async, b);
      expect(b.state.isMine, isTrue);
      expect(b.state.canDelete, isTrue);
    });

    fakeTest('TC-FEED-004 userId를 모르면(게스트) 항상 내 게시물이 아니다', (async) {
      final r = FeedRig(target: targetFromRecord(myPostId), userId: null);
      r.repo.onDetail(myPostId, [Reply.ok(detailFx(detailMineTodayFx))]);
      _load(async, r);
      expect(r.state.isMine, isFalse);
      expect(r.state.canDelete, isFalse);
      expect(r.state.canEditTitle, isFalse);
    });

    fakeTest('TC-FEED-016 수정 버튼은 내 게시물 + 오늘 주제일 때만, 삭제 버튼은 내 게시물이면 보인다', (
      async,
    ) {
      final today = _fromRecord(myPostId, [
        Reply.ok(detailFx(detailMineTodayFx)),
      ]);
      _load(async, today);
      expect(today.state.canEditTitle, isTrue);
      expect(today.state.canDelete, isTrue);

      final past = _fromRecord(_pastMineId, [
        Reply.ok(detailFx(detailMinePastFx)),
      ]);
      _load(async, past);
      expect(past.state.canEditTitle, isFalse, reason: '지난 주제는 수정 불가');
      expect(past.state.canDelete, isTrue);

      final other = _fromDisplay();
      _load(async, other);
      expect(other.state.canEditTitle, isFalse);
      expect(other.state.canDelete, isFalse);
    });

    fakeTest(
      'TC-FEED-016 화면이 열린 채 KST 자정을 지나면 다시 판정해 수정 버튼이 사라진다 (경계 값은 core의 TC-FEED-017)',
      (async) {
        final r = _fromRecord(myPostId, [
          Reply.ok(detailFx(detailMineTodayFx)),
        ]);
        _load(async, r);
        expect(r.state.canEditTitle, isTrue);
        async.elapse(const Duration(hours: 13));
        r.vm.onResumed();
        settle(async);
        expect(r.state.canEditTitle, isFalse);
        expect(r.state.canDelete, isTrue);
      },
    );
  });

  group('로드 실패', () {
    fakeTest('TC-FEED-007 404이면 "게시물을 찾을 수 없어요" 상태이고 시드가 있었으면 목록에서 뺄 이벤트를 낸다', (
      async,
    ) {
      final r = _fromDisplay(replies: [Reply.fail(errorFx(detail404Fx))]);
      _load(async, r);
      expect(r.state.status, FeedStatus.notFound);
      expect(r.removedIds, [_other]);
      final r2 = _fromRecord(myPostId, [Reply.fail(errorFx(detail404Fx))]);
      _load(async, r2);
      expect(r2.state.status, FeedStatus.notFound);
    });

    fakeTest('TC-FEED-008 시드 없이 실패하면 오류 상태: 400·500은 일반 문구, 연결 실패는 네트워크 문구', (
      async,
    ) {
      for (final (err, text) in [
        (errorFx(detail400Fx), Copy.feedErrorLoad),
        (errorFx(detail500Fx), Copy.feedErrorLoad),
        (networkError(), Copy.commonErrorNetwork),
      ]) {
        final r = _fromRecord(myPostId, [Reply.fail(err)]);
        _load(async, r);
        expect(r.state.status, FeedStatus.error, reason: '$err');
        expect(r.state.errorText, text, reason: '$err');
      }
    });

    fakeTest('TC-FEED-008 다시 시도하면 다시 불러온다', (async) {
      final r = _fromRecord(myPostId, [
        Reply.fail(errorFx(detail500Fx)),
        Reply.ok(detailFx(detailMineTodayFx)),
      ]);
      _load(async, r);
      expect(r.state.status, FeedStatus.error);
      r.vm.retry();
      settle(async);
      expect(r.state.status, FeedStatus.content);
      expect(r.repo.detailCalls, hasLength(2));
    });

    fakeTest('TC-FEED-009 응답 계약 위반은 "게시물 정보를 불러오지 못했어요"이고 앱은 깨지지 않는다', (async) {
      final r = _fromRecord(myPostId, [Reply.fail(ApiError.invalidResponse())]);
      _load(async, r);
      expect(r.state.status, FeedStatus.error);
      expect(r.state.errorText, Copy.feedErrorInvalid);
    });

    fakeTest('TC-FEED-010 시드가 보이는 상태에서 실패하면 내용을 유지하고 토스트만 띄운다', (async) {
      final cases = <(ApiError, String)>[
        (errorFx(detail500Fx), Copy.feedErrorLoad),
        (networkError(), Copy.commonErrorNetwork),
        (ApiError.invalidResponse(), Copy.feedErrorInvalid),
      ];
      for (final (err, text) in cases) {
        final r = _fromDisplay(replies: [Reply.fail(err)]);
        _load(async, r);
        expect(r.state.status, FeedStatus.content, reason: '$err');
        expect(r.state.displayTitle, '은행잎', reason: '$err');
        expect(r.toastTexts, [text], reason: '$err');
      }
    });

    fakeTest('TC-FEED-012 시드만 있고 상세를 확정하지 못하면 좋아요·수정·삭제가 막힌다', (async) {
      final r = _fromDisplay(
        postId: myPostId,
        replies: [Reply.fail(networkError())],
        manualLikes: true,
      );
      r.repo.onUpdateTitle(myPostId, [Reply.ok(titleResultFx(titleOkFx))]);
      r.repo.onDelete(myPostId, [Reply.ok(null)]);
      _load(async, r);
      expect(r.state.isConfirmed, isFalse);
      expect(r.state.likeEnabled, isFalse);
      r.vm.onLikeTapped();
      r.vm.saveTitle('새 제목');
      r.vm.confirmDelete();
      settle(async);
      expect(r.likeRepo.callCount, 0);
      expect(r.repo.titleCalls, isEmpty);
      expect(r.repo.deleteCalls, isEmpty);
    });

    fakeTest('TC-FEED-011 응답 전에 화면을 떠나면 늦은 응답은 무시되고 오류도 이벤트도 없다', (async) {
      final r = _fromRecord(myPostId, [
        Reply.ok(
          detailFx(detailMineTodayFx),
          delay: const Duration(seconds: 2),
        ),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      r.vm.dispose();
      advance(async, const Duration(seconds: 5));
      expect(r.events, isEmpty);
      expect(r.busEvents, isEmpty);
    });
  });

  group('좋아요', () {
    fakeTest('TC-LIKE-006 확정 뒤 하트를 누르면 응답 전에 값이 바뀐다', (async) {
      final r = _fromDisplay(manualLikes: true);
      _load(async, r);
      r.vm.onLikeTapped();
      settle(async);
      expect(r.state.content!.isLiked, isTrue);
      expect(r.state.content!.likeCount, 39);
      expect(r.likeRepo.putCount, 1);
      r.likeRepo.calls.single.succeed(r.likeRepo);
      settle(async);
      expect(r.state.content!.likeCount, 39);
    });

    fakeTest('TC-LIKE-009 실패하면 롤백하고 토스트를 띄운다(무음 롤백 금지)', (async) {
      final r = _fromDisplay(manualLikes: true);
      _load(async, r);
      r.vm.onLikeTapped();
      settle(async);
      r.likeRepo.calls.single.fail(networkError());
      settle(async);
      expect(r.state.content!.isLiked, isFalse);
      expect(r.state.content!.likeCount, 38);
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-032 작성자 본인의 게시물에도 좋아요를 누를 수 있다', (async) {
      final r = FeedRig(target: targetFromRecord(myPostId), manualLikes: true);
      r.repo.onDetail(myPostId, [Reply.ok(detailFx(detailMineTodayFx))]);
      r.likeRepo.seedServer(myPostId, likeCount: 10);
      _load(async, r);
      expect(r.state.isMine, isTrue);
      r.vm.onLikeTapped();
      settle(async);
      expect(r.likeRepo.putCount, 1);
      expect(r.state.content!.likeCount, 11);
    });

    fakeTest('TC-LIKE-023 좋아요가 먼저 끝나고 상세 응답이 나중에 와도 완료된 좋아요 값을 덮지 않는다', (
      async,
    ) {
      final r = _fromDisplay(
        replies: [
          Reply.ok(detailFx(detailOtherFx), delay: const Duration(seconds: 2)),
        ],
      );
      _load(async, r, const Duration(milliseconds: 500));
      // 다른 화면(전시)에서 같은 사진을 좋아요하고 끝낸다.
      r.likes.toggle(_other);
      advance(async, const Duration(milliseconds: 500));
      expect(r.state.content!.isLiked, isTrue);
      advance(async, const Duration(seconds: 2));
      expect(r.state.isConfirmed, isTrue);
      expect(r.state.content!.isLiked, isTrue);
      expect(r.state.content!.likeCount, 39);
    });

    fakeTest('TC-LIKE-025 다른 화면에서 바뀐 좋아요 값이 상세에도 즉시 반영된다(공유 저장소)', (async) {
      final r = _fromDisplay();
      _load(async, r);
      r.likes.toggle(_other);
      settle(async);
      expect(r.state.content!.isLiked, isTrue);
      expect(r.state.content!.likeCount, 39);
    });
  });
}
