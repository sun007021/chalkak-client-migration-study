import 'package:chalkak/core/network/url_rule.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  bool allowed(String url) => UrlRule.isAllowed(Uri.parse(url));

  test('REQ-NET-004 https는 어느 호스트든 허용한다', () {
    expect(allowed('https://api.test/a'), isTrue);
    expect(allowed('https://localhost/a'), isTrue);
  });

  test('REQ-NET-004 http는 loopback 호스트 세 개만 허용한다', () {
    expect(allowed('http://localhost:8080/a'), isTrue);
    expect(allowed('http://127.0.0.1/a'), isTrue);
    expect(allowed('http://10.0.2.2:9000/a'), isTrue);
    expect(allowed('http://api.test/a'), isFalse);
    expect(allowed('http://192.168.0.5/a'), isFalse);
    expect(allowed('http://localhost.evil.test/a'), isFalse);
  });

  test('REQ-NET-004 다른 스킴과 호스트 없는 URL은 거부한다', () {
    expect(allowed('ftp://localhost/a'), isFalse);
    expect(allowed('file:///etc/passwd'), isFalse);
    expect(allowed('/relative/path'), isFalse);
  });
}
