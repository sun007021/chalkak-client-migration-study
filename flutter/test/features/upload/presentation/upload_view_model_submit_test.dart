import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart' show t0;
import '../../../support/upload_fakes.dart';
import 'upload_vm_driver.dart';

void main() {
  group('제출 진행 (REQ-UPL-037~040)', () {
    uploadVmTest(
      'TC-UPL-060 성공하면 성공 이벤트에 주제·날짜·상태를 담고 PENDING·VALIDATING이 구분된다',
      (d) {
        d.startScreen();
        d.pickAndComplete();
        d.submit();
        final ok = d.lastEvent<UploadSucceeded>();
        expect(ok.moderationStatus, ModerationStatus.pending);
        expect(ok.topicDate, d.rig.topicDate);
        expect(ok.topicTitle, d.state.topicTitle);

        final v = UploadDriver(d.async);
        v.rig.api.create(['posts-create__201-validating.json']);
        v.startScreen();
        v.pickAndComplete();
        v.submit();
        expect(
          v.lastEvent<UploadSucceeded>().moderationStatus,
          ModerationStatus.validating,
        );
        v.dispose();
      },
    );

    uploadVmTest('TC-UPL-048 준비 중 전시하기는 전시 중 상태로 기다렸다가 자동으로 PUT·POST를 진행한다', (
      d,
    ) {
      d.startScreen();
      d.rig.api.policy([
        'posts-uploads__issued.json',
      ], delay: const Duration(seconds: 3));
      d.pickAlbum();
      d.completeEdit();
      expect(d.state.preparation, PreparationStatus.preparing);
      d.vm.onSubmitPressed();
      d.tick(const Duration(milliseconds: 500));
      expect(d.state.isSubmitting, isTrue);
      expect(d.rig.api.putCalls, 0);
      d.tick(const Duration(seconds: 10));
      expect(d.rig.api.putCalls, 1);
      expect(d.rig.api.createCalls, 1);
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
    });

    uploadVmTest(
      'TC-UPL-013 자정이 지난 뒤 제출해도 진입 때 고정한 topicDate·topicId를 쓰고 시계로 다시 계산하지 않는다',
      (d) {
        d.startScreen();
        d.pickAndComplete();
        final topicCalls = d.rig.home.topicCalls;
        // KST 00:01(다음 날)로 시계를 옮긴다. 진입은 23:59:30이었다고 본다.
        withClock(
          Clock.fixed(t0.add(const Duration(hours: 12, minutes: 1))),
          () {
            d.submit();
          },
        );
        expect(d.rig.api.creates.single.jsonBody!['topicId'], isNotEmpty);
        expect(d.state.topicDate, d.rig.topicDate);
        expect(d.rig.home.topicCalls, topicCalls, reason: '주제를 다시 조회하지 않는다');
        expect(d.rig.home.todayCalls, 0);
        expect(
          d.events.whereType<UploadSucceeded>().single.topicDate,
          d.rig.topicDate,
        );
      },
    );

    uploadVmTest('TC-UPL-073 전시하기를 연타해도 PUT·POST는 각 1회이고 완료 뒤 반복 탭은 무시된다', (d) {
      d.startScreen();
      d.rig.api.put(['s3-put__200.json'], delay: const Duration(seconds: 2));
      d.pickAndComplete();
      for (var i = 0; i < 5; i++) {
        d.vm.onSubmitPressed();
      }
      d.tick(const Duration(seconds: 10));
      d.vm.onSubmitPressed();
      d.vm.onSubmitPressed();
      d.tick(const Duration(seconds: 10));
      expect(d.rig.api.putCalls, 1);
      expect(d.rig.api.createCalls, 1);
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
    });

    uploadVmTest('TC-UPL-082 앞뒤 공백을 제거한 제목을 보내고 공백만 입력하면 제목 없음(null)이다', (d) {
      d.startScreen();
      d.vm.onTitleChanged(' 가나다라마바사아자차 ');
      d.pickAndComplete();
      d.submit();
      expect(d.rig.api.creates.single.jsonBody!['title'], '가나다라마바사아자차');

      final blank = UploadDriver(d.async);
      blank.startScreen();
      blank.vm.onTitleChanged('   ');
      blank.pickAndComplete();
      blank.submit();
      expect(blank.rig.api.creates.single.jsonBody!['title'], isNull);
      blank.dispose();
    });
  });

  group('실패 처리 (REQ-UPL-047, 051~059)', () {
    uploadVmTest('TC-UPL-074 TC-UPL-068 제출이 실패하면 사진·제목을 유지하고 다시 제출할 수 있다', (d) {
      d.startScreen();
      d.rig.api.create([
        'posts-create__500-server-error.json',
        'posts-create__201-pending.json',
      ]);
      d.vm.onTitleChanged('가을');
      d.pickAndComplete();
      d.submit();
      expect(d.state.error, Copy.uploadErrorCreate);
      expect(d.state.isSubmitting, isFalse);
      expect(d.state.photo, isNotNull);
      expect(d.state.title, '가을');
      expect(d.rig.api.createCalls, 1);
      d.submit();
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
      expect(d.state.error, isNull);
    });

    uploadVmTest(
      'TC-UPL-064 처리 거절 400은 서버 message를 보이고 다음 전시하기가 정책 발급부터 다시 한다',
      (d) {
        d.startScreen();
        d.rig.api.create([
          'posts-create__400-rejected-too-large.json',
          'posts-create__201-pending.json',
        ]);
        d.pickAndComplete();
        d.submit();
        expect(d.state.error, '더 작은 용량의 이미지를 업로드해 주세요.');
        expect(d.state.preparation, PreparationStatus.none);
        expect(d.state.photo, isNotNull);
        expect(d.rig.files.live, 0);
        d.submit();
        expect(d.rig.api.policyCalls, 2);
        expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
      },
    );

    uploadVmTest('TC-UPL-055 PUT이 거절되면 업로드 실패 문구이고 다음 전시하기는 정책 발급부터 다시 한다', (
      d,
    ) {
      d.startScreen();
      d.rig.api.putResponses([
        up('s3-put__403-signature-mismatch.json'),
        up('s3-put__200.json'),
      ]);
      d.pickAndComplete();
      d.submit();
      expect(d.state.error, Copy.uploadErrorUpload);
      expect(d.state.photo, isNotNull);
      d.submit();
      expect(d.rig.api.policyCalls, 2);
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
    });

    uploadVmTest('TC-UPL-067 정지 회원 403은 정지 문구이고 재요청하지 않는다', (d) {
      d.startScreen();
      d.rig.api.create(['posts-create__403-banned.json']);
      d.pickAndComplete();
      d.submit();
      expect(d.state.error, Copy.uploadGateBanned);
      expect(d.rig.api.createCalls, 1);
    });

    uploadVmTest(
      'TC-UPL-069 응답 유실 + today isPosted=true면 성공 이벤트가 한 번만 나가고 POST는 재전송하지 않는다',
      (d) {
        d.startScreen();
        d.rig.api.create(['posts-create__timeout.json']);
        d.rig.home.today([fx('home/posts-today__posted-validating.json')]);
        d.pickAndComplete();
        d.submit(const Duration(minutes: 2));
        final ok = d.events.whereType<UploadSucceeded>().single;
        expect(ok.moderationStatus, ModerationStatus.validating);
        expect(d.rig.api.createCalls, 1);
      },
    );

    uploadVmTest(
      'TC-UPL-070 응답 유실 + isPosted=false면 네트워크 문구이고 같은 uploadId로 다시 제출한다',
      (d) {
        d.startScreen();
        d.rig.api.createResponses([
          up('posts-create__timeout.json'),
          up('posts-create__201-pending.json'),
        ]);
        d.pickAndComplete();
        d.submit(const Duration(minutes: 2));
        expect(d.state.error, Copy.uploadErrorNetwork);
        expect(d.state.photo, isNotNull);
        d.submit();
        expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
        expect(d.rig.api.policyCalls, 1);
        final ids = d.rig.api.creates.map((q) => q.jsonBody!['photoUploadId']);
        expect(ids.toSet(), hasLength(1));
      },
    );

    uploadVmTest('TC-UPL-066 TC-UPL-078 재인증이 필요하면 로그인 이벤트를 내고 임시 파일·정책을 지운다', (
      d,
    ) {
      d.startScreen();
      d.rig.api.create(['posts-create__401-unauthorized.json']);
      d.rig.api.refreshReauth();
      d.vm.onTitleChanged('가을');
      d.pickAndComplete();
      d.submit();
      expect(d.events.whereType<UploadLoginRequired>(), hasLength(1));
      expect(d.events.whereType<UploadSucceeded>(), isEmpty);
      expect(d.rig.files.live, 0);
      expect(d.state.photo, isNotNull, reason: '입력 상태는 유지(스펙 확인 필요 참고)');
      expect(d.state.title, '가을');
    });

    uploadVmTest(
      'TC-UPL-079 제출 중 화면을 닫으면 PUT을 취소하고 임시 파일을 지우며 성공 이벤트를 내지 않는다',
      (d) {
        d.startScreen();
        d.rig.api.put(['s3-put__200.json'], delay: const Duration(seconds: 20));
        d.pickAndComplete();
        d.vm.onSubmitPressed();
        d.tick(const Duration(seconds: 2));
        d.dispose();
        d.tick(const Duration(seconds: 30));
        expect(d.events.whereType<UploadSucceeded>(), isEmpty);
        expect(d.rig.api.createCalls, 0);
        expect(d.rig.files.live, 0);
      },
    );
  });
}
