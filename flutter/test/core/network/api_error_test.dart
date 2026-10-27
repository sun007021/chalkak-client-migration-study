import 'package:chalkak/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fixtures.dart';

/// manifest의 상태와 fixture 본문으로 만든 ApiError.
ApiError _parse(String name) {
  final f = Fixture.response(name);
  return ApiError.fromErrorResponse(f.route.status!, f.bodyText);
}

String _message(String name) =>
    Fixture.response(name).json['message']! as String;

void main() {
  group('오류 바디 파싱', () {
    test('TC-NET-001 {errorCode, message}를 ApiError로 바꾸고 message를 보존한다', () {
      const name = 'common/error__business-400.json';
      final e = _parse(name);
      expect(e.kind, ApiErrorKind.server);
      expect(e.status, 400);
      expect(e.errorCode, ApiErrorCode.businessError);
      expect(e.message, _message(name));
    });

    test('TC-NET-002 알 수 없는 errorCode는 BUSINESS_ERROR로 취급하고 원문 코드를 보존한다', () {
      final e = _parse('common/error__unknown-error-code.json');
      expect(e.errorCode, ApiErrorCode.businessError);
      expect(e.rawErrorCode, 'SOMETHING_NEW');
      expect(e.status, 400);
      expect(
        ApiErrorCode.fromWire('SOMETHING_NEW'),
        ApiErrorCode.businessError,
      );
    });

    test('TC-NET-003 RESOURCE_STATE_CHANGED, USER_METRICS_AGGREGATION_IN_PROGRESS는 '
        'BUSINESS_ERROR와 같게 처리한다', () {
      expect(
        _parse('common/error__resource-state-changed.json').errorCode,
        ApiErrorCode.businessError,
      );
      for (final code in [
        'RESOURCE_STATE_CHANGED',
        'USER_METRICS_AGGREGATION_IN_PROGRESS',
      ]) {
        final e = ApiError.fromErrorResponse(
          400,
          '{"errorCode":"$code","message":"m"}',
        );
        expect(e.errorCode, ApiErrorCode.businessError, reason: code);
      }
    });

    test('TC-NET-001 알려진 errorCode 8종을 모두 해석한다', () {
      const map = {
        'BUSINESS_ERROR': ApiErrorCode.businessError,
        'UNAUTHORIZED': ApiErrorCode.unauthorized,
        'REAUTHENTICATION_REQUIRED': ApiErrorCode.reauthenticationRequired,
        'FORBIDDEN': ApiErrorCode.forbidden,
        'INTERNAL_ERROR': ApiErrorCode.internalError,
        'SIGNATURE_REGISTRATION_REQUIRED':
            ApiErrorCode.signatureRegistrationRequired,
        'SIGNATURE_REUPLOAD_REQUIRED': ApiErrorCode.signatureReuploadRequired,
        'SIGNATURE_PROCESSING_PENDING': ApiErrorCode.signatureProcessingPending,
      };
      map.forEach((wire, code) {
        expect(ApiErrorCode.fromWire(wire), code, reason: wire);
      });
    });

    test('TC-NET-004 HTML 게이트웨이 본문은 status만 가진 server 오류다', () {
      final e = _parse('common/error__bad-gateway-html.json');
      expect(e.kind, ApiErrorKind.server);
      expect(e.status, 502);
      expect(e.errorCode, isNull);
    });

    test('TC-NET-004 빈 본문·null 본문·errorCode 없는 JSON에서도 status를 보존한다', () {
      expect(
        Fixture.response('common/error__empty-body-500.json').bodyText,
        isEmpty,
      );
      for (final body in <String?>['', null, '{}', '{"message":"m"}', '[]']) {
        final e = ApiError.fromErrorResponse(500, body);
        expect(e.status, 500, reason: '$body');
        expect(e.errorCode, isNull, reason: '$body');
        expect(e.kind, ApiErrorKind.server, reason: '$body');
      }
    });

    test('TC-NET-033 TC-NET-034 필터 단계 403과 404 BUSINESS_ERROR를 파싱한다', () {
      final f = _parse('common/error__forbidden-no-permission.json');
      expect((f.status, f.errorCode), (403, ApiErrorCode.forbidden));
      final n = _parse('common/error__not-found-api.json');
      expect((n.status, n.errorCode), (404, ApiErrorCode.businessError));
    });

    test('TC-NET-035 검증 오류 400의 message는 보존하되 분기 값이 아니다', () {
      final e = _parse('common/error__validation-format.json');
      expect(e.errorCode, ApiErrorCode.businessError);
      expect(e.message, contains('date'));
    });

    test('TC-NET-036 500 INTERNAL_ERROR를 파싱한다', () {
      final e = _parse('common/error__internal-500.json');
      expect((e.status, e.errorCode), (500, ApiErrorCode.internalError));
    });
  });

  group('오류 종류 구분', () {
    test('TC-NET-045 TC-NET-048 network, cancelled, invalidResponse, config는 서로 다른 종류다', () {
      expect(ApiError.network().isNetwork, isTrue);
      expect(ApiError.cancelled().isCancelled, isTrue);
      expect(ApiError.cancelled().isNetwork, isFalse);
      expect(ApiError.invalidResponse(status: 200).isInvalidResponse, isTrue);
      expect(ApiError.invalidResponse(status: 200).status, 200);
      expect(ApiError.config('missing').isConfig, isTrue);
    });

    test(
      'TC-NET-012 isUnauthorized/isReauthenticationRequired는 status와 코드로 판정한다',
      () {
        final u = ApiError.fromErrorResponse(
          401,
          '{"errorCode":"UNAUTHORIZED","message":"m"}',
        );
        final r = ApiError.fromErrorResponse(
          401,
          '{"errorCode":"REAUTHENTICATION_REQUIRED","message":"m"}',
        );
        expect(u.isUnauthorized, isTrue);
        expect(u.isReauthenticationRequired, isFalse);
        expect(r.isReauthenticationRequired, isTrue);
        expect(r.isUnauthorized, isFalse);
      },
    );

    test('TC-NET-001 message 문구가 같아도 errorCode가 다르면 다른 오류다(문구로 분기하지 않는다)', () {
      final a = ApiError.fromErrorResponse(
        400,
        '{"errorCode":"BUSINESS_ERROR","message":"같은 문구"}',
      );
      final b = ApiError.fromErrorResponse(
        403,
        '{"errorCode":"FORBIDDEN","message":"같은 문구"}',
      );
      expect(a.errorCode, isNot(b.errorCode));
    });
  });
}
