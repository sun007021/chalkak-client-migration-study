import '../../core/network/api_client.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../edit/data/ui_image_decoder.dart';
import '../edit/domain/auto_adjuster.dart';
import '../edit/domain/edit_source_loader.dart';
import '../edit/domain/photo_edit_renderer.dart';
import '../home/domain/today_post_repository.dart';
import 'data/api_post_upload_repository.dart';
import 'data/api_upload_topic_source.dart';
import 'data/flutter_webp_compressor.dart';
import 'data/gal_gallery_saver.dart';
import 'data/image_picker_photo_picker.dart';
import 'data/stopwatch_monotonic_clock.dart';
import 'data/temp_photo_file_store.dart';
import 'domain/post_image_encoder.dart';
import 'domain/post_submitter.dart';
import 'domain/upload_preparer.dart';
import 'upload_dependencies.dart';

/// 실제 플랫폼 구현(image_picker, dart:ui 코덱, flutter_image_compress, gal, 임시 파일)으로
/// [UploadDependencies]를 조립한다.
UploadDependencies buildUploadDependencies({
  required ApiClient client,
  required TodayPostRepository todayPost,
  required ToastSink toast,
}) {
  const decoder = UiImageDecoder();
  const renderer = PixelPhotoEditRenderer();
  final repository = ApiPostUploadRepository(client: client);
  final monotonic = StopwatchMonotonicClock();
  final preparer = UploadPreparer(
    repository: repository,
    encoder: const PostImageEncoder(
      decoder: decoder,
      scaler: UiImageScaler(),
      compressor: FlutterWebpCompressor(),
      renderer: renderer,
    ),
    files: const TempPhotoFileStore(),
    monotonic: monotonic,
  );
  return UploadDependencies(
    picker: ImagePickerPhotoPicker(),
    gallery: const GalGallerySaver(),
    decoder: decoder,
    topics: ApiUploadTopicSource(client: client),
    preparer: preparer,
    submitter: PostSubmitter(
      repository: repository,
      todayPost: todayPost,
      preparer: preparer,
      monotonic: monotonic,
    ),
    editSourceLoader: const DecodingEditSourceLoader(decoder: decoder),
    editRenderer: renderer,
    autoAnalyzer: const AutoAdjuster(),
    toast: toast,
  );
}
