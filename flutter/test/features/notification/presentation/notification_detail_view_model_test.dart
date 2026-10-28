import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/notification/domain/notification_models.dart';
import 'package:chalkak/features/notification/presentation/notification_detail_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/notification_fakes.dart';

void main() {
  fakeTest(
    'REQ-NOTI-014 TC-NOTI-048 상세가 보이면 screen_view notification_detail을 1회 보낸다',
    (async) {
      final r = DetailRig(notiId(2));
      r.repo.onDetail(notiId(2), [Reply.ok(notiDetailFx(detailRejectedFx))]);
      resolve(async, r.vm.start());
      expect(r.analytics.screenNames, ['notification_detail']);
    },
  );

  fakeTest('REQ-NOTI-023 상세 응답을 콘텐츠로 보이고 읽음 PATCH는 보내지 않는다(TC-NOTI-041)', (
    async,
  ) {
    final r = DetailRig(notiId(2));
    r.repo.onDetail(notiId(2), [Reply.ok(notiDetailFx(detailRejectedFx))]);
    final p = start(async, r.vm.start());
    // settle 뒤이므로 로딩은 이미 끝났다(로딩 중 상태는 화면 테스트가 gate로 검증한다).
    expect(p.done, isTrue);
    expect(r.state.status, DetailStatus.content);
    expect(r.state.detail!.type, NotificationType.postRejected);
    expect(r.repo.detailCalls, [notiId(2)]);
    expect(r.repo.readCalls, isEmpty);
    expect(r.unread.calls, 0);
  });

  fakeTest('TC-NOTI-045 상세 404면 이전 알림 정보를 지우고 notFound 상태이며 알림함·미읽음을 새로고침한다', (
    async,
  ) {
    final r = DetailRig(notiId(99));
    r.repo.onDetail(notiId(99), [Reply.fail(errorFx(notiDetail404Fx))]);
    resolve(async, r.vm.start());
    expect(r.state.status, DetailStatus.notFound);
    expect(r.state.detail, isNull);
    expect(r.inboxRefreshes, 1);
    expect(r.unread.calls, 1);
    expect(r.repo.readCalls, isEmpty);
  });

  fakeTest('TC-NOTI-046 상세 500이면 notiDetailError 오류 상태이고 다시 시도가 재요청한다', (
    async,
  ) {
    final r = DetailRig(notiId(2));
    r.repo.onDetail(notiId(2), [
      Reply.fail(errorFx(notiDetail500Fx)),
      Reply.ok(notiDetailFx(detailRejectedFx)),
    ]);
    resolve(async, r.vm.start());
    expect(r.state.status, DetailStatus.error);
    expect(r.state.errorMessage, Copy.notiDetailError);
    resolve(async, r.vm.retry());
    expect(r.repo.detailCalls, [notiId(2), notiId(2)]);
    expect(r.state.status, DetailStatus.content);
  });

  fakeTest('TC-NOTI-046 네트워크 오류면 notiNetwork 문구의 오류 상태', (async) {
    final r = DetailRig(notiId(2));
    r.repo.onDetail(notiId(2), [Reply.fail(networkError())]);
    resolve(async, r.vm.start());
    expect(r.state.status, DetailStatus.error);
    expect(r.state.errorMessage, Copy.notiNetwork);
  });

  fakeTest('REQ-NOTI-027 응답 계약 위반도 notiDetailError이고 크래시하지 않는다', (async) {
    final r = DetailRig(notiId(2));
    r.repo.onDetail(notiId(2), [Reply.fail(ApiError.invalidResponse())]);
    resolve(async, r.vm.start());
    expect(r.state.status, DetailStatus.error);
    expect(r.state.errorMessage, Copy.notiDetailError);
  });

  fakeTest('TC-NOTI-044 공지 상세는 콘텐츠이고 사진·반려 사유 값이 없다', (async) {
    final r = DetailRig(notiId(5));
    r.repo.onDetail(notiId(5), [Reply.ok(notiDetailFx(detailNoticeFx))]);
    resolve(async, r.vm.start());
    expect(r.state.detail!.originalImageUrl, isNull);
    expect(r.state.detail!.rejectionReason, isNull);
  });

  fakeTest('REQ-NOTI-026 "알림함으로"는 navigator.backToInbox를 부른다', (async) {
    final r = DetailRig(notiId(2));
    r.repo.onDetail(notiId(2), [Reply.ok(notiDetailFx(detailRejectedFx))]);
    resolve(async, r.vm.start());
    resolve(async, r.vm.onBackToInboxPressed());
    expect(r.nav.calls, ['back-to-inbox']);
  });
}
