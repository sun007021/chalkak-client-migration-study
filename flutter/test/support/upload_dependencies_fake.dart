import 'package:chalkak/features/edit/domain/auto_adjuster.dart';
import 'package:chalkak/features/upload/upload_dependencies.dart';

import 'upload_fakes.dart';

/// 메인 묶음이 요구하는 업로드 의존성을 Fake로 채운다. 업로드를 직접 시험하지 않는 테스트가 쓴다.
UploadDependencies fakeUploadDependencies() {
  final rig = UploadRig();
  return UploadDependencies(
    picker: rig.picker,
    gallery: rig.gallery,
    decoder: rig.decoder,
    topics: rig.topics,
    preparer: rig.preparer,
    submitter: rig.submitter,
    editSourceLoader: FakeEditSourceLoader(),
    editRenderer: rig.renderer,
    autoAnalyzer: const AutoAdjuster(),
    toast: rig.toast,
  );
}
