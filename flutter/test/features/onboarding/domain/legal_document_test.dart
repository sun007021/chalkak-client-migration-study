import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-ONB-009 문서 URL은 shared/constants.json의 TERMS_URLS와 같다', () {
    final json = jsonDecode(
      File('../shared/constants.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final urls = json['TERMS_URLS'] as Map<String, dynamic>;
    expect(LegalDocument.service.url, urls['service']);
    expect(LegalDocument.privacy.url, urls['privacy']);
    expect(LegalDocument.service.url, AppConstants.termsServiceUrl);
    expect(LegalDocument.privacy.url, AppConstants.termsPrivacyUrl);
  });

  test('TC-ONB-009 공통 URL은 앱 안에서 열 수 있는 주소다', () {
    for (final d in LegalDocument.values) {
      expect(LegalLinkPolicy.decide(d.url), LegalLinkTarget.inApp);
    }
  });

  test('REQ-ONB-011 문서별 screen_view 이름', () {
    expect(LegalDocument.service.screenName, 'terms_of_service');
    expect(LegalDocument.privacy.screenName, 'privacy_policy');
  });

  for (final url in [
    'https://www.notion.so/page-1',
    'https://x.notion.site/doc',
    'https://notion.com/p/1',
    'https://app.notion.com/p/1?source=copy_link',
    'https://WWW.NOTION.SO/page',
  ]) {
    test('TC-ONB-010 $url 은 앱 안에서 연다', () {
      expect(LegalLinkPolicy.decide(url), LegalLinkTarget.inApp);
    });
  }

  for (final url in [
    'http://notion.so/page',
    'https://notion.com.evil.example/x',
    'https://evil.example/notion.so',
    'https://notion.so@evil.example/x',
    'https://user:pw@notion.so/x',
    'https://evilnotion.so/x',
    '',
    'not a url',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://notion.so/x',
  ]) {
    test('TC-ONB-011 "$url" 은 앱 안에서 열지 않는다', () {
      expect(LegalLinkPolicy.decide(url), isNot(LegalLinkTarget.inApp));
    });
  }

  test('TC-ONB-011 http/https인 비허용 URL은 외부 브라우저, 그 밖은 거부한다', () {
    expect(
      LegalLinkPolicy.decide('http://notion.so/x'),
      LegalLinkTarget.external,
    );
    expect(
      LegalLinkPolicy.decide('https://example.com/x'),
      LegalLinkTarget.external,
    );
    expect(LegalLinkPolicy.decide(''), LegalLinkTarget.rejected);
    expect(
      LegalLinkPolicy.decide('javascript:alert(1)'),
      LegalLinkTarget.rejected,
    );
    expect(
      LegalLinkPolicy.decide('https://user:pw@notion.so/x'),
      LegalLinkTarget.rejected,
    );
  });
}
