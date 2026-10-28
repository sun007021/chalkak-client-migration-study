import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../domain/notification_models.dart';
import 'notification_inbox_view_model.dart';
import 'notification_test_ids.dart';

/// 알림함 화면(단독 위젯).
/// testids.md `notifications.*`([NotificationTestIds]):
/// 루트 `root`, 뒤로 `back-button`, 제목 `Copy.notiInboxTitle`,
/// 상태에 따라 `loading`(+`Copy.notiInboxLoading`) / `empty-state`(+`notiInboxEmptyTitle`·`notiInboxEmptyBody`) /
/// `error-state`(+오류 문구, `retry-button` "다시 시도") / `list`는 해당 상태일 때만 존재한다.
/// 행 `item-{id}`(제목·본문·시각·썸네일(없으면 대체 이미지)), 미읽음 표시 `item-unread-{id}`는 readAt이 null일 때만.
/// 다음 페이지 요청 중 `load-more-indicator`, 당겨서 새로고침 중 `refresh-indicator`.
/// 스크롤로 새로 만들어진 마지막 항목 index를 `onVisibleIndexChanged`로 알린다.
class NotificationInboxScreen extends StatelessWidget {
  const NotificationInboxScreen({
    super.key,
    required this.viewModel,
    required this.onBack,
  });

  final NotificationInboxViewModel viewModel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return TestId(
      NotificationTestIds.inboxRoot,
      child: Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        child: SafeArea(
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final state = viewModel.state;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _TitleBar(onBack: onBack),
                  if (state.isRefreshing)
                    const TestId(
                      NotificationTestIds.inboxRefreshIndicator,
                      child: LinearProgressIndicator(),
                    ),
                  Expanded(child: _body(context, state)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, NotificationInboxState state) {
    switch (state.status) {
      case InboxStatus.loading:
        return const _Loading();
      case InboxStatus.error:
        return _ErrorBody(
          message: state.errorMessage ?? Copy.notiInboxError,
          onRetry: viewModel.retry,
        );
      case InboxStatus.empty:
        return RefreshIndicator(
          onRefresh: viewModel.refresh,
          child: const _Empty(),
        );
      case InboxStatus.content:
        // 다음 페이지 표시는 목록 바깥 아래에 둔다. 목록 안에 두면 끝까지 스크롤한 위치에서
        // 요청이 시작될 때 화면 밖에 있어 보이지 않는다.
        return Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                onRefresh: viewModel.refresh,
                child: _List(viewModel: viewModel, state: state),
              ),
            ),
            if (state.isLoadingMore)
              const TestId(
                NotificationTestIds.inboxLoadMoreIndicator,
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
          ],
        );
    }
  }
}

class _TitleBar extends StatelessWidget {
  const _TitleBar({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        TestId.button(
          NotificationTestIds.inboxBackButton,
          child: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: onBack,
          ),
        ),
        Expanded(
          child: Text(
            Copy.notiInboxTitle,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const TestId(
      NotificationTestIds.inboxLoading,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text(Copy.notiInboxLoading),
          ],
        ),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return TestId(
      NotificationTestIds.inboxError,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            TestId.button(
              NotificationTestIds.inboxRetryButton,
              child: FilledButton(
                onPressed: () => unawaited(onRetry()),
                child: const Text(Copy.notiInboxRetry),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // 당겨서 새로고침이 되도록 스크롤 가능한 영역 안에 둔다.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: TestId(
            NotificationTestIds.inboxEmpty,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      Copy.notiInboxEmptyTitle,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      Copy.notiInboxEmptyBody,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _List extends StatelessWidget {
  const _List({required this.viewModel, required this.state});

  final NotificationInboxViewModel viewModel;
  final NotificationInboxState state;

  @override
  Widget build(BuildContext context) {
    final items = state.items;
    return TestId(
      NotificationTestIds.inboxList,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length,
        itemBuilder: (context, index) {
          // 빌드 중에는 ViewModel이 알리지 못하므로 빌드가 끝난 뒤 알린다.
          scheduleMicrotask(() => viewModel.onVisibleIndexChanged(index));
          final item = items[index];
          return _Row(
            item: item,
            onTap: () => unawaited(viewModel.onItemTapped(item.id)),
          );
        },
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.item, required this.onTap});

  final NotificationItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = item.isUnread;
    return TestId(
      NotificationTestIds.item(item.id),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TestId(
                NotificationTestIds.itemThumbnail(item.id),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 56,
                    height: 56,
                    child: AppNetworkImage(url: item.thumbnailImageUrl),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TestId(
                      NotificationTestIds.itemTitle(item.id),
                      child: Text(
                        item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: unread ? FontWeight.w700 : null,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    TestId(
                      NotificationTestIds.itemBody(item.id),
                      child: Text(
                        item.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    const SizedBox(height: 4),
                    TestId(
                      NotificationTestIds.itemTime(item.id),
                      child: Text(
                        item.timeLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (unread)
                TestId(
                  NotificationTestIds.itemUnread(item.id),
                  child: Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(left: 8, top: 6),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
