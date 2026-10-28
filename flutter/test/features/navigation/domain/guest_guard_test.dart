import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/navigation/domain/guest_guard.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fixtures.dart';
import '../../../support/home_fakes.dart';

void main() {
  const keyByRestriction = {
    GuestRestriction.record: 'nav.guest.record',
    GuestRestriction.upload: 'nav.guest.upload',
    GuestRestriction.feed: 'nav.guest.feed',
    GuestRestriction.like: 'nav.guest.like',
    GuestRestriction.notification: 'nav.guest.notification',
    GuestRestriction.feedback: 'nav.guest.feedback',
  };

  test('TC-NAV-023 게스트 제한 6종의 토스트 문구는 shared/copy/ko.json 키와 정확히 같다', () {
    final ko = (jsonDecode(
      File('${Fixture.root.path}/../copy/ko.json').readAsStringSync(),
    ) as Map).cast<String, Object?>();
    expect(GuestRestriction.values, hasLength(6));
    for (final entry in keyByRestriction.entries) {
      expect(entry.key.message, ko[entry.value], reason: entry.value);
    }
    expect(GuestRestriction.record.message, Copy.navGuestRecord);
    expect(GuestRestriction.upload.message, Copy.navGuestUpload);
    expect(GuestRestriction.feed.message, Copy.navGuestFeed);
    expect(GuestRestriction.like.message, Copy.navGuestLike);
    expect(GuestRestriction.notification.message, Copy.navGuestNotification);
    expect(GuestRestriction.feedback.message, Copy.navGuestFeedback);
  });

  test('TC-NAV-016 TC-NAV-017 TC-NAV-018 TC-NAV-019 TC-NAV-020 TC-NAV-022 게스트는 막히고 해당 토스트가 한 번 뜬다', () {
    for (final restriction in GuestRestriction.values) {
      final toast = RecordingToast();
      final guard = GuestGuard(isGuest: true, toast: toast);
      expect(guard.isGuest, isTrue);
      expect(guard.blocks(restriction), isTrue, reason: restriction.name);
      expect(toast.messages, [restriction.message], reason: restriction.name);
    }
  });

  test('로그인 사용자는 막히지 않고 토스트도 없다', () {
    for (final restriction in GuestRestriction.values) {
      final toast = RecordingToast();
      final guard = GuestGuard(isGuest: false, toast: toast);
      expect(guard.isGuest, isFalse);
      expect(guard.blocks(restriction), isFalse, reason: restriction.name);
      expect(toast.messages, isEmpty);
    }
  });
}
