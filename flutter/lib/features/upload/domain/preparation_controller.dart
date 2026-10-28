import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../edit/domain/photo_edit.dart';
import 'upload_models.dart';
import 'upload_preparer.dart';

/// 정책 발급 + 인코딩("준비")의 수명을 한 곳에서 맡는다.
///
/// 소유 규칙:
/// - 준비가 끝나면 [prepared]와 그 임시 파일은 이 컨트롤러가 소유한다.
/// - 제출 중에는 `PostSubmitter.submit`이 준비물을 넘겨받아 쓰고(갱신·삭제 포함), 결과의
///   `retained`만 이 컨트롤러가 다시 받는다([adopt]). 성공이거나 폐기됐으면 `null`이다.
/// - 새 준비를 시작하거나([begin]) [cancel]·[dispose]하면 진행 중 요청을 취소하고 가진 준비물의 파일을 지운다.
/// - 이전 세대의 늦은 결과는 새 상태를 덮지 않고 파일만 지운다.
class PreparationController {
  PreparationController({required this.preparer});

  final UploadPreparer preparer;

  PreparedUpload? _prepared;
  Future<void>? _running;
  CancelToken? _token;
  int _generation = 0;
  bool _disposed = false;

  /// 지금 제출에 쓸 수 있는 준비물. 없거나 아직 준비 중이면 null.
  PreparedUpload? get prepared => _prepared;

  /// 진행 중인 준비가 끝날 때까지 기다린다. 준비 중이 아니면 바로 끝난다.
  Future<void> get settled => _running ?? Future<void>.value();

  /// 이전 준비를 취소·삭제하고 새로 시작한다. 이 세대가 여전히 최신일 때만 [onFinished]를 부른다.
  /// 성공이면 failure가 null이고 [prepared]가 채워져 있다.
  void begin(
    Uint8List source,
    PhotoEdit edit, {
    required void Function(UploadFailure? failure) onFinished,
  }) {
    if (_disposed) return;
    cancel();
    final token = CancelToken();
    final generation = ++_generation;
    _token = token;
    _running = _run(source, edit, token, generation, onFinished);
  }

  Future<void> _run(
    Uint8List source,
    PhotoEdit edit,
    CancelToken token,
    int generation,
    void Function(UploadFailure? failure) onFinished,
  ) async {
    try {
      final prepared = await preparer.prepare(source, edit, cancelToken: token);
      if (_disposed || generation != _generation) {
        await preparer.discard(prepared);
        return;
      }
      _prepared = prepared;
      onFinished(null);
    } on UploadFailure catch (failure) {
      if (_disposed || generation != _generation) return;
      onFinished(failure);
    }
  }

  /// 제출이 끝난 뒤 돌려받은 준비물([retained])을 다시 소유한다. 파일은 지우지 않는다
  /// (이미 제출 쪽이 정리했거나 이어서 쓸 준비물이다).
  void adopt(PreparedUpload? retained) => _prepared = retained;

  /// 진행 중인 준비를 취소하고 가진 준비물의 임시 파일을 지운다.
  void cancel() {
    _generation++;
    _token?.cancel();
    _token = null;
    _running = null;
    final prepared = _prepared;
    _prepared = null;
    if (prepared != null) unawaited(preparer.discard(prepared));
  }

  void dispose() {
    if (_disposed) return;
    cancel();
    _disposed = true;
  }
}
