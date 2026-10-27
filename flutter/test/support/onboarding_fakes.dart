import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_client.dart';
import 'package:chalkak/core/network/api_config.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/push_registrar.dart';
import 'package:chalkak/features/auth/domain/signup_credentials.dart';
import 'package:chalkak/features/onboarding/data/api_sign_up_repository.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_use_case.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_sheet.dart'
    show LegalWebViewBuilder;
import 'package:chalkak/features/signature/data/api_signature_repository.dart';
import 'package:chalkak/features/signature/data/api_signature_uploader.dart';
import 'package:chalkak/features/signature/domain/change_signature_use_case.dart';
import 'package:chalkak/features/signature/domain/signature_drawing.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:chalkak/features/signature/domain/signature_renderer.dart';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';

import 'fake_adapter.dart';
import 'fakes.dart';
import 'net_harness.dart' show apiHost, v1;

export 'ui_helpers.dart';

// ---------------------------------------------------------------------------
// 고정 값 (shared/fixtures/onboarding, signature)
// ---------------------------------------------------------------------------

/// 가입 업로드 발급 fixture의 uploadUrl 경로(쿼리 제외).
const signupUploadPutPath = '/__upload/55555555-5555-4555-8555-555555555512';

/// 사인 변경 업로드 발급 fixture의 uploadUrl 경로(쿼리 제외).
const changeUploadPutPath = '/__upload/55555555-5555-4555-8555-555555555521';

const signupUploadsPath = '$v1/auth/social-signup/signature/uploads';
const signupPath = '$v1/auth/social-signup';
const socialLoginPath = '$v1/auth/social-login';
const refreshPath = '$v1/auth/refresh';
const meSignaturePath = '$v1/users/me/signature';
const meSignatureUploadsPath = '$v1/users/me/signature/uploads';

/// 가입 중 쓰는 idToken·rawNonce 쌍.
const kakaoCredentials = SignUpCredentials(
  idToken: 'kakao-id-token-1',
  rawNonce: 'raw-nonce-1',
);

/// 유효한 1x1 PNG. 미리보기 위젯이 실제로 디코딩해도 오류가 없다.
final Uint8List tinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

/// PNG 시그니처로 시작하는 [length]바이트. 크기 경계 테스트용(1,048,576 / 1,048,577).
Uint8List fakePng(int length) {
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  final bytes = Uint8List(length);
  for (var i = 0; i < signature.length && i < length; i++) {
    bytes[i] = signature[i];
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// 그리기 보조
// ---------------------------------------------------------------------------

/// 2:1 캔버스(400x200). 비율이 PNG와 같아 배치 식의 해석 차이가 결과에 영향을 주지 않는다.
const canvasW = 400.0;
const canvasH = 200.0;

SignatureDrawing blankDrawing() =>
    const SignatureDrawing(width: canvasW, height: canvasH);

/// 점들을 한 획으로 그린 사인.
SignatureDrawing strokeOf(List<(double, double)> points) {
  var d = blankDrawing();
  d = d.startStroke(points.first.$1, points.first.$2);
  for (final p in points.skip(1)) {
    d = d.addPoint(p.$1, p.$2);
  }
  return d;
}

/// 여러 획. 각 획은 점 목록이다.
SignatureDrawing strokesOf(List<List<(double, double)>> strokes) {
  var d = blankDrawing();
  for (final s in strokes) {
    d = d.startStroke(s.first.$1, s.first.$2);
    for (final p in s.skip(1)) {
      d = d.addPoint(p.$1, p.$2);
    }
  }
  return d;
}

/// 사인이 있는 대표 입력(물결 모양 한 획).
SignatureDrawing sampleDrawing() => strokeOf([
  (40, 100),
  (100, 40),
  (160, 160),
  (220, 40),
  (280, 160),
  (360, 100),
]);

// ---------------------------------------------------------------------------
// Fake
// ---------------------------------------------------------------------------

/// PNG를 만들지 않고 정해 둔 바이트를 돌려주는 렌더러.
class FakeSignatureRenderer implements SignatureRenderer {
  FakeSignatureRenderer([Uint8List? png]) : png = png ?? tinyPng;

  Uint8List png;
  Object? error;
  Completer<void>? gate;
  final List<SignatureDrawing> rendered = [];

  int get calls => rendered.length;

  @override
  Future<Uint8List> render(SignatureDrawing drawing) async {
    rendered.add(drawing);
    final g = gate;
    if (g != null) await g.future;
    final e = error;
    if (e != null) throw e;
    return png;
  }
}

class FakeExternalLinkLauncher implements ExternalLinkLauncher {
  bool result = true;
  final List<Uri> opened = [];

  @override
  Future<bool> open(Uri url) async {
    opened.add(url);
    return result;
  }
}

/// 웹뷰 대신 빈 영역을 그리는 [LegalWebViewBuilder]. 로드 성공·실패는 테스트가 부르지 않으면 일어나지 않는다.
Widget fakeLegalWebView(
  BuildContext context, {
  required Uri url,
  required int reloadCount,
  required VoidCallback onLoaded,
  required VoidCallback onError,
}) => const SizedBox.expand();

/// 서버 대신 스크립트로 답하는 [SignatureSubmitter]. 화면 상태·이벤트 테스트용.
class FakeSignatureSubmitter implements SignatureSubmitter {
  FakeSignatureSubmitter([SignatureSubmitOutcome? outcome])
    : outcome = outcome ?? const SignatureSubmitSucceeded();

  SignatureSubmitOutcome outcome;
  Completer<void>? gate;
  final List<Uint8List> submitted = [];
  final List<CancelToken> tokens = [];

  int get calls => submitted.length;

  @override
  Future<SignatureSubmitOutcome> submit(
    Uint8List png,
    CancelToken cancelToken,
  ) async {
    submitted.add(png);
    tokens.add(cancelToken);
    final g = gate;
    if (g != null) await g.future;
    return outcome;
  }
}

/// 호출 횟수만 센다. 실패하게 만들 수도 있다.
class CountingPushRegistrar implements PushRegistrar {
  int calls = 0;
  Object? error;

  @override
  Future<void> registerCurrentDevice() async {
    calls++;
    final e = error;
    if (e != null) throw e;
  }
}

// ---------------------------------------------------------------------------
// 실제 ApiClient + FakeAdapter 묶음 (저장소는 메모리)
// ---------------------------------------------------------------------------

class OnboardingHarness {
  OnboardingHarness({Session? session, String baseUrl = apiHost})
    : store = FakeTokenStore(session) {
    sessions = SessionManager(store: store);
    client = ApiClient(
      config: ApiConfig.parse(baseUrl),
      sessions: sessions,
      adapter: adapter,
      logSink: logs,
    );
    sessions.cleared.listen(clearedReasons.add);
    uploader = ApiSignatureUploader(client: client);
    signUp = SignUpUseCase(
      repository: ApiSignUpRepository(client: client),
      uploader: uploader,
      authRepository: ApiAuthRepository(client: client),
      sessions: sessions,
      pushRegistrar: push,
    );
    signatureRepository = ApiSignatureRepository(client: client);
    changeSignature = ChangeSignatureUseCase(
      repository: signatureRepository,
      uploader: uploader,
      sessions: sessions,
    );
  }

  final FakeAdapter adapter = FakeAdapter();
  final FakeTokenStore store;
  final FakeLogSink logs = FakeLogSink();
  final CountingPushRegistrar push = CountingPushRegistrar();
  final List<SessionClearReason> clearedReasons = [];
  late final SessionManager sessions;
  late final ApiClient client;
  late final ApiSignatureUploader uploader;
  late final SignUpUseCase signUp;
  late final ApiSignatureRepository signatureRepository;
  late final ChangeSignatureUseCase changeSignature;

  static FakeResponse fx(String fixture, {Duration delay = Duration.zero}) =>
      FakeResponse.fixture(fixture, delay: delay);

  // 가입
  void onSignupUploads(String fixture) =>
      adapter.on('POST', signupUploadsPath, [fx(fixture)]);

  void onSignupUploadsOk() =>
      onSignupUploads('onboarding/signup-uploads__success.json');

  void onSignupPut(String fixture) =>
      adapter.on('PUT', signupUploadPutPath, [fx(fixture)]);

  void onSignupPutOk() => onSignupPut('onboarding/presigned-put__ok.json');

  void onSignup(List<String> fixtures) =>
      adapter.on('POST', signupPath, [for (final f in fixtures) fx(f)]);

  void onSocialLogin(String fixture) =>
      adapter.on('POST', socialLoginPath, [fx(fixture)]);

  // 사인 변경·조회
  void onChangeUploads(String fixture) =>
      adapter.on('POST', meSignatureUploadsPath, [fx(fixture)]);

  void onChangeUploadsOk() =>
      onChangeUploads('signature/users-me-signature-uploads__success.json');

  void onChangePut(String fixture) =>
      adapter.on('PUT', changeUploadPutPath, [fx(fixture)]);

  void onChangePutOk() => onChangePut('signature/presigned-put__ok.json');

  void onConfirm(List<String> fixtures) =>
      adapter.on('PUT', meSignaturePath, [for (final f in fixtures) fx(f)]);

  void onGetSignature(List<String> fixtures) =>
      adapter.on('GET', meSignaturePath, [for (final f in fixtures) fx(f)]);

  void onRefresh(String fixture) =>
      adapter.on('POST', refreshPath, [fx(fixture)]);

  /// 가입 성공 경로 전체(발급 -> PUT -> 확정 200).
  void scriptSignupSuccess() {
    onSignupUploadsOk();
    onSignupPutOk();
    onSignup(['onboarding/signup__success.json']);
  }

  /// 사인 변경 성공 경로 전체.
  void scriptChangeSuccess() {
    onChangeUploadsOk();
    onChangePutOk();
    onConfirm(['signature/users-me-signature__put-success.json']);
  }

  /// presigned PUT 요청들.
  List<RecordedRequest> get putRequests => [
    for (final r in adapter.requests)
      if (r.path.startsWith('/__upload/')) r,
  ];

  /// [r]의 실제 본문 바이트(PNG 같은 이진 본문 확인용).
  Uint8List bodyBytes(RecordedRequest r) => r.bodyBytes!;

  /// 어댑터가 받은 요청을 `METHOD path` 문자열 순서로.
  List<String> get sequence => [
    for (final r in adapter.requests) '${r.method} ${r.path}',
  ];

  /// 어댑터가 받은 모든 요청의 본문을 합친 문자열(동의 필드 부재 검사용).
  String get allRequestBodies =>
      adapter.requests.map((r) => r.body ?? '').join('\n');
}
