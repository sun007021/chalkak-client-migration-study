import 'dart:async';

import 'package:flutter/foundation.dart';

import '../domain/signature_repository.dart';
import 'signature_draw_view_model.dart' show SignatureMessage;

enum SignatureCardStatus {
  /// 아직 한 번도 불러오지 않았다.
  idle,

  /// 조회 중. 이전 사인이 있으면 [SignatureCardState.imageUrl]에 그대로 남긴다.
  loading,

  /// 조회 성공.
  content,

  /// 400 SIGNATURE_REGISTRATION_REQUIRED. 이미지 없이 "변경하기"만 보인다(오류 토스트 없음).
  registrationRequired,
}

class SignatureCardState {
  const SignatureCardState({
    this.status = SignatureCardStatus.idle,
    this.imageUrl,
    this.toast,
  });

  final SignatureCardStatus status;

  /// 썸네일(없으면 원본). 불러온 적이 없거나 재등록이 필요하면 null.
  final String? imageUrl;

  /// 조회 실패 토스트(`sign.load.error`). 같은 문구가 연달아도 id가 다르다.
  final SignatureMessage? toast;
}

/// 설정 사인 카드의 상태(REQ-SIGN-013~017, TC-SIGN-026, 027, 039, 040). 카드 위젯은 SET PR 몫.
/// - 게스트면 [load]는 API를 부르지 않고 상태를 바꾸지 않는다.
/// - [load]: 진행 중이면 중복 요청하지 않는다. 성공은 `CurrentSignature.displayUrl`,
///   400 SIGNATURE_REGISTRATION_REQUIRED는 registrationRequired(이미지 비움, 토스트 없음),
///   그 밖의 실패는 보이던 사인을 유지하고 `Copy.signLoadError` 토스트(401은 토스트 없음).
/// - [onSettingsTabShown]: 설정 탭이 보일 때마다 [load]를 부른다.
/// - [dispose] 뒤에 도착한 응답은 상태에 반영하지 않는다.
class SignatureCardViewModel extends ChangeNotifier {
  SignatureCardViewModel({
    required SignatureRepository repository,
    required bool isGuest,
  });

  SignatureCardState get state => throw UnimplementedError();

  Future<void> load() => throw UnimplementedError();
  Future<void> onSettingsTabShown() => throw UnimplementedError();
}
