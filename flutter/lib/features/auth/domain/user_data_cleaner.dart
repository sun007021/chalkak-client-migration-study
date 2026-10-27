/// 로그아웃·탈퇴·계정 전환·재인증 때 지울 계정 종속 상태(홈·기록·알림 목록·좋아요·
/// 미읽음·사인·푸시 설정 캐시, 푸시 등록 중복 제거 캐시, 보류 중인 푸시 이동).
/// 각 기능 PR이 자기 캐시를 이 인터페이스로 묶어 [AppDependencies]에 넣는다.
abstract interface class UserDataCleaner {
  Future<void> clearAll();
}

/// 여러 [UserDataCleaner]를 순서대로 실행한다. 하나가 던져도 나머지를 계속 실행한다.
class CompositeUserDataCleaner implements UserDataCleaner {
  CompositeUserDataCleaner(List<UserDataCleaner> cleaners);

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
