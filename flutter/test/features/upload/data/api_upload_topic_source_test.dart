import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart' show advance;
import '../../../support/upload_fakes.dart';

const _date = KstDate(2026, 10, 27);

void main() {
  fakeTest('TC-UPL-011 GET /topics?date=<topicDate>로 topicId와 제목을 얻는다', (
    async,
  ) {
    final r = UploadRig();
    final topic = resolve(async, r.topics.topicOn(_date));
    expect(topic.id, isNotEmpty);
    expect(topic.title, isNotEmpty);
    expect(topic.topicDate, _date);
    expect(r.home.topicDatesRequested, ['2026-10-27']);
  });

  fakeTest('TC-UPL-087 요청 날짜는 기기 시간대와 무관한 KST yyyy-MM-dd이다', (async) {
    final r = UploadRig();
    // 이 날짜의 주제 응답은 스크립트하지 않았으므로 결과(404)는 보지 않고 요청 날짜만 확인한다.
    start(async, r.topics.topicOn(const KstDate(2026, 1, 5)));
    expect(r.home.topicDatesRequested, ['2026-01-05']);
  });

  fakeTest('TC-UPL-011 응답 topicDate가 요청과 다르면 실패(invalidResponse)이다', (async) {
    final r = UploadRig();
    r.home.topic('2026-10-27', [fx('upload/topics__mismatch-date.json')]);
    final p = start(async, r.topics.topicOn(_date));
    expect((p.error! as ApiError).isInvalidResponse, isTrue);
  });

  fakeTest('TC-UPL-012 404는 주제 없음 ApiError(404)로 던진다(null이 아니다)', (async) {
    final r = UploadRig();
    r.home.topic('2026-10-27', [fx('home/topics__404-not-found.json')]);
    final p = start(async, r.topics.topicOn(_date));
    expect((p.error! as ApiError).status, 404);
  });

  fakeTest('TC-UPL-012 500은 ApiError(500), 연결 실패는 network로 구분된다', (async) {
    final r = UploadRig();
    r.home.topic('2026-10-27', failing('upload/topics__500-server-error.json'));
    final server = start(async, r.topics.topicOn(_date));
    advance(async, const Duration(seconds: 5));
    expect((server.error! as ApiError).status, 500);

    final r2 = UploadRig();
    r2.home.topic(
      '2026-10-27',
      List.filled(3, const FakeResponse.fault(FakeFault.disconnect)),
    );
    final net = start(async, r2.topics.topicOn(_date));
    advance(async, const Duration(seconds: 5));
    expect((net.error! as ApiError).isNetwork, isTrue);
  });
}
