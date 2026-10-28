import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/home_fakes.dart';
import 'upload_vm_driver.dart';

void main() {
  uploadVmTest(
    'TC-UPL-011 화면을 열면 진입 때 고정한 topicDate로 주제를 받아 topicId와 제목을 얻는다',
    (d) {
      d.startScreen();
      expect(d.state.topicStatus, UploadTopicStatus.loaded);
      expect(d.state.topicTitle, isNotEmpty);
      expect(d.state.topicDate, d.rig.topicDate);
      expect(d.rig.home.topicDatesRequested, ['2026-10-27']);
      expect(d.state.topicError, isNull);
    },
  );

  uploadVmTest('TC-UPL-011 응답 topicDate가 요청과 다르면 주제 불러오기 실패 문구이다', (d) {
    d.rig.home.topic('2026-10-27', [fx('upload/topics__mismatch-date.json')]);
    d.startScreen();
    expect(d.state.topicStatus, UploadTopicStatus.failed);
    expect(d.state.topicError, Copy.uploadTopicLoadFailed);
  });

  uploadVmTest('TC-UPL-012 404·500은 주제를 불러오지 못했어요 문구이다', (d) {
    d.rig.home.topic('2026-10-27', [fx('home/topics__404-not-found.json')]);
    d.startScreen();
    expect(d.state.topicError, Copy.uploadTopicLoadFailed);

    final server = UploadDriver(d.async);
    server.rig.home.topic(
      '2026-10-27',
      failing('upload/topics__500-server-error.json'),
    );
    server.startScreen();
    server.tick(const Duration(seconds: 5));
    expect(server.state.topicError, Copy.uploadTopicLoadFailed);
    server.dispose();
  });

  uploadVmTest('TC-UPL-012 연결 실패는 네트워크 연결을 확인해 주세요이다', (d) {
    d.rig.home.topic(
      '2026-10-27',
      List.filled(3, const FakeResponse.fault(FakeFault.disconnect)),
    );
    d.startScreen();
    d.tick(const Duration(seconds: 5));
    expect(d.state.topicError, Copy.uploadErrorNetwork);
  });

  uploadVmTest('TC-UPL-012 재인증이 필요한 401은 로그인 이벤트이고 주제 오류 문구가 아니다', (d) {
    d.rig.home.topic('2026-10-27', [
      fx('home/posts-today__401-unauthorized.json'),
    ]);
    d.rig.api.refreshReauth();
    d.startScreen();
    expect(d.events.whereType<UploadLoginRequired>(), hasLength(1));
    expect(d.state.topicError, isNull);
  });

  uploadVmTest('REQ-UPL-010 다시 시도는 주제만 다시 받는다', (d) {
    d.rig.home.topic('2026-10-27', [
      fx('home/topics__404-not-found.json'),
      fx('home/topics__open-2026-10-27.json'),
    ]);
    d.startScreen();
    expect(d.state.topicStatus, UploadTopicStatus.failed);
    final before = d.rig.http.adapter.requests.length;
    d.vm.onTopicRetry();
    d.tick();
    expect(d.state.topicStatus, UploadTopicStatus.loaded);
    expect(d.state.topicError, isNull);
    final after = d.rig.http.adapter.requests.skip(before);
    expect(after.map((r) => r.path), ['/api/v1/topics']);
  });

  uploadVmTest('TC-UPL-088 화면을 열면 screen_view photo_upload를 한 번만 보낸다', (d) {
    d.startScreen();
    d.vm.start();
    d.tick();
    expect(d.rig.analytics.screenNames, ['photo_upload']);
  });
}
