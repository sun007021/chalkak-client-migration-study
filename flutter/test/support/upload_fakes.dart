import 'dart:async';
import 'dart:typed_data';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/auto_adjuster.dart';
import 'package:chalkak/features/edit/domain/edit_source_loader.dart';
import 'package:chalkak/features/edit/domain/image_codec.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/edit/domain/photo_edit_renderer.dart';
import 'package:chalkak/features/edit/domain/rgba_image.dart';
import 'package:chalkak/features/home/data/api_home_repository.dart';
import 'package:chalkak/features/upload/data/api_post_upload_repository.dart';
import 'package:chalkak/features/upload/data/api_upload_topic_source.dart';
import 'package:chalkak/features/upload/domain/gallery_saver.dart';
import 'package:chalkak/features/upload/domain/monotonic_clock.dart';
import 'package:chalkak/features/upload/domain/photo_file_store.dart';
import 'package:chalkak/features/upload/domain/photo_picker.dart';
import 'package:chalkak/features/upload/domain/post_image_encoder.dart';
import 'package:chalkak/features/upload/domain/post_submitter.dart';
import 'package:chalkak/features/upload/domain/upload_preparer.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:fake_async/fake_async.dart';

import 'auth_fakes.dart';
import 'fake_adapter.dart';
import 'fake_analytics_tracker.dart';
import 'home_fakes.dart';
import 'net_harness.dart' show sessionAt, settle, t0, v1;

/// 업로드 정책 응답 fixture(`upload/` 폴더).
FakeResponse up(String name, {Duration delay = Duration.zero}) =>
    FakeResponse.fixture('upload/$name', delay: delay);

/// 작은 더미 "사진" 바이트(비어 있지 않음). 디코딩은 [FakeImageDecoder]가 흉내 낸다.
Uint8List photoBytes([int seed = 1]) =>
    Uint8List.fromList(List<int>.generate(16, (i) => (seed + i) & 0xff));

/// 픽셀 없이 크기만 가진 이미지(크기 추적 테스트용). 큰 이미지를 실제로 만들지 않는다.
RgbaImage sizedImage(int width, int height) =>
    RgbaImage(width: width, height: height, rgba: Uint8List(0));

/// 채널 값이 모두 들어 있는 작은 실제 이미지.
RgbaImage pixelImage(
  int width,
  int height,
  List<int> Function(int x, int y) color,
) {
  final data = Uint8List(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final c = color(x, y);
      final o = (y * width + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return RgbaImage(width: width, height: height, rgba: data);
}

/// 선택기 Fake. 결과를 [Completer]로 걸 수 있어 "사진 A 로딩 중 B 선택" 순서를 만든다.
class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({this.isCameraAvailable = true});

  @override
  bool isCameraAvailable;

  int albumCalls = 0;
  int cameraCalls = 0;

  /// 다음 호출이 돌려줄 결과 열(앞에서부터 소비, 비면 취소).
  final List<Future<PickResult>> _album = [];
  final List<Future<PickResult>> _camera = [];

  void queueAlbum(Future<PickResult> result) => _album.add(result);
  void queueCamera(Future<PickResult> result) => _camera.add(result);

  static PickResult album(Uint8List bytes) =>
      PhotoPicked(PickedPhoto(bytes: bytes, origin: PhotoOrigin.album));
  static PickResult camera(Uint8List bytes) =>
      PhotoPicked(PickedPhoto(bytes: bytes, origin: PhotoOrigin.camera));

  @override
  Future<PickResult> pickFromAlbum() {
    albumCalls++;
    return _album.isEmpty
        ? Future.value(const PhotoPickCancelled())
        : _album.removeAt(0);
  }

  @override
  Future<PickResult> capture() {
    cameraCalls++;
    return _camera.isEmpty
        ? Future.value(const PhotoPickCancelled())
        : _camera.removeAt(0);
  }
}

class FakeGallerySaver implements GallerySaver {
  final List<({String fileName, Uint8List bytes})> saved = [];
  Object? error;

  /// 지정하면 저장이 이 Future가 끝날 때까지 지연된다(화면을 닫은 뒤 늦게 실패하는 경우).
  Future<void>? gate;

  @override
  Future<void> saveJpeg(Uint8List bytes, {required String fileName}) async {
    saved.add((fileName: fileName, bytes: bytes));
    final g = gate;
    if (g != null) await g;
    final e = error;
    if (e != null) throw e;
  }
}

/// 디코더 Fake. 호출 순서를 [log]에 남긴다(`bounds`, `decode:WxH`).
class FakeImageDecoder implements ImageDecoder {
  FakeImageDecoder({this.bounds = const ImageBounds(4000, 3000)});

  ImageBounds bounds;
  final List<String> log = [];
  final List<({int width, int height})> decodes = [];

  /// 지정하면 [readBounds]·[decode]가 이 예외를 던진다.
  ImageDecodeException? error;

  /// true를 돌려주는 바이트는 손상된 것으로 본다.
  bool Function(Uint8List bytes) isCorrupt = (b) => b.isEmpty;

  @override
  Future<ImageBounds> readBounds(Uint8List bytes) async {
    log.add('bounds');
    if (error != null) throw error!;
    if (isCorrupt(bytes)) throw const ImageDecodeException('손상');
    return bounds;
  }

  @override
  Future<RgbaImage> decode(
    Uint8List bytes, {
    required int width,
    required int height,
  }) async {
    log.add('decode:${width}x$height');
    decodes.add((width: width, height: height));
    if (isCorrupt(bytes)) throw const ImageDecodeException('손상');
    return sizedImage(width, height);
  }
}

class FakeImageScaler implements ImageScaler {
  final List<({int width, int height})> scales = [];

  @override
  Future<RgbaImage> scale(
    RgbaImage image, {
    required int width,
    required int height,
  }) async {
    scales.add((width: width, height: height));
    return sizedImage(width, height);
  }
}

/// 품질·이미지별 결과 크기를 [sizeFor]로 정하는 압축기 Fake. 호출을 모두 기록한다.
class FakeWebpCompressor implements WebpCompressor {
  FakeWebpCompressor(this.sizeFor);

  /// 항상 [bytes] 크기를 돌려준다.
  FakeWebpCompressor.constant(int bytes) : sizeFor = ((_, _) => bytes);

  int Function(int quality, RgbaImage image) sizeFor;
  final List<({int quality, int width, int height})> calls = [];

  /// 호출마다 불린다(취소 시점 만들기).
  void Function(int callIndex)? onCall;

  @override
  Future<Uint8List> compress(RgbaImage image, {required int quality}) async {
    calls.add((quality: quality, width: image.width, height: image.height));
    onCall?.call(calls.length);
    final size = sizeFor(quality, image);
    final out = Uint8List(size);
    // 결정적 내용(결정성 테스트용).
    for (var i = 0; i < out.length && i < 64; i++) {
      out[i] = (quality + i) & 0xff;
    }
    return out;
  }

  List<int> get qualities => [for (final c in calls) c.quality];
}

class FakePhotoEditRenderer implements PhotoEditRenderer {
  final List<PhotoEdit> edits = [];
  final List<RgbaImage> inputs = [];
  Object? error;

  /// 지정하면 렌더가 이 [Completer]가 끝날 때까지 기다린다("렌더링 중" 상태를 만든다).
  Completer<void>? gate;
  int get renders => edits.length;

  @override
  Future<RgbaImage> render(RgbaImage oriented, PhotoEdit edit) async {
    edits.add(edit);
    inputs.add(oriented);
    await gate?.future;
    final e = error;
    if (e != null) throw e;
    return oriented;
  }
}

class FakeStoredPhoto implements StoredPhoto {
  FakeStoredPhoto(this.path, this.bytes);

  @override
  final String path;
  final Uint8List bytes;
  bool deleted = false;
  int deleteCalls = 0;

  @override
  Future<Uint8List> readBytes() async {
    if (deleted) throw StateError('삭제된 파일을 읽었다');
    return bytes;
  }

  @override
  Future<void> delete() async {
    deleteCalls++;
    deleted = true;
  }
}

class FakePhotoFileStore implements PhotoFileStore {
  final List<FakeStoredPhoto> files = [];
  Object? writeError;

  /// 아직 지워지지 않은 임시 파일 수. 화면을 떠난 뒤 0이어야 한다(REQ-UPL-048).
  int get live => files.where((f) => !f.deleted).length;

  @override
  Future<StoredPhoto> write(Uint8List bytes) async {
    final e = writeError;
    if (e != null) throw e;
    final f = FakeStoredPhoto(
      '/tmp/chalkak-upload-${files.length}.webp',
      bytes,
    );
    files.add(f);
    return f;
  }
}

class FakeMonotonicClock implements MonotonicClock {
  FakeMonotonicClock([this.current = Duration.zero]);

  Duration current;

  @override
  Duration now() => current;

  void advance(Duration d) => current += d;
}

class FakeEditSourceLoader implements EditSourceLoader {
  FakeEditSourceLoader({this.width = 4000, this.height = 3000});

  final int width;
  final int height;
  int loads = 0;
  Object? error;

  /// 지정하면 로드가 이 [Completer]가 끝날 때까지 기다린다("준비되기 전" 상태를 만든다).
  Completer<void>? gate;

  @override
  Future<EditSource> load(Uint8List bytes) async {
    loads++;
    await gate?.future;
    final e = error;
    if (e != null) throw e;
    return EditSource(
      preview: pixelImage(4, 3, (x, y) => [x * 40, y * 60, 128]),
      width: width,
      height: height,
    );
  }
}

class FakeAutoAnalyzer implements AutoAdjustAnalyzer {
  FakeAutoAnalyzer([
    this.result = const AdjustmentValues(exposure: 0.4, contrast: 0.2),
  ]);

  AdjustmentValues result;
  final List<RgbaImage> analyzed = [];

  int get calls => analyzed.length;

  @override
  Future<AdjustmentValues> analyze(RgbaImage region) async {
    analyzed.add(region);
    return result;
  }
}

/// 업로드 영역 서버 호출을 [FakeAdapter]에 스크립트한다. 마지막 응답이 반복된다.
class UploadApi {
  UploadApi(this.adapter) {
    adapter.onDynamic('POST', '$v1/posts/uploads', (r) {
      policyBodies.add(r.body ?? '');
      return _next(_policy, 'POST /posts/uploads');
    });
    adapter.onDynamic(
      'POST',
      '$v1/posts',
      (r) => _next(_create, 'POST /posts'),
    );
    adapter.onDynamic(
      'POST',
      '$v1/auth/refresh',
      (r) => _refresh ?? FakeResponse.fixture('auth/refresh__success.json'),
    );
    for (var i = 1; i <= 7; i++) {
      adapter.onDynamic(
        'PUT',
        '/__upload/55555555-5555-4555-8555-55555555550$i',
        (r) => _next(_put, 'PUT'),
      );
    }
  }

  final FakeAdapter adapter;
  FakeResponse? _refresh;
  final List<FakeResponse> _policy = [];
  final List<FakeResponse> _create = [];
  final List<FakeResponse> _put = [];
  final List<String> policyBodies = [];
  int _policyIdx = 0;
  int _createIdx = 0;
  int _putIdx = 0;

  FakeResponse _next(List<FakeResponse> list, String what) {
    if (list.isEmpty) throw StateError('스크립트 없는 호출 $what');
    final int i;
    switch (what) {
      case 'POST /posts/uploads':
        i = _policyIdx++;
      case 'POST /posts':
        i = _createIdx++;
      default:
        i = _putIdx++;
    }
    return list[i < list.length ? i : list.length - 1];
  }

  /// 이후 refresh가 재인증 필요(REAUTHENTICATION_REQUIRED)로 답한다. 기본은 갱신 성공.
  void refreshReauth() => _refresh = FakeResponse.fixture(
    'auth/refresh__reauthentication-required.json',
  );

  /// `POST /posts/uploads` 응답 열. 예: `['posts-uploads__issued.json']`.
  void policy(List<String> names, {Duration delay = Duration.zero}) {
    _policy
      ..clear()
      ..addAll(names.map((n) => up(n, delay: delay)));
    _policyIdx = 0;
  }

  void policyResponses(List<FakeResponse> responses) {
    _policy
      ..clear()
      ..addAll(responses);
    _policyIdx = 0;
  }

  /// `PUT /__upload/...` 응답 열. 예: `['s3-put__200.json']`.
  void put(List<String> names, {Duration delay = Duration.zero}) {
    _put
      ..clear()
      ..addAll(names.map((n) => up(n, delay: delay)));
    _putIdx = 0;
  }

  void putResponses(List<FakeResponse> responses) {
    _put
      ..clear()
      ..addAll(responses);
    _putIdx = 0;
  }

  void createResponses(List<FakeResponse> responses) {
    _create
      ..clear()
      ..addAll(responses);
    _createIdx = 0;
  }

  /// `POST /posts` 응답 열.
  void create(List<String> names, {Duration delay = Duration.zero}) {
    _create
      ..clear()
      ..addAll(names.map((n) => up(n, delay: delay)));
    _createIdx = 0;
  }

  int get policyCalls => adapter.count('POST', '$v1/posts/uploads');
  int get createCalls => adapter.count('POST', '$v1/posts');
  Iterable<RecordedRequest> get puts =>
      adapter.requests.where((r) => r.method == 'PUT');
  int get putCalls => puts.length;
  Iterable<RecordedRequest> get creates => adapter.where('POST', '$v1/posts');
}

/// 업로드 흐름 한 벌: 실제 Api* 저장소 + 실제 Preparer/Submitter/Encoder를 [FakeAdapter] 위에
/// 얹고, 이미지 계층(디코더·압축기·렌더러·파일·단조 시계)은 Fake로 둔다.
/// 홈 API(`/posts/today`, `/topics`)는 [HomeApi]를 그대로 쓴다.
class UploadRig {
  UploadRig({Session? session, DateTime? now})
    : http = AuthHttpHarness(session: session ?? sessionAt(now: now ?? t0)) {
    home = HomeApi(http.adapter)..standard();
    api = UploadApi(http.adapter);
    api.policy(['posts-uploads__issued.json']);
    api.put(['s3-put__200.json']);
    api.create(['posts-create__201-pending.json']);
    home.today([fx('upload/posts-today__not-posted.json')]);
  }

  final AuthHttpHarness http;
  late final HomeApi home;
  late final UploadApi api;

  final FakeImageDecoder decoder = FakeImageDecoder();
  final FakeImageScaler scaler = FakeImageScaler();
  final FakeWebpCompressor compressor = FakeWebpCompressor.constant(100000);
  final FakePhotoEditRenderer renderer = FakePhotoEditRenderer();
  final FakePhotoFileStore files = FakePhotoFileStore();
  final FakeMonotonicClock monotonic = FakeMonotonicClock();
  final FakePhotoPicker picker = FakePhotoPicker();
  final FakeGallerySaver gallery = FakeGallerySaver();
  final RecordingToast toast = RecordingToast();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();

  late final ApiHomeRepository homeRepository = ApiHomeRepository(
    client: http.client,
  );
  late final ApiPostUploadRepository repository = ApiPostUploadRepository(
    client: http.client,
  );
  late final ApiUploadTopicSource topics = ApiUploadTopicSource(
    client: http.client,
  );

  late final PostImageEncoder encoder = PostImageEncoder(
    decoder: decoder,
    scaler: scaler,
    compressor: compressor,
    renderer: renderer,
  );
  late final UploadPreparer preparer = UploadPreparer(
    repository: repository,
    encoder: encoder,
    files: files,
    monotonic: monotonic,
  );
  late final PostSubmitter submitter = PostSubmitter(
    repository: repository,
    todayPost: homeRepository,
    preparer: preparer,
    monotonic: monotonic,
  );

  final List<UploadEvent> events = [];

  /// 게이트가 고정한 주제 날짜.
  final KstDate topicDate = const KstDate(2026, 10, 27);

  UploadViewModel makeViewModel({bool cameraAvailable = true}) {
    picker.isCameraAvailable = cameraAvailable;
    final vm = UploadViewModel(
      topicDate: topicDate,
      topics: topics,
      picker: picker,
      gallery: gallery,
      decoder: decoder,
      preparer: preparer,
      submitter: submitter,
      toast: toast,
      analytics: analytics,
    );
    vm.events.listen(events.add);
    return vm;
  }
}

/// 진입 게이트가 고정한 주제 날짜(FIXTURE_NOW의 KST 오늘).
const topicDateText = '2026-10-27';

/// 가상 시간에서 [UploadViewModel] 같은 비동기 흐름을 끝까지 돌린다.
void run(FakeAsync async, [Duration d = const Duration(seconds: 5)]) {
  settle(async);
  async.elapse(d);
  settle(async);
}
