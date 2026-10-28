import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';

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
    this.loadFailed = false,
  });

  final SignatureCardStatus status;

  /// 썸네일(없으면 원본). 불러온 적이 없거나 재등록이 필요하면 null.
  final String? imageUrl;

  /// 조회 실패 토스트(`sign.load.error`). 같은 문구가 연달아도 id가 다르다.
  final SignatureMessage? toast;

  /// 보여 줄 사인이 없는 채로 조회가 실패했다(TC-SET-006, D-20). 설정 카드가 인라인 오류
  /// (`Copy.signLoadError`)와 "다시 불러오기"를 보인다. 보이던 사인이 있으면 false(유지, TC-SET-005).
  /// 다음 조회가 시작되거나 성공하면 false로 돌아간다.
  final bool loadFailed;
}

/// 설정 사인 카드의 상태(REQ-SIGN-013~017, TC-SIGN-026, 027, 039, 040). 카드 위젯은 SET PR 몫.
/// - 게스트면 [load]는 API를 부르지 않고 상태를 바꾸지 않는다.
/// - [load]: 진행 중이면 중복 요청하지 않는다. 성공은 `CurrentSignature.displayUrl`,
///   400 SIGNATURE_REGISTRATION_REQUIRED는 registrationRequired(이미지 비움, 토스트 없음),
///   그 밖의 실패는 보이던 사인을 유지하고 `Copy.signLoadError` 토스트(401은 토스트 없음).
/// - [onSettingsTabShown]: 설정 탭이 보일 때마다 [load]를 부른다.
/// - [dispose] 뒤에 도착한 응답은 상태에 반영하지 않는다.
class SignatureCardViewModel extends ChangeNotifier {
  SignatureCardViewModel({required this._repository, required this._isGuest});

  final SignatureRepository _repository;
  final bool _isGuest;
  final CancelToken _cancelToken = CancelToken();

  SignatureCardState _state = const SignatureCardState();
  SignatureCardStatus _settledStatus = SignatureCardStatus.idle;
  int _toastSequence = 0;
  bool _loading = false;
  bool _disposed = false;

  /// 사인 변경·계정 전환마다 올린다. 이전 세대에 시작된 조회의 결과는 버린다.
  int _epoch = 0;

  SignatureCardState get state => _state;

  Future<void> load() async {
    if (_isGuest || _loading || _disposed) return;
    final epoch = _epoch;
    _loading = true;
    _setState(
      SignatureCardState(
        status: SignatureCardStatus.loading,
        imageUrl: _state.imageUrl,
      ),
    );
    try {
      final signature = await _repository.fetchCurrent(
        cancelToken: _cancelToken,
      );
      if (epoch != _epoch) return;
      _settle(SignatureCardStatus.content, imageUrl: signature.displayUrl);
    } on ApiError catch (e) {
      if (epoch != _epoch) return;
      _onFailure(e);
    } on Object {
      // 예상 밖의 실패도 조회 실패와 같게 다룬다(화면이 멈추지 않게).
      if (epoch != _epoch) return;
      _onFailure(ApiError.invalidResponse());
    } finally {
      // 새 세대가 시작한 조회의 진행 표시를 이전 세대가 지우지 않는다.
      if (epoch == _epoch) _loading = false;
    }
  }

  Future<void> onSettingsTabShown() => load();

  /// 사인 변경이 성공해 설정으로 돌아왔다(D-18, TC-SET-009, 011).
  /// 변경 전에 시작된 조회는 진행 중이어도 결과를 버리고, 새로 `GET`을 보내 그 썸네일(null이면 원본)로
  /// 바꾼다. 변경 요청의 응답 URL은 쓰지 않는다. 변경이 실패한 경우에는 부르지 않으며 진행 중이던
  /// 조회는 그대로 반영된다(TC-SET-010).
  Future<void> onSignatureChanged() {
    if (_isGuest || _disposed) return Future<void>.value();
    _epoch++;
    _loading = false;
    return load();
  }

  /// 계정 전환·로그아웃 때 보이던 사인과 진행 중 조회를 비운다(idle로). 늦게 도착한 이전 계정의
  /// 응답은 반영하지 않는다(TC-SET-037).
  void reset() {
    if (_disposed) return;
    _epoch++;
    _loading = false;
    _settledStatus = SignatureCardStatus.idle;
    _setState(const SignatureCardState());
  }

  void _onFailure(ApiError error) {
    if (error.errorCode == ApiErrorCode.signatureRegistrationRequired) {
      _settle(SignatureCardStatus.registrationRequired);
    } else if (error.isCancelled || error.status == 401) {
      // 401의 로그인 이동은 앱이 맡는다. 토스트 없이 이전 모습으로 돌아간다.
      _settle(_settledStatus, imageUrl: _state.imageUrl);
    } else {
      _settle(
        _settledStatus,
        imageUrl: _state.imageUrl,
        toast: SignatureMessage(id: ++_toastSequence, text: Copy.signLoadError),
        // 보여 줄 사인이 없을 때만 카드가 인라인 오류를 보인다(보이던 사인은 유지).
        loadFailed: _state.imageUrl == null,
      );
    }
  }

  void _settle(
    SignatureCardStatus status, {
    String? imageUrl,
    SignatureMessage? toast,
    bool loadFailed = false,
  }) {
    _settledStatus = status;
    _setState(
      SignatureCardState(
        status: status,
        imageUrl: imageUrl,
        toast: toast,
        loadFailed: loadFailed,
      ),
    );
  }

  void _setState(SignatureCardState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelToken.cancel();
    super.dispose();
  }
}
