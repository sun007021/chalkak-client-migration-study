import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/test_id.dart';
import '../../edit/domain/rgba_image.dart';
import '../../edit/presentation/rgba_image_view.dart';
import 'upload_success_view_model.dart';
import 'upload_test_ids.dart';

/// 업로드 성공 화면(REQ-UPL-060~062, testIDs `upload-success.*`):
/// 전시한 사진 카드, 기록 문구(`upload-success.message`), 상태 안내(`upload-success.status-message`),
/// 버튼 "확인했어요."(`upload-success.confirm-button`).
class UploadSuccessScreen extends StatefulWidget {
  const UploadSuccessScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
    this.photo,
  });

  final UploadSuccessViewModel viewModel;
  final void Function(UploadSuccessEvent event) onEvent;

  /// 전시한 사진(편집 결과 미리보기). 없으면 카드는 사진 없이 그린다.
  final RgbaImage? photo;

  @override
  State<UploadSuccessScreen> createState() => _UploadSuccessScreenState();
}

class _UploadSuccessScreenState extends State<UploadSuccessScreen> {
  late final StreamSubscription<UploadSuccessEvent> _sub;

  @override
  void initState() {
    super.initState();
    _sub = widget.viewModel.events.listen((event) {
      if (mounted) widget.onEvent(event);
    });
    widget.viewModel.onShown();
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.viewModel;
    final photo = widget.photo;
    return TestId(
      UploadTestIds.successRoot,
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              children: [
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (photo != null && photo.height > 0)
                            Card(
                              clipBehavior: Clip.antiAlias,
                              elevation: 0,
                              color: context.tokens.colors.surfaceElevated,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(
                                  context.tokens.radius.photoCard,
                                ),
                                side: BorderSide(
                                  color: context.tokens.colors.border,
                                ),
                              ),
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  maxHeight:
                                      MediaQuery.sizeOf(context).height * 0.45,
                                ),
                                child: AspectRatio(
                                  aspectRatio: photo.width / photo.height,
                                  child: RgbaImageView(
                                    image: photo,
                                    fit: BoxFit.cover,
                                    placeholder: ColoredBox(
                                      color: context.tokens.colors.skeletonBase,
                                    ),
                                  ),
                                ),
                              ),
                            )
                          else
                            Icon(
                              Icons.check_circle_outline,
                              size: 72,
                              color: context.tokens.colors.accent,
                            ),
                          const SizedBox(height: 24),
                          TestId(
                            UploadTestIds.successMessage,
                            child: Text(
                              vm.message,
                              textAlign: TextAlign.center,
                              style: context.tokens.text.title3.copyWith(
                                color: context.tokens.colors.textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TestId(
                            UploadTestIds.successStatusMessage,
                            child: Text(
                              vm.statusMessage,
                              textAlign: TextAlign.center,
                              style: context.tokens.text.callout.copyWith(
                                color: context.tokens.colors.textNeutral,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: TestId.button(
                    UploadTestIds.successConfirmButton,
                    child: ChalkakButton(
                      onPressed: vm.onConfirmPressed,
                      label: Copy.uploadSuccessConfirm,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
