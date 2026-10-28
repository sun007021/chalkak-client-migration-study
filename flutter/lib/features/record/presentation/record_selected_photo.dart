import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../domain/record_models.dart';
import 'record_test_ids.dart';

/// 선택한 날의 사진 영역. APPROVED는 두 동작 버튼, PENDING은 배지와 안내 풍선만 보인다.
class RecordSelectedPhoto extends StatelessWidget {
  const RecordSelectedPhoto({
    super.key,
    required this.photo,
    required this.isTooltipOpen,
    required this.onTogglePendingTooltip,
    required this.onViewFeed,
    required this.onViewDisplay,
  });

  final RecordPhoto photo;
  final bool isTooltipOpen;
  final VoidCallback onTogglePendingTooltip;
  final VoidCallback onViewFeed;
  final VoidCallback onViewDisplay;

  @override
  Widget build(BuildContext context) {
    return TestId(
      RecordTestIds.selectedPhoto,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 240),
              child: AspectRatio(
                aspectRatio: 3 / 4,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AppNetworkImage(url: photo.thumbnailImageUrl),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (photo.isPending) ...[
            Center(
              child: _PendingBadge(
                isOpen: isTooltipOpen,
                onPressed: onTogglePendingTooltip,
              ),
            ),
            if (isTooltipOpen) ...[
              const SizedBox(height: 8),
              const _PendingTooltip(),
            ],
          ] else
            Row(
              children: [
                Expanded(
                  child: TestId.button(
                    RecordTestIds.viewFeedButton,
                    child: OutlinedButton(
                      onPressed: onViewFeed,
                      child: const Text(Copy.recordActionFeed),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TestId.button(
                    RecordTestIds.viewDisplayButton,
                    child: FilledButton(
                      onPressed: onViewDisplay,
                      child: const Text(Copy.recordActionDisplay),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _PendingBadge extends StatelessWidget {
  const _PendingBadge({required this.isOpen, required this.onPressed});

  final bool isOpen;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return TestId(
      RecordTestIds.pendingBadge,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(Copy.recordPendingBadge),
              const SizedBox(width: 4),
              // 보조 라벨: 풍선이 닫혀 있으면 열기, 열려 있으면 닫기를 알린다.
              Semantics(
                container: true,
                label: isOpen
                    ? Copy.recordPendingHintClose
                    : Copy.recordPendingHintOpen,
                child: Icon(
                  Icons.info_outline,
                  size: 16,
                  color: colors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingTooltip extends StatelessWidget {
  const _PendingTooltip();

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return TestId(
      RecordTestIds.pendingTooltip,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.inverseSurface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            Copy.recordPendingTooltip,
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.onInverseSurface),
          ),
        ),
      ),
    );
  }
}
