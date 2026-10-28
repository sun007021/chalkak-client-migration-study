import '../../../core/post_events/post_event_bus.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'like_store.dart';

/// 계정이 바뀌거나 로그아웃할 때 좋아요 값과 삭제 기록을 비운다(TC-LIKE-031).
class LikeDataCleaner implements UserDataCleaner {
  const LikeDataCleaner({required this.likes, required this.postEvents});

  final LikeStore likes;
  final PostEventBus postEvents;

  @override
  Future<void> clearAll() async {
    likes.reset();
    postEvents.reset();
  }
}
