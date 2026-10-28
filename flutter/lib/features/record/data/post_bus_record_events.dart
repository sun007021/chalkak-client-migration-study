import '../../../core/post_events/post_event_bus.dart';
import '../domain/record_post_events.dart';

/// 공용 [PostEventBus]의 삭제 이벤트를 기록이 받는 창구로 어댑트한다. 버스와 같은 수명이라
/// 기록 ViewModel보다 오래 산다.
class PostBusRecordEvents implements RecordPostEvents {
  const PostBusRecordEvents(this._bus);

  final PostEventBus _bus;

  @override
  Stream<String> get removedPostIds => _bus.events
      .where((event) => event is PostRemoved)
      .map((event) => event.postId);
}
