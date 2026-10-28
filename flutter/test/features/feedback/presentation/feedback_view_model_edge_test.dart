import 'package:chalkak/core/copy/ko.g.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/feedback_fakes.dart';
import '../../../support/net_harness.dart' show advance;

const _created = 'feedback/feedbacks__created.json';

/// 화면이 사라진 뒤의 입력·전송과 연타.
void main() {
  fakeTest('TC-FDBK-029 dispose 뒤의 입력과 전송은 요청도 상태 변화도 만들지 않는다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    r.vm.onTextChanged('내용');
    r.vm.dispose();
    r.vm.onTextChanged('다른 내용');
    r.vm.send();
    advance(async, const Duration(seconds: 1));
    expect(r.posts, 0);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-FDBK-029 전송 시작 직후 dispose하면 요청이 나가지 않거나 결과가 버려진다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    r.vm.onTextChanged('내용');
    r.vm.send();
    r.vm.dispose();
    advance(async, const Duration(seconds: 3));
    expect(r.toast.messages, isEmpty);
    expect(r.events, isEmpty);
  });

  fakeTest('TC-FDBK-019 성공 직후 화면이 닫히기 전에 보내기를 다시 눌러도 요청은 늘지 않는다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    r.sendText(async, '내용');
    r.vm.send();
    advance(async, const Duration(seconds: 1));
    expect(r.posts, 1);
  });

  fakeTest('REQ-FDBK-014 작성 중 훅은 화면을 연 적이 없으면 닫을 때도 부르지 않는다', (async) {
    final r = FeedbackRig();
    r.vm.dispose();
    expect(r.composing, isEmpty);
  });

  fakeTest('TC-FDBK-021 400의 message가 비어 있으면 입력 검증 문구로 대신한다', (async) {
    final r = FeedbackRig();
    r.onPost([fx('feedback/feedbacks__bad-request-blank.json')]);
    r.sendText(async, '내용');
    expect(r.state.errorMessage, isNotEmpty);
    expect(r.state.errorMessage, isNot(Copy.fdbkErrorGeneric));
  });

  fakeTest('REQ-FDBK-006 전송 중에는 입력이 바뀌지 않고 실패하면 보낸 내용이 그대로 남는다', (async) {
    final r = FeedbackRig();
    r.onPost([fx('feedback/feedbacks__internal-error.json')]);
    r.vm.onTextChanged('보낸 내용');
    r.vm.send();
    r.vm.onTextChanged('전송 중 수정');
    expect(r.state.text, '보낸 내용');
    advance(async, const Duration(seconds: 10));
    expect(r.state.text, '보낸 내용');
    r.vm.onTextChanged('실패 뒤 수정');
    expect(r.state.text, '실패 뒤 수정');
  });
}
