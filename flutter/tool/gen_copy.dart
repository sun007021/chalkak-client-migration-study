// shared/copy/ko.json -> lib/core/copy/ko.g.dart 생성기.
//
//   dart run tool/gen_copy.dart           생성 파일을 다시 쓴다
//   dart run tool/gen_copy.dart --check   생성 결과가 커밋본과 다르면 종료 코드 1
//
// 키 규칙: `.`과 `-`로 나눠 lowerCamelCase로 잇는다. `ai.card.completed` -> `aiCardCompleted`.
import 'dart:convert';
import 'dart:io';

const defaultJsonPath = '../shared/copy/ko.json';
const defaultOutPath = 'lib/core/copy/ko.g.dart';

/// `ai.error.not-viewable` -> `aiErrorNotViewable`.
String keyToIdentifier(String key) {
  final parts = key.split(RegExp(r'[.\-]')).where((p) => p.isNotEmpty);
  final buffer = StringBuffer();
  var first = true;
  for (final part in parts) {
    buffer.write(first ? part : '${part[0].toUpperCase()}${part.substring(1)}');
    first = false;
  }
  return buffer.toString();
}

/// dart format이 바꾸지 않도록 80자를 넘으면 값을 다음 줄로 내린다.
String _constLine(String id, String literal) {
  final oneLine = '  static const $id = $literal;';
  return oneLine.length <= 80
      ? oneLine
      : '  static const $id =\n      $literal;';
}

String _dartString(String value) {
  final escaped = value
      .replaceAll(r'\', r'\\')
      .replaceAll("'", r"\'")
      .replaceAll(r'$', r'\$')
      .replaceAll('\n', r'\n')
      .replaceAll('\r', r'\r');
  return "'$escaped'";
}

/// ko.json 본문으로 생성 파일 내용을 만든다. 식별자 충돌이면 [StateError].
String generateCopySource(String jsonText) {
  final decoded = jsonDecode(jsonText) as Map<String, dynamic>;
  final seen = <String, String>{};
  final out = StringBuffer()
    ..writeln('// GENERATED FILE. 직접 고치지 않는다.')
    ..writeln('// 원본: shared/copy/ko.json  생성: dart run tool/gen_copy.dart')
    ..writeln('// ignore_for_file: lines_longer_than_80_chars')
    ..writeln()
    ..writeln('/// 사용자 문구. 키 `a.b-c` -> `aBC`.')
    ..writeln('abstract final class Copy {');
  for (final entry in decoded.entries) {
    final id = keyToIdentifier(entry.key);
    final previous = seen[id];
    if (previous != null) {
      throw StateError('식별자 충돌: "$previous" 와 "${entry.key}" -> $id');
    }
    seen[id] = entry.key;
    out
      ..writeln('  /// `${entry.key}`')
      ..writeln(_constLine(id, _dartString(entry.value as String)))
      ..writeln();
  }
  out
    ..writeln('  /// `{주제}` 같은 플레이스홀더를 [values]로 바꾼다.')
    ..writeln('  /// 값에 없는 플레이스홀더는 그대로 둔다.')
    ..writeln(
      '  static String fill(String template, Map<String, String> values) {',
    )
    ..writeln('    var result = template;')
    ..writeln('    values.forEach((name, value) {')
    ..writeln(r"      result = result.replaceAll('{$name}', value);")
    ..writeln('    });')
    ..writeln('    return result;')
    ..writeln('  }')
    ..writeln('}');
  return out.toString();
}

int runGenCopy(List<String> args) {
  final check = args.contains('--check');
  final jsonFile = File(defaultJsonPath);
  if (!jsonFile.existsSync()) {
    stderr.writeln('없음: $defaultJsonPath (flutter/ 에서 실행)');
    return 2;
  }
  final generated = generateCopySource(jsonFile.readAsStringSync());
  final outFile = File(defaultOutPath);
  if (check) {
    final current = outFile.existsSync() ? outFile.readAsStringSync() : '';
    if (current != generated) {
      stderr.writeln(
        '$defaultOutPath 가 ko.json과 다르다. dart run tool/gen_copy.dart 후 커밋.',
      );
      return 1;
    }
    return 0;
  }
  outFile.writeAsStringSync(generated);
  stdout.writeln('wrote $defaultOutPath');
  return 0;
}

void main(List<String> args) => exitCode = runGenCopy(args);
