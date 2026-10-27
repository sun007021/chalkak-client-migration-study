import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:chalkak/features/signature/presentation/signature_failure_messages.dart';
import 'package:flutter_test/flutter_test.dart';

SignatureFailure _f(SignatureFailureKind k, [String? message]) =>
    SignatureFailure(k, serverMessage: message);

void main() {
  group('가입 문구', () {
    test('TC-ONB-041 연결 실패·타임아웃은 네트워크 문구다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.network)),
        Copy.signErrorNetwork,
      );
    });

    test('TC-ONB-033 TC-ONB-030 만료는 sign.error.expired다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.expired)),
        Copy.signErrorExpired,
      );
    });

    test('TC-ONB-032 TC-ONB-037 차단(403)은 서버 message를 그대로 보여 준다', () {
      expect(
        SignatureFailureMessages.signUp(
          _f(SignatureFailureKind.forbidden, '차단된 소셜 계정입니다.'),
        ),
        '차단된 소셜 계정입니다.',
      );
    });

    test('TC-ONB-037 서버 message가 없는 403은 일반 문구다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.forbidden)),
        Copy.onbSignupErrorGeneric,
      );
    });

    test('TC-ONB-035 사용할 수 없는 사인은 sign.error.invalid다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.invalid)),
        Copy.signErrorInvalid,
      );
    });

    test('TC-ONB-036 업로드 없음은 사인을 다시 업로드해 달라는 문구다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.reupload)),
        Copy.onbSignupErrorReupload,
      );
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.notFound)),
        Copy.onbSignupErrorReupload,
      );
    });

    test('TC-ONB-028 재시도 소진은 timeout 문구다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.timeout)),
        Copy.onbSignupErrorTimeout,
      );
    });

    test('TC-ONB-040 TC-ONB-042 그 밖의 실패는 일반 가입 실패 문구다', () {
      expect(
        SignatureFailureMessages.signUp(_f(SignatureFailureKind.generic)),
        Copy.onbSignupErrorGeneric,
      );
    });
  });

  group('변경 문구', () {
    test('TC-SIGN-034 연결 실패·타임아웃은 네트워크 문구다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.network)),
        Copy.signErrorNetwork,
      );
    });

    test('TC-SIGN-033 만료는 sign.error.expired다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.expired)),
        Copy.signErrorExpired,
      );
    });

    test('TC-SIGN-030 TC-SIGN-031 정지 회원(403)은 서버 message가 아니라 D-08 문구다', () {
      expect(
        SignatureFailureMessages.change(
          _f(SignatureFailureKind.forbidden, '차단된 회원입니다.'),
        ),
        Copy.authBannedSignature,
      );
    });

    test('TC-SIGN-028 SIGNATURE_REUPLOAD_REQUIRED는 다시 업로드 문구다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.reupload)),
        Copy.onbSignupErrorReupload,
      );
    });

    test('TC-SIGN-029 사용할 수 없는 사인은 sign.error.invalid다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.invalid)),
        Copy.signErrorInvalid,
      );
    });

    test('TC-SIGN-032 업로드 파일 없음(404)은 sign.change.error.not-found다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.notFound)),
        Copy.signChangeErrorNotFound,
      );
    });

    test('TC-SIGN-023 TC-SIGN-035 그 밖의 실패는 sign.change.error.generic이다', () {
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.generic)),
        Copy.signChangeErrorGeneric,
      );
      expect(
        SignatureFailureMessages.change(_f(SignatureFailureKind.timeout)),
        Copy.signChangeErrorGeneric,
      );
    });
  });
}
