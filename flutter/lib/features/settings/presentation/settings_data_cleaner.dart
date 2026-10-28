import '../../auth/domain/user_data_cleaner.dart';
import 'settings_view_model.dart';

/// 계정 전환·로그아웃 때 설정 탭의 사인·푸시 설정을 지운다(`CompositeUserDataCleaner`에 넣는다).
/// 설정 ViewModel은 메인 화면과 함께 생겼다 사라지므로 앱 수명의 cleaner 묶음에는 이 연결 고리를 넣고
/// ViewModel은 만들어질 때 [attach]한다(RecordDataCleaner와 같은 방식).
class SettingsDataCleaner implements UserDataCleaner {
  SettingsViewModel? _current;

  void attach(SettingsViewModel viewModel) => _current = viewModel;

  void detach(SettingsViewModel viewModel) {
    if (_current == viewModel) _current = null;
  }

  @override
  Future<void> clearAll() async => _current?.clearAll();
}
