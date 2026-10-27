import 'dart:convert';
import 'dart:io';

/// manifest.json 한 항목. 상태·메서드·경로는 fixture 파일이 아니라 여기에 있다.
class FixtureRoute {
  FixtureRoute({
    required this.fixture,
    required this.method,
    required this.path,
    required this.status,
    required this.query,
    required this.headers,
    required this.delayMs,
    required this.tc,
  });

  factory FixtureRoute.fromJson(Map<String, dynamic> json) => FixtureRoute(
    fixture: json['fixture'] as String,
    method: json['method'] as String,
    path: json['path'] as String,
    status: json['status'] as int?,
    query: _stringMap(json['query']),
    headers: _stringMap(json['headers']),
    delayMs: (json['delayMs'] as int?) ?? 0,
    tc: [...?(json['tc'] as List?)?.cast<String>()],
  );

  final String fixture;

  /// GET/POST/... 외에 `PUSH`, `NONE`(HTTP 아님)이 있다.
  final String method;
  final String path;

  /// 본문 예시(`_kind: request`)나 `_fault`는 null일 수 있다.
  final int? status;
  final Map<String, String> query;
  final Map<String, String> headers;
  final int delayMs;
  final List<String> tc;

  static Map<String, String> _stringMap(Object? value) => {
    for (final e in ((value as Map?) ?? const {}).entries)
      e.key as String: '${e.value}',
  };
}

/// fixture 파일을 예약 키(`_raw`, `_contentType`, `_fault`, `_kind`)까지 풀어 놓은 응답 묘사.
class FixtureResponse {
  FixtureResponse({
    required this.route,
    required this.json,
    required this.rawBody,
    required this.contentType,
    required this.fault,
    required this.kind,
  });

  final FixtureRoute route;

  /// 일반 JSON 응답 본문(예약 키가 없을 때). 그 외에는 파일 전체.
  final Map<String, dynamic> json;

  /// `_raw`가 있으면 그 문자열(빈 문자열 = 본문 없음). 없으면 null.
  final String? rawBody;

  /// `_contentType`, 없으면 `_raw`일 때 null, JSON이면 `application/json`.
  final String? contentType;

  /// `timeout` 또는 `disconnect`. 응답 없음.
  final String? fault;

  /// `push`, `request`, `case`, `storage`, `native`. HTTP 응답이 아닌 fixture.
  final String? kind;

  bool get isFault => fault != null;
  bool get isHttpResponse => fault == null && kind == null;

  /// 클라이언트가 실제로 받는 본문 문자열.
  String get bodyText => rawBody ?? jsonEncode(json);
}

/// `shared/fixtures/` 로더. 테스트 실행 위치와 무관하게 flutter/ 기준 `../shared/fixtures`를 찾는다.
abstract final class Fixture {
  static Directory? _root;
  static List<FixtureRoute>? _routes;

  static Directory get root => _root ??= _findRoot();

  static Directory _findRoot() {
    var dir = Directory.current.absolute;
    while (true) {
      final candidate = Directory('${dir.path}/../shared/fixtures');
      if (File('${dir.path}/pubspec.yaml').existsSync() &&
          candidate.existsSync()) {
        return Directory(candidate.resolveSymbolicLinksSync());
      }
      final parent = dir.parent;
      if (parent.path == dir.path) {
        throw StateError(
          'flutter/ 기준 ../shared/fixtures 를 찾을 수 없다 (cwd=${Directory.current.path})',
        );
      }
      dir = parent;
    }
  }

  /// `Fixture.load('common/error__business-400.json')` -> 파일 내용을 파싱한 JSON.
  static dynamic load(String name) {
    final file = File('${root.path}/$name');
    if (!file.existsSync()) {
      throw ArgumentError.value(name, 'name', 'fixture 파일 없음');
    }
    return jsonDecode(file.readAsStringSync());
  }

  static List<FixtureRoute> get routes => _routes ??= [
    for (final e in (load('manifest.json') as List))
      FixtureRoute.fromJson(e as Map<String, dynamic>),
  ];

  /// manifest 항목. 없으면 [ArgumentError].
  static FixtureRoute route(String name) {
    for (final r in routes) {
      if (r.fixture == name) return r;
    }
    throw ArgumentError.value(name, 'name', 'manifest에 없는 fixture');
  }

  /// 예약 키를 해석한 응답 묘사.
  static FixtureResponse response(String name) {
    final json = (load(name) as Map).cast<String, dynamic>();
    final raw = json['_raw'] as String?;
    return FixtureResponse(
      route: route(name),
      json: json,
      rawBody: raw,
      contentType:
          json['_contentType'] as String? ??
          (raw == null ? 'application/json' : null),
      fault: json['_fault'] as String?,
      kind: json['_kind'] as String?,
    );
  }
}
