import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/domain/korean_particle.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-UPL-084 받침이 있으면 을: 하늘, 꽃, 우산', () {
    for (final word in ['하늘', '꽃', '우산']) {
      expect(UploadSuccessText.objectParticle(word), '을', reason: word);
    }
  });

  test('TC-UPL-084 받침이 없으면 를: 바다, 나무', () {
    for (final word in ['바다', '나무']) {
      expect(UploadSuccessText.objectParticle(word), '를', reason: word);
    }
  });

  test('TC-UPL-084 끝의 공백은 무시하고("겨울 " -> 을) 빈 주제·한글이 아닌 끝은 를이다', () {
    expect(UploadSuccessText.objectParticle('겨울 '), '을');
    expect(UploadSuccessText.objectParticle(''), '를');
    expect(UploadSuccessText.objectParticle('   '), '를');
    expect(UploadSuccessText.objectParticle('abc'), '를');
    expect(UploadSuccessText.objectParticle('3'), '를');
  });

  test('TC-UPL-084 REQ-UPL-060 기록 문구는 ‘주제’와 조사를 채운 문장이다', () {
    expect(UploadSuccessText.title('하늘'), '‘하늘’을 기록했어요.');
    expect(UploadSuccessText.title('바다'), '‘바다’를 기록했어요.');
    expect(
      Copy.fill(Copy.uploadSuccessTitle, {'주제': '꽃', '을/를': '을'}),
      UploadSuccessText.title('꽃'),
    );
  });

  test('TC-UPL-085 PENDING이면 검수 대기, 그 밖(VALIDATING)이면 사진 확인 중 문구이다', () {
    expect(
      UploadSuccessText.status(ModerationStatus.pending),
      Copy.uploadSuccessPending,
    );
    expect(
      UploadSuccessText.status(ModerationStatus.validating),
      Copy.uploadSuccessValidating,
    );
  });
}
