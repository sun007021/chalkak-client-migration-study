import '../../auth/domain/user_data_cleaner.dart';
import 'record_view_model.dart';

/// 계정 전환·로그아웃 때 기록 캐시를 지운다. 기록 ViewModel은 메인 화면과 함께 생겼다 사라지므로,
/// 앱 수명의 cleaner 묶음에는 이 연결 고리를 넣고 ViewModel은 만들어질 때 [attach]한다.
class RecordDataCleaner implements UserDataCleaner {
  RecordViewModel? _current;

  void attach(RecordViewModel viewModel) => _current = viewModel;

  void detach(RecordViewModel viewModel) {
    if (_current == viewModel) _current = null;
  }

  @override
  Future<void> clearAll() async => _current?.clearAll();
}
