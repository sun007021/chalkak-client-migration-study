import 'package:chalkak/features/record/data/gallery_calendar_image_saver.dart';
import 'package:chalkak/features/record/domain/record_calendar_image.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gal/gal.dart';

class _FakeGallery implements GalleryGateway {
  bool access = true;
  bool grantOnRequest = true;
  Object? putError;
  int requests = 0;
  final List<({String name, String album, int length})> puts = [];

  @override
  Future<bool> hasAccess() async => access;

  @override
  Future<bool> requestAccess() async {
    requests++;
    return grantOnRequest;
  }

  @override
  Future<void> putPng({
    required Uint8List bytes,
    required String name,
    required String album,
  }) async {
    final error = putError;
    if (error != null) throw error;
    puts.add((name: name, album: album, length: bytes.length));
  }
}

GalException _galError(GalExceptionType type) => GalException(
  type: type,
  platformException: PlatformException(code: type.code),
  stackTrace: StackTrace.empty,
);

void main() {
  final bytes = Uint8List.fromList([1, 2, 3]);

  test('TC-REC-038 권한이 있으면 확장자를 뗀 이름으로 Chalkak 앨범에 저장한다', () async {
    final gallery = _FakeGallery();
    await GalleryCalendarImageSaver(gateway: gallery)
        .save(fileName: 'chalkak-calendar-2026-10.png', pngBytes: bytes);
    expect(gallery.puts.single.name, 'chalkak-calendar-2026-10');
    expect(gallery.puts.single.album, 'Chalkak');
    expect(gallery.puts.single.length, 3);
    expect(gallery.requests, 0, reason: '이미 권한이 있으면 다시 묻지 않는다');
  });

  test('TC-REC-039 권한이 없으면 요청하고 허용되면 저장한다', () async {
    final gallery = _FakeGallery()..access = false;
    await GalleryCalendarImageSaver(gateway: gallery)
        .save(fileName: 'a.png', pngBytes: bytes);
    expect(gallery.requests, 1);
    expect(gallery.puts, hasLength(1));
  });

  test(
    'TC-REC-039 권한 요청이 거부되면 CalendarImagePermissionDenied이고 저장하지 않는다',
    () async {
      final gallery = _FakeGallery()
        ..access = false
        ..grantOnRequest = false;
      await expectLater(
        GalleryCalendarImageSaver(gateway: gallery)
            .save(fileName: 'a.png', pngBytes: bytes),
        throwsA(isA<CalendarImagePermissionDenied>()),
      );
      expect(gallery.puts, isEmpty);
    },
  );

  test('TC-REC-039 저장 중 accessDenied(설정에서 끈 경우 등)도 권한 거부로 바꾼다', () async {
    final gallery = _FakeGallery()
      ..putError = _galError(GalExceptionType.accessDenied);
    await expectLater(
      GalleryCalendarImageSaver(gateway: gallery)
          .save(fileName: 'a.png', pngBytes: bytes),
      throwsA(isA<CalendarImagePermissionDenied>()),
    );
  });

  test('TC-REC-039 공간 부족 같은 다른 실패는 권한 거부로 바꾸지 않고 그대로 던진다', () async {
    final gallery = _FakeGallery()
      ..putError = _galError(GalExceptionType.notEnoughSpace);
    await expectLater(
      GalleryCalendarImageSaver(gateway: gallery)
          .save(fileName: 'a.png', pngBytes: bytes),
      throwsA(
        isA<GalException>().having(
          (e) => e.type,
          'type',
          GalExceptionType.notEnoughSpace,
        ),
      ),
    );
  });
}
