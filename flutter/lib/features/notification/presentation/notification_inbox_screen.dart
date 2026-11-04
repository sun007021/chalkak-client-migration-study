import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
import '../../../core/ui/components/chalkak_states.dart';
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
        color: context.tokens.colors.background,
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
                  child: Center(child: ChalkakSpinner()),
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
          child: ChalkakNavButton.back(onPressed: onBack),
        ),
        Expanded(
          child: Text(
            Copy.notiInboxTitle,
            style: context.tokens.text.headline.copyWith(
              color: context.tokens.colors.textPrimary,
            ),
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
            ChalkakSpinner(),
            SizedBox(height: 16),
            ChalkakStatusText(Copy.notiInboxLoading),
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
            ChalkakStatusText(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            TestId.button(
              NotificationTestIds.inboxRetryButton,
              child: ChalkakOutlinedButton(
                onPressed: () => unawaited(onRetry()),
                label: Copy.notiInboxRetry,
                fillsWidth: false,
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
    final tokens = context.tokens;
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
                padding: EdgeInsets.all(tokens.spacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ChalkakIcon(
                      ChalkakIcon.bell,
                      size: 34,
                      color: tokens.colors.iconSecondary,
                    ),
                    SizedBox(height: tokens.spacing.sm),
                    Text(
                      Copy.notiInboxEmptyTitle,
                      style: tokens.text.body.copyWith(
                        color: tokens.colors.textSecondary,
                      ),
                    ),
                    SizedBox(height: tokens.spacing.sm),
                    Text(
                      Copy.notiInboxEmptyBody,
                      textAlign: TextAlign.center,
                      style: tokens.text.subheadline.copyWith(
                        color: tokens.colors.textMuted,
                      ),
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
    final tokens = context.tokens;
    final unread = item.isUnread;
    return TestId(
      NotificationTestIds.item(item.id),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: tokens.colors.border)),
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: tokens.spacing.screenHorizontal,
              vertical: tokens.spacing.xl,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: tokens.spacing.md,
                  child: unread
                      ? Padding(
                          padding: EdgeInsets.only(top: tokens.spacing.xs),
                          child: TestId(
                            NotificationTestIds.itemUnread(item.id),
                            child: Container(
                              width: tokens.spacing.sm,
                              height: tokens.spacing.sm,
                              decoration: BoxDecoration(
                                color: tokens.colors.inputCursor,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        )
                      : null,
                ),
                SizedBox(width: tokens.spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TestId(
                        NotificationTestIds.itemTitle(item.id),
                        child: Text(
                          item.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.text.subheadline.copyWith(
                            color: tokens.colors.textPrimary,
                            fontWeight: unread ? FontWeight.w600 : null,
                          ),
                        ),
                      ),
                      SizedBox(height: tokens.spacing.sm),
                      TestId(
                        NotificationTestIds.itemBody(item.id),
                        child: Text(
                          item.body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.text.caption.copyWith(
                            color: tokens.colors.textSecondary,
                          ),
                        ),
                      ),
                      SizedBox(height: tokens.spacing.sm),
                      TestId(
                        NotificationTestIds.itemTime(item.id),
                        child: Text(
                          item.timeLabel,
                          style: tokens.text.caption.copyWith(
                            color: tokens.colors.textInactive,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: tokens.spacing.lg),
                TestId(
                  NotificationTestIds.itemThumbnail(item.id),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: AppNetworkImage(url: item.thumbnailImageUrl),
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
