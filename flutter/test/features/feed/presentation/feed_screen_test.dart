import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:chalkak/features/feed/presentation/feed_screen.dart';
import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/like/domain/toast_message.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

const _pastMineId = '22222222-2222-4222-8222-222222222290';

class _Screen {
  _Screen(this.rig);
  final FeedRig rig;
  final List<ToastMessage> toasts = [];
  int closed = 0;
}

Future<_Screen> _open(
  WidgetTester tester, {
  required FeedTarget target,
  List<Reply<PostDetail>>? detail,
  List<Reply<PostTitleResult>>? title,
  List<Reply<Object?>>? delete,
  bool manualLikes = false,
  bool load = true,
}) async {
  final rig = FeedRig(target: target, manualLikes: manualLikes);
  final id = target.postId;
  rig.repo.onDetail(id, detail ?? [Reply.ok(detailFx(detailMineTodayFx))]);
  rig.repo.onUpdateTitle(id, title ?? [Reply.ok(titleResultFx(titleOkFx))]);
  rig.repo.onDelete(id, delete ?? [Reply.ok(null)]);
  rig.likeRepo.seedServer(id);
  addTearDown(rig.vm.dispose);
  final s = _Screen(rig);
  await pumpScreen(
    tester,
    FeedScreen(
      viewModel: rig.vm,
      onToast: s.toasts.add,
      onClose: () => s.closed++,
    ),
  );
  if (load) {
    unawaited(rig.vm.load());
    await settleUi(tester);
  }
  return s;
}

Future<_Screen> _mine(
  WidgetTester tester, {
  List<Reply<Object?>>? delete,
  List<Reply<PostTitleResult>>? title,
}) => _open(
  tester,
  target: targetFromRecord(myPostId),
  delete: delete,
  title: title,
);

Finder _in(String id, Finder matching) =>
    find.descendant(of: byId(id), matching: matching);

String _inputText(WidgetTester tester) => tester
    .widget<TextField>(
      find.descendant(
        of: byId(FeedTestIds.titleInput),
        matching: find.byType(TextField),
      ),
    )
    .controller!
    .text;

void main() {
  group('상태', () {
    widgetTest('TC-FEED-058 확정된 내 오늘 게시물에 모든 요소의 testID가 있다', (tester) async {
      await _mine(tester);
      for (final id in [
        FeedTestIds.root,
        FeedTestIds.backButton,
        FeedTestIds.photo,
        FeedTestIds.signatureImage,
        FeedTestIds.dateLabel,
        FeedTestIds.title,
        FeedTestIds.likeButton,
        FeedTestIds.likeCount,
        FeedTestIds.editTitleButton,
        FeedTestIds.deleteButton,
      ]) {
        expect(byId(id), findsOneWidget, reason: id);
      }
      expect(byId(FeedTestIds.loading), findsNothing);
      expect(byId(FeedTestIds.errorState), findsNothing);
      expect(byId(FeedTestIds.notFoundState), findsNothing);
    });

    widgetTest('TC-FEED-058 응답 전에는 로딩 표시만 있다', (tester) async {
      await _open(
        tester,
        target: targetFromRecord(myPostId),
        detail: [
          Reply.ok(
            detailFx(detailMineTodayFx),
            delay: const Duration(seconds: 1),
          ),
        ],
      );
      expect(byId(FeedTestIds.loading), findsOneWidget);
      expect(byId(FeedTestIds.photo), findsNothing);
      await tester.pump(const Duration(seconds: 2));
      expect(byId(FeedTestIds.loading), findsNothing);
      expect(byId(FeedTestIds.photo), findsOneWidget);
    });

    widgetTest('TC-FEED-007 404이면 "게시물을 찾을 수 없어요" 상태이고 뒤로 가기가 있다', (
      tester,
    ) async {
      final s = await _open(
        tester,
        target: targetFromRecord(myPostId),
        detail: [Reply.fail(errorFx(detail404Fx))],
      );
      expect(byId(FeedTestIds.notFoundState), findsOneWidget);
      expect(find.text(Copy.feedErrorNotFound), findsOneWidget);
      expect(byId(FeedTestIds.photo), findsNothing);
      await tester.tap(byId(FeedTestIds.backButton));
      await settleUi(tester, frames: 2);
      expect(s.closed, 1);
    });

    widgetTest('TC-FEED-008 일반 실패는 오류 문구와 다시 시도 버튼이 있고 누르면 다시 불러온다', (
      tester,
    ) async {
      final s = await _open(
        tester,
        target: targetFromRecord(myPostId),
        detail: [
          Reply.fail(errorFx(detail500Fx)),
          Reply.ok(detailFx(detailMineTodayFx)),
        ],
      );
      expect(byId(FeedTestIds.errorState), findsOneWidget);
      expect(find.text(Copy.feedErrorLoad), findsOneWidget);
      await tester.tap(byId(FeedTestIds.retryButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.errorState), findsNothing);
      expect(byId(FeedTestIds.photo), findsOneWidget);
      expect(s.rig.repo.detailCalls, hasLength(2));
    });

    widgetTest('TC-FEED-010 시드가 있는 상태의 갱신 실패는 내용을 유지하고 토스트로 전달된다', (
      tester,
    ) async {
      final s = await _open(
        tester,
        target: targetFromCard(recentP1Fx, postIdOf(2)),
        detail: [Reply.fail(errorFx(detail500Fx))],
      );
      expect(byId(FeedTestIds.errorState), findsNothing);
      expect(byId(FeedTestIds.photo), findsOneWidget);
      expect([for (final t in s.toasts) t.text], [Copy.feedErrorLoad]);
    });
  });

  group('내용', () {
    widgetTest('TC-FEED-013 날짜 라벨과 제목이 보인다', (tester) async {
      await _mine(tester);
      expect(
        _in(FeedTestIds.dateLabel, find.text('10월 27일의 주제')),
        findsOneWidget,
      );
      expect(_in(FeedTestIds.title, find.text('비 오는 날')), findsOneWidget);
    });

    widgetTest('TC-FEED-053 제목이 없으면 "무제"가 보인다', (tester) async {
      await _open(
        tester,
        target: targetFromRecord(postIdOf(4)),
        detail: [Reply.ok(detailFx(detailNoTitleFx))],
      );
      expect(
        _in(FeedTestIds.title, find.text(Copy.feedTitleNone)),
        findsOneWidget,
      );
    });

    widgetTest('TC-FEED-016 남의 게시물에는 수정·삭제 버튼이 없다', (tester) async {
      await _open(
        tester,
        target: targetFromCard(recentP1Fx, postIdOf(2)),
        detail: [Reply.ok(detailFx(detailOtherFx))],
      );
      expect(byId(FeedTestIds.editTitleButton), findsNothing);
      expect(byId(FeedTestIds.deleteButton), findsNothing);
    });

    widgetTest('TC-FEED-016 지난 주제의 내 게시물에는 수정 버튼이 없고 삭제 버튼만 있다', (
      tester,
    ) async {
      await _open(
        tester,
        target: targetFromRecord(_pastMineId),
        detail: [Reply.ok(detailFx(detailMinePastFx))],
      );
      expect(byId(FeedTestIds.editTitleButton), findsNothing);
      expect(byId(FeedTestIds.deleteButton), findsOneWidget);
    });

    widgetTest('TC-LIKE-024 전시 시드는 상세 확정 전에 좋아요 버튼이 비활성이고 확정 뒤 활성이다', (
      tester,
    ) async {
      await _open(
        tester,
        target: targetFromCard(recentP1Fx, postIdOf(2)),
        detail: [
          Reply.ok(detailFx(detailOtherFx), delay: const Duration(seconds: 1)),
        ],
      );
      expect(isEnabled(tester, FeedTestIds.likeButton), isFalse);
      await tester.pump(const Duration(seconds: 2));
      await settleUi(tester);
      expect(isEnabled(tester, FeedTestIds.likeButton), isTrue);
    });

    widgetTest('TC-LIKE-006 하트를 누르면 응답 전에 수와 selected가 바뀐다', (tester) async {
      final s = await _open(
        tester,
        target: targetFromCard(recentP1Fx, postIdOf(2)),
        detail: [Reply.ok(detailFx(detailOtherFx))],
        manualLikes: true,
      );
      expect(_in(FeedTestIds.likeCount, find.text('38')), findsOneWidget);
      await tester.tap(byId(FeedTestIds.likeButton));
      await settleUi(tester);
      expect(_in(FeedTestIds.likeCount, find.text('39')), findsOneWidget);
      expect(isSelected(tester, FeedTestIds.likeButton), isTrue);
      expect(s.rig.likeRepo.putCount, 1);
    });
  });

  group('제목 수정 다이얼로그', () {
    widgetTest('TC-FEED-018 수정 버튼을 누르면 현재 제목이 채워진 다이얼로그가 열린다', (tester) async {
      await _mine(tester);
      expect(byId(FeedTestIds.titleDialog), findsNothing);
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.titleDialog), findsOneWidget);
      expect(find.text(Copy.feedEditTitle), findsOneWidget);
      expect(find.text(Copy.feedEditCancel), findsOneWidget);
      expect(find.text(Copy.feedEditSave), findsOneWidget);
      expect(_inputText(tester), '비 오는 날');
    });

    widgetTest('TC-FEED-018 입력을 비우면 플레이스홀더가 보인다', (tester) async {
      await _mine(tester);
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      await tester.enterText(
        _in(FeedTestIds.titleInput, find.byType(TextField)),
        '',
      );
      await settleUi(tester, frames: 3);
      expect(find.text(Copy.feedEditPlaceholder), findsOneWidget);
    });

    widgetTest('TC-FEED-018 취소는 다이얼로그를 닫고 요청을 보내지 않는다', (tester) async {
      final s = await _mine(tester);
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      await tester.tap(byId(FeedTestIds.titleCancelButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.titleDialog), findsNothing);
      expect(s.rig.repo.titleCalls, isEmpty);
    });

    widgetTest('TC-FEED-020 입력 필드는 11자 붙여넣기를 10 code point까지만 받는다', (
      tester,
    ) async {
      await _mine(tester);
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      await tester.enterText(
        _in(FeedTestIds.titleInput, find.byType(TextField)),
        '가나다라마바사아자차카',
      );
      await settleUi(tester, frames: 3);
      expect(_inputText(tester), '가나다라마바사아자차');
    });

    widgetTest('TC-FEED-025 저장 중에는 "저장 중..."으로 비활성이고 성공하면 닫히며 토스트가 전달된다', (
      tester,
    ) async {
      final s = await _mine(
        tester,
        title: [
          Reply.ok(titleResultFx(titleOkFx), delay: const Duration(seconds: 1)),
        ],
      );
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      await tester.tap(byId(FeedTestIds.titleSaveButton));
      await settleUi(tester, frames: 3);
      expect(byId(FeedTestIds.titleSaving), findsOneWidget);
      expect(find.text(Copy.feedEditSaving), findsOneWidget);
      expect(isEnabled(tester, FeedTestIds.titleSaveButton), isFalse);
      await tester.tap(byId(FeedTestIds.titleSaveButton), warnIfMissed: false);
      await tester.pump(const Duration(seconds: 2));
      await settleUi(tester);
      expect(s.rig.repo.titleCalls, hasLength(1));
      expect(byId(FeedTestIds.titleDialog), findsNothing);
      expect([for (final t in s.toasts) t.text], [Copy.feedEditSuccess]);
      expect(_in(FeedTestIds.title, find.text('가나다라마바사아자차')), findsOneWidget);
    });

    widgetTest('TC-FEED-023 저장이 실패하면 다이얼로그와 입력을 유지하고 사유를 보여 주며 다시 저장할 수 있다', (
      tester,
    ) async {
      final s = await _mine(
        tester,
        title: [
          Reply.fail(errorFx(title500Fx)),
          Reply.ok(titleResultFx(titleOkFx)),
        ],
      );
      await tester.tap(byId(FeedTestIds.editTitleButton));
      await settleUi(tester);
      await tester.enterText(
        _in(FeedTestIds.titleInput, find.byType(TextField)),
        '가나다',
      );
      await tester.tap(byId(FeedTestIds.titleSaveButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.titleDialog), findsOneWidget);
      expect(find.text(Copy.feedEditErrorOther), findsOneWidget);
      expect(_inputText(tester), '가나다');
      await tester.tap(byId(FeedTestIds.titleSaveButton));
      await settleUi(tester);
      expect(s.rig.repo.titleCalls, hasLength(2));
      expect(byId(FeedTestIds.titleDialog), findsNothing);
    });
  });

  group('삭제', () {
    widgetTest('TC-FEED-035 삭제 버튼을 누르면 확인창이 뜨고 취소하면 요청이 없다', (tester) async {
      final s = await _mine(tester);
      await tester.tap(byId(FeedTestIds.deleteButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.deleteDialog), findsOneWidget);
      expect(find.text(Copy.feedDeleteTitle), findsOneWidget);
      expect(find.text(Copy.feedDeleteBody), findsOneWidget);
      expect(find.text(Copy.feedDeleteConfirm), findsOneWidget);
      expect(find.text(Copy.feedDeleteCancel), findsOneWidget);
      await tester.tap(byId(FeedTestIds.deleteCancelButton));
      await settleUi(tester);
      expect(byId(FeedTestIds.deleteDialog), findsNothing);
      expect(s.rig.repo.deleteCalls, isEmpty);
    });

    widgetTest('TC-FEED-036 확인하면 DELETE를 보내고 토스트 전달 후 화면을 닫는다', (tester) async {
      final s = await _mine(tester);
      await tester.tap(byId(FeedTestIds.deleteButton));
      await settleUi(tester);
      await tester.tap(byId(FeedTestIds.deleteConfirmButton));
      await settleUi(tester);
      expect(s.rig.repo.deleteCalls, [myPostId]);
      expect([for (final t in s.toasts) t.text], [Copy.feedDeleteSuccess]);
      expect(s.closed, 1);
    });

    widgetTest('TC-FEED-038 삭제 중에는 진행 표시가 있다', (tester) async {
      await _mine(
        tester,
        delete: [Reply.ok(null, delay: const Duration(seconds: 1))],
      );
      await tester.tap(byId(FeedTestIds.deleteButton));
      await settleUi(tester);
      await tester.tap(byId(FeedTestIds.deleteConfirmButton));
      await settleUi(tester, frames: 3);
      expect(byId(FeedTestIds.deleting), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settleUi(tester);
    });

    widgetTest('TC-FEED-042 삭제 실패는 화면에 머물고 실패 토스트가 전달된다', (tester) async {
      final s = await _mine(tester, delete: [Reply.fail(errorFx(delete500Fx))]);
      await tester.tap(byId(FeedTestIds.deleteButton));
      await settleUi(tester);
      await tester.tap(byId(FeedTestIds.deleteConfirmButton));
      await settleUi(tester);
      expect(s.closed, 0);
      expect(byId(FeedTestIds.photo), findsOneWidget);
      expect([for (final t in s.toasts) t.text], [Copy.feedDeleteErrorOther]);
    });
  });

  widgetTest('뒤로 버튼을 누르면 onClose가 불린다', (tester) async {
    final s = await _mine(tester);
    await tester.tap(byId(FeedTestIds.backButton));
    await settleUi(tester, frames: 2);
    expect(s.closed, 1);
  });
}
