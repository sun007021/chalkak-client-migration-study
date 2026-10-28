import '../../core/analytics/analytics_tracker.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../edit/domain/auto_adjuster.dart';
import '../edit/domain/edit_source_loader.dart';
import '../edit/domain/image_codec.dart';
import '../edit/domain/photo_edit_renderer.dart';
import 'domain/gallery_saver.dart';
import 'domain/photo_picker.dart';
import 'domain/post_submitter.dart';
import 'domain/upload_preparer.dart';
import 'domain/upload_topic_source.dart';

/// 업로드·편집 화면이 쓰는 의존성 묶음. `AppDependencies`에 `upload`로 들어간다(다음 단계에서 연결).
/// 진입 게이트는 navigation의 `UploadEntryGate`를 그대로 쓰므로 여기에 두지 않는다.
class UploadDependencies {
  const UploadDependencies({
    required this.picker,
    required this.gallery,
    required this.decoder,
    required this.topics,
    required this.preparer,
    required this.submitter,
    required this.editSourceLoader,
    required this.editRenderer,
    required this.autoAnalyzer,
    required this.toast,
    required this.analytics,
  });

  final PhotoPicker picker;
  final GallerySaver gallery;
  final ImageDecoder decoder;
  final UploadTopicSource topics;
  final UploadPreparer preparer;
  final PostSubmitter submitter;
  final EditSourceLoader editSourceLoader;
  final PhotoEditRenderer editRenderer;
  final AutoAdjustAnalyzer autoAnalyzer;
  final ToastSink toast;
  final AnalyticsTracker analytics;
}
