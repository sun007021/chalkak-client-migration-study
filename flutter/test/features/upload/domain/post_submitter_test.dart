import 'dart:typed_data';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/domain/post_submitter.dart';
import 'package:chalkak/features/upload/domain/upload_models.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart' show Probe, advance, sessionAt, v1;
import '../../../support/upload_fakes.dart';

const _id1 = '55555555-5555-4555-8555-555555555501';
const _id2 = '55555555-5555-4555-8555-555555555502';
const _wait = Duration(seconds: 120);
const _target = UploadTarget(
  topicId: 'topic-1',
  topicDate: KstDate(2026, 10, 27),
);

String _serverMessage(String fixture) =>
    (Fixture.load('upload/$fixture') as Map)['message']! as String;

FakeResponse _businessError(int status, String message) => FakeResponse.json(
  status,
  {'errorCode': 'BUSINESS_ERROR', 'message': message},
);

class _Flow {
  _Flow(this.r, this.async);

  final UploadRig r;
  final FakeAsync async;

  PreparedUpload prepare([PhotoEdit edit = PhotoEdit.identity]) =>
      resolve(async, r.preparer.prepare(photoBytes(), edit));

  Probe<SubmitOutcome> submit(
    PreparedUpload prepared, {
    String? title,
    CancelToken? cancelToken,
    Duration wait = _wait,
  }) {
    final p = start(
      async,
      r.submitter.submit(
        prepared: prepared,
        source: photoBytes(),
        target: _target,
        title: title,
        cancelToken: cancelToken,
      ),
    );
    advance(async, wait);
    return p;
  }

  SubmitOutcome outcome(PreparedUpload prepared, {String? title}) {
    final p = submit(prepared, title: title);
    expect(p.done, isTrue, reason: '제출이 끝나지 않았다');
    if (p.error != null) throw p.error!;
    return p.value!;
  }

  SubmitFailed failed(PreparedUpload prepared) {
    final o = outcome(prepared);
    expect(o, isA<SubmitFailed>());
    return o as SubmitFailed;
  }
}

void main() {
  fakeTest('TC-UPL-054 TC-UPL-059 순서는 PUT -> POST /posts이고 본문·헤더가 계약과 같다', (
    async,
  ) {
    final r = UploadRig();
    final f = _Flow(r, async);
    final prepared = f.prepare();
    final o = f.outcome(prepared, title: '가을');
    expect(o, isA<SubmitSucceeded>());

    final methods = r.http.adapter.requests
        .where((q) => q.method == 'PUT' || q.path == '$v1/posts')
        .map((q) => q.method);
    expect(methods, ['PUT', 'POST']);
    final put = r.api.puts.single;
    expect(put.hasAuthorization, isFalse);
    expect(put.header('content-type'), 'image/webp');
    expect(put.bodyBytes, (prepared.file as FakeStoredPhoto).bytes);
    expect(r.api.creates.single.jsonBody, {
      'topicId': 'topic-1',
      'photoUploadId': _id1,
      'title': '가을',
    });
    expect(r.files.live, 0, reason: '성공하면 임시 파일을 지운다');
  });

  fakeTest('TC-UPL-060 201 PENDING·VALIDATING은 상태를 담아 성공한다', (async) {
    for (final (fixture, status) in [
      ('posts-create__201-pending.json', ModerationStatus.pending),
      ('posts-create__201-validating.json', ModerationStatus.validating),
    ]) {
      final r = UploadRig()..api.create([fixture]);
      final f = _Flow(r, async);
      final o = f.outcome(f.prepare()) as SubmitSucceeded;
      expect(o.moderationStatus, status);
      expect(o.postId, isNotEmpty);
    }
  });

  group('2xx 계약 위반 복구 (TC-UPL-061)', () {
    fakeTest('TC-UPL-061 알 수 없는 상태 + today isPosted=true면 그 상태로 성공한다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__201-unknown-status.json']);
      r.home.today([fx('home/posts-today__posted-pending.json')]);
      final f = _Flow(r, async);
      final o = f.outcome(f.prepare()) as SubmitSucceeded;
      expect(o.moderationStatus, ModerationStatus.pending);
      expect(r.api.createCalls, 1);
    });

    fakeTest('TC-UPL-061 today가 isPosted=false면 전시 실패 문구이고 입력을 유지한다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__201-unknown-status.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorCreate);
      expect(o.retained, isNotNull);
    });
  });

  group('400 판정 (D-02)', () {
    fakeTest('TC-UPL-062 today isPosted=true면 이미 전시했어요이고 서버 message를 바꿔도 같다', (
      async,
    ) {
      for (final response in [
        up('posts-create__400-already-posted.json'),
        _businessError(400, '완전히 다른 문장'),
      ]) {
        final r = UploadRig()..api.createResponses([response]);
        r.home.today([fx('home/posts-today__posted-pending.json')]);
        final f = _Flow(r, async);
        final o = f.failed(f.prepare());
        expect(o.failure.message, Copy.uploadErrorDuplicate);
        expect(o.retained, isNotNull, reason: '입력은 유지');
      }
    });

    fakeTest(
      'TC-UPL-063 today 404 또는 topicDate 변경이면 주제가 변경되었어요이고 message와 무관하다',
      (async) {
        for (final (response, today) in [
          (
            up('posts-create__400-topic-not-open.json'),
            fx('home/posts-today__404-no-open-topic.json'),
          ),
          (
            up('posts-create__400-topic-not-open.json'),
            fx('upload/posts-today__topic-date-changed.json'),
          ),
          (
            _businessError(400, '다른 문장'),
            fx('upload/posts-today__topic-date-changed.json'),
          ),
        ]) {
          final r = UploadRig()..api.createResponses([response]);
          r.home.today([today]);
          final f = _Flow(r, async);
          final o = f.failed(f.prepare());
          expect(o.failure.message, Copy.uploadErrorTopicChanged);
        }
      },
    );

    fakeTest('TC-UPL-064 그 밖의 400은 서버 message 그대로 보여 주고 사진 준비를 처음부터 다시 하게 한다', (
      async,
    ) {
      for (final name in [
        'posts-create__400-upload-expired.json',
        'posts-create__400-upload-used.json',
        'posts-create__400-rejected-unsupported-format.json',
        'posts-create__400-rejected-too-large.json',
      ]) {
        final r = UploadRig()..api.create([name]);
        final f = _Flow(r, async);
        final o = f.failed(f.prepare());
        expect(o.failure.message, _serverMessage(name), reason: name);
        expect(o.failure.discardPrepared, isTrue, reason: name);
        expect(o.retained, isNull, reason: name);
        expect(r.files.live, 0, reason: '$name 임시 파일 삭제');
        expect(r.home.todayCalls, 1, reason: '$name 판정은 today 1회');
      }
    });

    fakeTest('TC-UPL-083 제목 초과 400은 서버 message를 보여 준다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__400-title-too-long.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(
        o.failure.message,
        _serverMessage('posts-create__400-title-too-long.json'),
      );
    });

    fakeTest('TC-UPL-064 판정용 today 확인이 실패하면 전시 실패 문구이고 준비물을 유지한다', (async) {
      final r = UploadRig()..api.create(['posts-create__400-upload-used.json']);
      r.home.today(failing('home/posts-today__500-server-error.json'));
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorCreate);
      expect(o.retained, isNotNull);
    });
  });

  group('404 (TC-UPL-065)', () {
    fakeTest('TC-UPL-065 업로드한 사진을 찾을 수 없으면 서버 message + 업로드부터 다시이다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__404-upload-not-found.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(
        o.failure.message,
        _serverMessage('posts-create__404-upload-not-found.json'),
      );
      expect(o.failure.discardPrepared, isTrue);
    });

    fakeTest('TC-UPL-065 주제를 찾을 수 없으면 today로 확인해 주제 변경 문구이다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__404-topic-not-found.json']);
      r.home.today([fx('upload/posts-today__topic-date-changed.json')]);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorTopicChanged);
    });
  });

  group('인증·정지 (TC-UPL-066, 067, 076)', () {
    fakeTest('TC-UPL-066 401은 refresh 후 1회 재전송해 성공한다', (async) {
      final r = UploadRig()
        ..api.create([
          'posts-create__401-unauthorized.json',
          'posts-create__201-pending.json',
        ]);
      final f = _Flow(r, async);
      expect(f.outcome(f.prepare()), isA<SubmitSucceeded>());
      expect(r.api.createCalls, 2);
      expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
    });

    fakeTest('TC-UPL-066 TC-UPL-078 재인증이 필요하면 loginRequired이고 임시 파일을 지운다', (
      async,
    ) {
      final r = UploadRig()
        ..api.create(['posts-create__401-unauthorized.json']);
      r.api.refreshReauth();
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.kind, UploadFailureKind.loginRequired);
      expect(o.retained, isNull);
      expect(r.files.live, 0);
    });

    fakeTest('TC-UPL-067 403은 정지 문구이고 재요청 0건이다', (async) {
      final r = UploadRig()..api.create(['posts-create__403-banned.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadGateBanned);
      expect(r.api.createCalls, 1);
    });

    fakeTest(
      'TC-UPL-076 5분이 지나 액세스 토큰이 만료돼도 갱신 뒤 새 정책을 받고 PUT에는 Authorization이 없다',
      (async) {
        final r = UploadRig(
          session: sessionAt(accessLeft: const Duration(minutes: 4)),
        );
        final f = _Flow(r, async);
        final prepared = f.prepare();
        r.api.policyResponses([
          up('posts-uploads__401-unauthorized.json'),
          up('posts-uploads__issued-new.json'),
        ]);
        advance(async, const Duration(seconds: 301));
        r.monotonic.advance(const Duration(seconds: 301));
        final o = f.outcome(prepared);
        expect(o, isA<SubmitSucceeded>());
        expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
        expect(r.api.puts.single.hasAuthorization, isFalse);
        expect(r.api.creates.single.jsonBody!['photoUploadId'], _id2);
      },
    );
  });

  group('PUT 실패 (TC-UPL-055, 056, 058)', () {
    fakeTest('TC-UPL-055 S3 403·5xx는 업로드 실패 문구이고 정책을 버리며 POST를 보내지 않는다', (
      async,
    ) {
      for (final name in [
        's3-put__403-signature-mismatch.json',
        's3-put__500-server-error.json',
      ]) {
        final r = UploadRig()..api.put([name]);
        final f = _Flow(r, async);
        final o = f.failed(f.prepare());
        expect(o.failure.message, Copy.uploadErrorUpload, reason: name);
        expect(o.failure.discardPrepared, isTrue, reason: name);
        expect(o.retained, isNull, reason: name);
        expect(r.api.createCalls, 0, reason: name);
        expect(r.files.live, 0, reason: name);
      }
    });

    fakeTest('TC-UPL-055 연결 실패는 네트워크 문구이고 준비물(정책)을 유지한다', (async) {
      final r = UploadRig()
        ..api.putResponses(
          List.filled(3, const FakeResponse.fault(FakeFault.disconnect)),
        );
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorNetwork);
      expect(o.retained, isNotNull);
      expect(r.api.createCalls, 0);
    });

    fakeTest('TC-UPL-056 http:// 업로드 URL은 전송하지 않고 업로드 실패로 처리한다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__insecure-upload-url.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorUpload);
      expect(r.api.putCalls, 0);
      expect(r.api.createCalls, 0);
    });

    fakeTest('TC-UPL-058 정책 maxBytes를 넘는 파일은 PUT 전에 막는다', (async) {
      final r = UploadRig();
      final f = _Flow(r, async);
      final good = f.prepare();
      final big = PreparedUpload(
        policy: good.policy,
        file: resolve(async, r.files.write(Uint8List(5242881))),
        sizeBytes: 5242881,
        edit: good.edit,
        issuedAt: good.issuedAt,
      );
      final o = f.failed(big);
      expect(o.failure.message, Copy.uploadErrorPrepare);
      expect(r.api.putCalls, 0);
      expect(r.api.createCalls, 0);
    });

    fakeTest('TC-UPL-058 정확히 maxBytes인 파일은 보낸다', (async) {
      final r = UploadRig();
      final f = _Flow(r, async);
      final good = f.prepare();
      final exact = PreparedUpload(
        policy: good.policy,
        file: resolve(async, r.files.write(Uint8List(5242880))),
        sizeBytes: 5242880,
        edit: good.edit,
        issuedAt: good.issuedAt,
      );
      expect(f.outcome(exact), isA<SubmitSucceeded>());
      expect(r.api.putCalls, 1);
    });
  });

  group('응답 유실 복구 (D-07)', () {
    fakeTest('TC-UPL-069 타임아웃 + today isPosted=true면 성공이고 POST는 재전송하지 않는다', (
      async,
    ) {
      final r = UploadRig()..api.create(['posts-create__timeout.json']);
      r.home.today([fx('home/posts-today__posted-validating.json')]);
      final f = _Flow(r, async);
      final o = f.outcome(f.prepare()) as SubmitSucceeded;
      expect(o.moderationStatus, ModerationStatus.validating);
      expect(r.api.createCalls, 1);
      expect(r.home.todayCalls, 1);
    });

    fakeTest(
      'TC-UPL-070 타임아웃 + today isPosted=false면 네트워크 문구이고 같은 uploadId로 다시 제출할 수 있다',
      (async) {
        final r = UploadRig()
          ..api.createResponses([
            up('posts-create__timeout.json'),
            up('posts-create__201-pending.json'),
          ]);
        final f = _Flow(r, async);
        final first = f.failed(f.prepare());
        expect(first.failure.message, Copy.uploadErrorNetwork);
        expect(first.retained, isNotNull);
        expect(r.api.policyCalls, 1);

        final second = f.outcome(first.retained!);
        expect(second, isA<SubmitSucceeded>());
        expect(r.api.policyCalls, 1, reason: '새 정책 발급 없음');
        final ids = r.api.creates.map((q) => q.jsonBody!['photoUploadId']);
        expect(ids, [_id1, _id1]);
      },
    );

    fakeTest('TC-UPL-071 today도 실패하면 네트워크 문구이고, 재제출이 400 중복이면 이미 전시했어요이다', (
      async,
    ) {
      final r = UploadRig()
        ..api.createResponses([
          up('posts-create__timeout.json'),
          up('posts-create__400-already-posted.json'),
        ]);
      r.home.today(failing('home/posts-today__500-server-error.json'));
      final f = _Flow(r, async);
      final first = f.failed(f.prepare());
      expect(first.failure.message, Copy.uploadErrorNetwork);
      expect(first.retained, isNotNull);

      r.home.today([fx('home/posts-today__posted-pending.json')]);
      final second = f.failed(first.retained!);
      expect(second.failure.message, Copy.uploadErrorDuplicate);
    });

    fakeTest('TC-UPL-068 500은 복구 대상이 아니다: 재시도 없이 1회, 전시 실패 문구, 입력 유지', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__500-server-error.json']);
      final f = _Flow(r, async);
      final o = f.failed(f.prepare());
      expect(o.failure.message, Copy.uploadErrorCreate);
      expect(o.retained, isNotNull);
      expect(r.api.createCalls, 1);
      expect(r.home.todayCalls, 0);
    });
  });

  group('시간 경과 (TC-UPL-072, 075)', () {
    fakeTest('TC-UPL-072 59분 59초 뒤 재제출도 요청이 전송된다(만료된 URL은 새 정책을 받는다)', (async) {
      final r = UploadRig()
        ..api.create([
          'posts-create__500-server-error.json',
          'posts-create__201-pending.json',
        ])
        ..api.policy([
          'posts-uploads__issued.json',
          'posts-uploads__issued-new.json',
        ]);
      final f = _Flow(r, async);
      final first = f.failed(f.prepare());
      r.monotonic.advance(const Duration(minutes: 59, seconds: 59));
      final second = f.outcome(first.retained!);
      expect(second, isA<SubmitSucceeded>());
      expect(r.api.creates.last.jsonBody!['photoUploadId'], _id2);
    });

    fakeTest('TC-UPL-072 61분 뒤 서버가 업로드 만료 400을 주면 서버 message를 보이고 준비부터 다시 한다', (
      async,
    ) {
      final r = UploadRig()
        ..api.create([
          'posts-create__500-server-error.json',
          'posts-create__400-upload-expired.json',
        ])
        ..api.policy([
          'posts-uploads__issued.json',
          'posts-uploads__issued-new.json',
        ]);
      final f = _Flow(r, async);
      final first = f.failed(f.prepare());
      r.monotonic.advance(const Duration(minutes: 61));
      final second = f.failed(first.retained!);
      expect(
        second.failure.message,
        _serverMessage('posts-create__400-upload-expired.json'),
      );
      expect(second.failure.discardPrepared, isTrue);
    });

    fakeTest(
      'TC-UPL-075 자정 뒤 제출해도 진입 때의 topicId로 보내고, 서버가 이미 다음 주제를 열었으면 주제 변경 문구이다',
      (async) {
        final r = UploadRig()
          ..api.create(['posts-create__400-topic-not-open.json']);
        r.home.today([fx('upload/posts-today__topic-date-changed.json')]);
        final f = _Flow(r, async);
        final prepared = f.prepare();
        advance(async, const Duration(seconds: 90));
        r.monotonic.advance(const Duration(seconds: 90));
        final o = f.failed(prepared);
        expect(o.failure.message, Copy.uploadErrorTopicChanged);
        expect(r.api.creates.single.jsonBody!['topicId'], 'topic-1');
      },
    );

    fakeTest('TC-UPL-075 서버 참여 기간이 아직 끝나지 않았다면 201로 성공한다', (async) {
      final r = UploadRig();
      final f = _Flow(r, async);
      final prepared = f.prepare();
      advance(async, const Duration(seconds: 90));
      r.monotonic.advance(const Duration(seconds: 90));
      expect(f.outcome(prepared), isA<SubmitSucceeded>());
      expect(r.api.creates.single.jsonBody!['topicId'], 'topic-1');
    });
  });

  group('취소와 임시 파일 (TC-UPL-031, 079)', () {
    fakeTest('TC-UPL-079 PUT 중 취소하면 cancelled이고 임시 파일을 지우며 POST를 보내지 않는다', (
      async,
    ) {
      final r = UploadRig()
        ..api.put(['s3-put__200.json'], delay: const Duration(seconds: 20));
      final f = _Flow(r, async);
      final prepared = f.prepare();
      final token = CancelToken();
      final p = f.submit(
        prepared,
        cancelToken: token,
        wait: const Duration(seconds: 2),
      );
      expect(p.done, isFalse);
      token.cancel();
      advance(async, _wait);
      expect(p.done, isTrue);
      final o = p.value! as SubmitFailed;
      expect(o.failure.kind, UploadFailureKind.cancelled);
      expect(r.api.createCalls, 0);
      expect(r.files.live, 0);
    });

    fakeTest('TC-UPL-031 어떤 실패 뒤에도 폐기된 준비물의 임시 파일은 남지 않는다', (async) {
      for (final name in [
        'posts-create__400-upload-used.json',
        'posts-create__404-upload-not-found.json',
        'posts-create__401-unauthorized.json',
      ]) {
        final r = UploadRig()..api.create([name]);
        r.api.refreshReauth();
        final f = _Flow(r, async);
        f.failed(f.prepare());
        expect(r.files.live, 0, reason: name);
      }
    });
  });
}
