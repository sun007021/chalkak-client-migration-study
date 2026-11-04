package com.stonefive.chalkak.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import com.stonefive.chalkak.ui.components.ChalkakLogo
import com.stonefive.chalkak.ui.components.ChalkakRetryButton
import com.stonefive.chalkak.ui.components.ChalkakSkeleton
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import com.stonefive.chalkak.ui.theme.Continuous
import com.stonefive.chalkak.ui.common.RemoteImage
import kotlinx.coroutines.flow.distinctUntilChanged
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.feature.home.HeroState
import kr.chalkak.feature.home.HomeCopyKeys
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.IssueState
import kr.chalkak.feature.home.RankingKind
import kr.chalkak.feature.home.Section
import kr.chalkak.feature.home.TopicHeader
import kr.chalkak.feature.home.WeekDay
import java.time.LocalDate

/** Every user action of the home screen. All default to no-ops so a test sets only what it observes. */
class HomeCallbacks(
    val onNotificationClick: () -> Unit = {},
    val onHeroClick: () -> Unit = {},
    val onHeroRetry: () -> Unit = {},
    val onWeekDayClick: (LocalDate) -> Unit = {},
    val onWeekMoreClick: () -> Unit = {},
    val onWeekRetry: () -> Unit = {},
    val onRankingPostClick: (HomePost) -> Unit = {},
    val onRankingMoreClick: (RankingKind) -> Unit = {},
    val onRankingRetry: (RankingKind) -> Unit = {},
    val onLikeClick: (HomePost) -> Unit = {},
    val onBannerClick: (Banner) -> Unit = {},
    val onBannerScrolled: (lastVisibleIndex: Int) -> Unit = {},
    val onIssueRetry: () -> Unit = {},
    val onRefresh: () -> Unit = {},
)

/** Screen side margin (`spacing.screenHorizontal`, 25) and the gap above the weekly / ranking / ISSUE blocks (`spacing.xxl`, 40). */
private val ScreenPadding = 25.dp
private val SectionGap = 40.dp

/**
 * Stateless home screen (testids.md "홈", TC-HOME-*, TC-BANR-*). It renders [state] and forwards taps through [callbacks]; every
 * decision (guest restrictions, effects, paging) belongs to the state holder. One scroll container `home.scroll` ([listState]);
 * pulling it down calls `onRefresh`; the refresh indicator exists only while `state.refreshing`, the content stays.
 *
 * Elements that tests and Maestro look up by id never sit under a clickable parent (it would merge them away): tap targets are
 * siblings of the badges, counts and photos they sit next to.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    state: HomeUiState,
    callbacks: HomeCallbacks,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    image: RemoteImage = { _, _ -> },
    aiCard: @Composable () -> Unit = {},
) {
    val copy = LocalCopy.current
    val pullState = rememberPullToRefreshState()
    Column(modifier = modifier.fillMaxSize().testTag("home.root")) {
        TopBar(hasUnread = state.hasUnread, onNotificationClick = callbacks.onNotificationClick)
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = callbacks.onRefresh,
            modifier = Modifier.weight(1f),
            state = pullState,
            indicator = {
                if (state.refreshing) {
                    Box(Modifier.align(Alignment.TopCenter).padding(top = 12.dp).testTag("home.refresh-indicator")) { Loading() }
                } else {
                    PullToRefreshDefaults.Indicator(state = pullState, isRefreshing = false, modifier = Modifier.align(Alignment.TopCenter))
                }
            },
        ) {
            val issue = state.issue
            val banners = (issue as? IssueState.Ready)?.banners.orEmpty()
            // Lazy item index of the first banner: topic, hero, [ai card], week, ranking, popular come before it (+ the ISSUE header).
            val firstBannerIndex = FIXED_ITEMS_BEFORE_ISSUE + (if (state.aiCardVisible) 1 else 0) + 1
            ReportLastVisibleBanner(listState, firstBannerIndex, banners.size, callbacks.onBannerScrolled)
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().testTag("home.scroll"),
                contentPadding = PaddingValues(bottom = 40.dp),
            ) {
                item(key = "topic") { TopicBlock(state.topic) }
                item(key = "hero") { HeroBlock(state, callbacks, image) }
                if (state.aiCardVisible) {
                    item(key = "ai") {
                        // The card content (AIR PR) fills this box; until then it keeps a 16dp row so the container is a real, displayed node.
                        Box(
                            Modifier.fillMaxWidth().padding(horizontal = ScreenPadding).padding(top = SectionGap).heightIn(min = 16.dp).testTag("home.ai-card"),
                        ) { aiCard() }
                    }
                }
                item(key = "week") { WeekBlock(state.week, callbacks, image) }
                item(key = "ranking") { RankingBlock(RankingKind.Yesterday, state.yesterday, callbacks, image) }
                item(key = "popular") { RankingBlock(RankingKind.Today, state.popular, callbacks, image) }
                when (issue) {
                    is IssueState.Ready -> {
                        item(key = "issue-header") { IssueHeader() }
                        items(banners.size, key = { "issue-${banners[it].id}" }) { index -> BannerItem(banners[index], callbacks, image) }
                    }
                    IssueState.Error -> item(key = "issue-error") {
                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = ScreenPadding).padding(top = SectionGap),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                text = copy["home.banner.error"],
                                style = ChalkakTheme.typography.subheadline,
                                color = ChalkakTheme.colors.textSecondary,
                                modifier = Modifier.testTag("home.issue-error"),
                            )
                            RetryText(copy["home.hero.retry"], callbacks.onIssueRetry, Modifier.testTag("home.issue-retry-button"))
                        }
                    }
                    IssueState.Hidden, IssueState.Loading -> Unit
                }
            }
        }
    }
}

/** Keys before the first banner: topic, hero, week, ranking, popular. */
private const val FIXED_ITEMS_BEFORE_ISSUE = 5

@Composable
private fun ReportLastVisibleBanner(listState: LazyListState, firstBannerIndex: Int, count: Int, report: (Int) -> Unit) {
    val latestReport by rememberUpdatedState(report)
    LaunchedEffect(listState, firstBannerIndex, count) {
        if (count == 0) return@LaunchedEffect
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.lastOrNull { it.index in firstBannerIndex until firstBannerIndex + count }
                ?.let { it.index - firstBannerIndex }
        }.distinctUntilChanged().collect { index -> if (index != null) latestReport(index) }
    }
}

// ---- top bar ---------------------------------------------------------------------------------------------------------------

@Composable
private fun TopBar(hasUnread: Boolean, onNotificationClick: () -> Unit) {
    val copy = LocalCopy.current
    Column(Modifier.fillMaxWidth().background(ChalkakTheme.colors.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().statusBarsPadding().height(55.dp).padding(horizontal = ScreenPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // The Continuous face has Latin glyphs only, so the wordmark is "Chalkak"; screen readers still hear the app name.
            ChalkakLogo(modifier = Modifier.weight(1f).offset(y = 5.dp), accessibilityText = copy["app.name"])
            Box(Modifier.size(44.dp)) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClick = onNotificationClick)
                        .testTag("home.notification-button"),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painterResource(R.drawable.ic_notification),
                        contentDescription = copy["noti.inbox.title"],
                        tint = ChalkakTheme.colors.iconPrimary,
                        modifier = Modifier.size(24.dp),
                    )
                }
                // A sibling of the button: a clickable parent would merge the dot out of the addressable tree.
                if (hasUnread) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 8.dp, end = 8.dp)
                            .size(7.dp)
                            .background(ChalkakTheme.colors.inputCursor, CircleShape)
                            .testTag("home.notification-unread-dot"),
                    )
                }
            }
        }
        HorizontalDivider(thickness = 0.5.dp, color = ChalkakTheme.colors.border)
    }
}

// ---- topic + hero ----------------------------------------------------------------------------------------------------------

@Composable
private fun TopicBlock(topic: TopicHeader) {
    val copy = LocalCopy.current
    // Spacing above the topic is xl + sm (32); below it the hero follows after xl (screens-a 7.1).
    Column(Modifier.fillMaxWidth().padding(horizontal = ScreenPadding).padding(top = 32.dp), verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm)) {
        when (topic) {
            is TopicHeader.Ready -> {
                Text(
                    text = topic.dateLabel,
                    style = ChalkakTheme.typography.subheadline,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.testTag("home.topic-date"),
                )
                Text(
                    text = topic.title,
                    style = ChalkakTheme.typography.title2,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.testTag("home.topic-title"),
                )
            }
            else -> Text(
                text = copy[
                    when (topic) {
                        TopicHeader.Loading -> "home.topic.loading"
                        TopicHeader.NotReady -> "home.topic.not-ready"
                        else -> "home.topic.error"
                    },
                ],
                style = ChalkakTheme.typography.title2,
                color = ChalkakTheme.colors.textMuted,
                modifier = Modifier.testTag("home.topic-title"),
            )
        }
    }
}

@Composable
private fun HeroBlock(state: HomeUiState, callbacks: HomeCallbacks, image: RemoteImage) {
    val copy = LocalCopy.current
    val shape = ChalkakTheme.shapes.photoCard
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = ScreenPadding)
            .padding(top = ChalkakTheme.spacing.xl)
            .aspectRatio(HERO_ASPECT_RATIO)
            .clip(shape),
    ) {
        when (val hero = state.hero) {
            HeroState.Loading -> HeroMessage(copy["home.topic.loading"], "home.hero-loading") { Loading(Modifier.size(24.dp)) }
            HeroState.NoOpenTopic -> HeroMessage(copy["home.hero.no-open-topic"], "home.hero-no-open-topic")
            HeroState.Processing -> HeroMessage(copy["home.hero.processing"], "home.hero-processing")
            is HeroState.Empty -> HeroEmpty(topicName(state.topic, copy), callbacks.onHeroClick)
            is HeroState.Photo -> {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(ChalkakTheme.colors.surfaceElevated)
                        .clickable(interactionSource = null, indication = null, role = Role.Button, onClick = callbacks.onHeroClick)
                        .testTag("home.hero-photo"),
                ) { image(hero.thumbnailUrl, Modifier.fillMaxSize()) }
                if (hero.pendingBadge) {
                    Text(
                        text = copy["home.hero.pending-badge"],
                        style = ChalkakTheme.typography.caption,
                        fontWeight = FontWeight.SemiBold,
                        color = ChalkakTheme.colors.textOnImage,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(ChalkakTheme.spacing.md)
                            .background(ChalkakTheme.colors.scrim, ChalkakTheme.shapes.pill)
                            .padding(horizontal = ChalkakTheme.spacing.md, vertical = ChalkakTheme.spacing.xs)
                            .testTag("home.hero-pending-badge"),
                    )
                }
            }
            is HeroState.Error -> HeroMessage(
                text = copy[if (hero.network) HomeCopyKeys.COMMON_NETWORK else "home.hero.error"],
                tag = "home.hero-error",
            ) {
                ChalkakRetryButton(copy["home.hero.retry"], callbacks.onHeroRetry, Modifier.testTag("home.hero-retry-button"))
            }
        }
    }
}

/** Topic title for the Empty hero; the standalone words "오늘의 주제" come from the header copy when the title is unavailable. */
private fun topicName(topic: TopicHeader, copy: Copy): String =
    (topic as? TopicHeader.Ready)?.title?.takeIf { it.isNotBlank() } ?: copy["home.topic.header"].substringAfterLast("· ")

/** Hero status tile (screens-a 7.4): `surface` with a 1dp `border`, subheadline `textSecondary` message, [action] 12dp below. */
@Composable
private fun HeroMessage(text: String, tag: String, action: @Composable () -> Unit = {}) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ChalkakTheme.colors.surface)
            .border(BorderStroke(1.dp, ChalkakTheme.colors.border), ChalkakTheme.shapes.photoCard),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.md, Alignment.CenterVertically),
    ) {
        Text(
            text = text,
            style = ChalkakTheme.typography.subheadline,
            color = ChalkakTheme.colors.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp).testTag(tag),
        )
        action()
    }
}

@Composable
private fun HeroEmpty(topic: String, onUpload: () -> Unit) {
    val copy = LocalCopy.current
    val latestUpload by rememberUpdatedState(onUpload)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ChalkakTheme.colors.surface)
            .border(BorderStroke(1.dp, ChalkakTheme.colors.border), ChalkakTheme.shapes.photoCard)
            // The whole card is a tap target for sighted users; semantics (and the tag) belong to the button inside.
            .pointerInput(Unit) { detectTapGestures { latestUpload() } }
            .testTag("home.hero-empty"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.xl, Alignment.CenterVertically),
    ) {
        Text(
            text = copy.format("home.hero.empty", "주제" to topic),
            style = ChalkakTheme.typography.subheadline,
            fontWeight = FontWeight.SemiBold,
            color = ChalkakTheme.colors.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp),
        )
        Box(
            Modifier
                .size(36.dp)
                .background(ChalkakTheme.colors.actionPrimary, CircleShape)
                .clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onUpload)
                .testTag("home.hero-upload-button"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(R.drawable.ic_plus), contentDescription = null, tint = ChalkakTheme.colors.onActionPrimary, modifier = Modifier.size(22.dp))
        }
    }
}

private const val HERO_ASPECT_RATIO = 5f / 6f

/** Text retry (ranking / ISSUE): body in `actionPrimary`, 44dp touch height. */
@Composable
private fun RetryText(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = ChalkakTheme.typography.body,
        color = ChalkakTheme.colors.actionPrimary,
        modifier = modifier
            .heightIn(min = 44.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .wrapContentHeight(Alignment.CenterVertically)
            .padding(horizontal = 16.dp),
    )
}

// ---- section header --------------------------------------------------------------------------------------------------------

@Composable
private fun SectionHeader(title: String, moreTag: String?, onMore: () -> Unit, modifier: Modifier = Modifier, moreText: String? = null) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = ScreenPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = ChalkakTheme.typography.headline,
            fontWeight = FontWeight.Bold,
            color = ChalkakTheme.colors.textPrimary,
            modifier = Modifier.weight(1f),
        )
        if (moreTag != null) {
            MoreLink(moreText, onMore, Modifier.testTag(moreTag))
        }
    }
}

/** "보러가기" + chevron (screens-a 7.6): caption and a 12dp chevron in `textPrimary`, 8dp above and below. */
@Composable
private fun MoreLink(text: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = ChalkakTheme.spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.xs),
    ) {
        if (text != null) Text(text, style = ChalkakTheme.typography.caption, color = ChalkakTheme.colors.textPrimary)
        Icon(painterResource(R.drawable.ic_chevron_right), contentDescription = null, tint = ChalkakTheme.colors.textPrimary, modifier = Modifier.size(12.dp))
    }
}

// ---- week ------------------------------------------------------------------------------------------------------------------

@Composable
private fun WeekBlock(week: Section<List<WeekDay>>, callbacks: HomeCallbacks, image: RemoteImage) {
    val copy = LocalCopy.current
    Column(Modifier.fillMaxWidth().padding(top = SectionGap).testTag("home.week-section")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = ScreenPadding), verticalAlignment = Alignment.CenterVertically) {
            Text(
                copy["home.weekly.title"],
                style = ChalkakTheme.typography.headline,
                fontWeight = FontWeight.Bold,
                color = ChalkakTheme.colors.textPrimary,
            )
            if (week is Section.Ready) {
                Text(
                    text = "${week.value.count { it.entry != null }}/${week.value.size}",
                    style = ChalkakTheme.typography.caption,
                    fontWeight = FontWeight.SemiBold,
                    color = ChalkakTheme.colors.textSecondary,
                    modifier = Modifier.padding(start = ChalkakTheme.spacing.xs).testTag("home.week-count"),
                )
            }
            Spacer(Modifier.weight(1f))
            MoreLink(copy["home.weekly.more"], callbacks.onWeekMoreClick)
        }
        Spacer(Modifier.height(ChalkakTheme.spacing.lg))
        when (week) {
            is Section.Ready -> Row(
                Modifier.fillMaxWidth().padding(horizontal = ScreenPadding),
                horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm),
            ) {
                week.value.forEach { day -> WeekCell(day, callbacks.onWeekDayClick, image, Modifier.weight(1f)) }
            }
            is Section.Error -> SectionMessage(
                text = copy["home.weekly.error"],
                tag = "home.week-error",
                retryTag = "home.week-retry-button",
                onRetry = callbacks.onWeekRetry,
            )
            Section.Loading -> SectionPlaceholder()
        }
    }
}

@Composable
private fun WeekCell(day: WeekDay, onClick: (LocalDate) -> Unit, image: RemoteImage, modifier: Modifier) {
    val copy = LocalCopy.current
    val entry: CalendarEntry? = day.entry
    val tap = if (entry != null) Modifier.tapTarget { onClick(day.date) } else Modifier
    Column(
        modifier = modifier.then(tap).testTag("home.week-day-${day.date}"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(day.weekdayLabel, style = ChalkakTheme.typography.caption, color = ChalkakTheme.colors.textSecondary)
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier.fillMaxWidth().aspectRatio(1f).clip(ChalkakTheme.shapes.small).background(ChalkakTheme.colors.calendarCell),
            contentAlignment = Alignment.Center,
        ) {
            if (entry != null) {
                Box(Modifier.fillMaxSize().testTag("home.week-photo-${day.date}")) { image(entry.thumbnailImageUrl, Modifier.fillMaxSize()) }
            }
            Text(
                text = day.date.dayOfMonth.toString(),
                style = ChalkakTheme.typography.caption.copy(
                    shadow = if (entry != null) Shadow(Color.Black.copy(alpha = 0.45f), Offset(0f, 1f), 4f) else null,
                ),
                fontWeight = FontWeight.SemiBold,
                color = if (entry != null) ChalkakTheme.colors.textOnImage else ChalkakTheme.colors.textSecondary,
            )
            if (entry?.status == ModerationStatus.PENDING) {
                // Pending band along the bottom of the thumbnail, full width and centered.
                Text(
                    text = copy["home.weekly.pending"],
                    style = ChalkakTheme.typography.caption,
                    fontWeight = FontWeight.SemiBold,
                    color = ChalkakTheme.colors.textOnImage,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(ChalkakTheme.colors.scrim)
                        .padding(vertical = 1.dp),
                )
            }
        }
    }
}

/** Tap target without merging its descendants into one node (so tagged children stay addressable). */
@Composable
private fun Modifier.tapTarget(onClick: () -> Unit): Modifier {
    val latest by rememberUpdatedState(onClick)
    return this
        .pointerInput(Unit) { detectTapGestures { latest() } }
        .semantics {
            role = Role.Button
            onClick { latest(); true }
        }
}

// ---- rankings --------------------------------------------------------------------------------------------------------------

private const val RANKING_SLOTS = 5

@Composable
private fun RankingBlock(kind: RankingKind, section: Section<List<HomePost>>, callbacks: HomeCallbacks, image: RemoteImage) {
    val copy = LocalCopy.current
    val prefix = if (kind == RankingKind.Yesterday) "home.ranking" else "home.popular"
    val title = copy[if (kind == RankingKind.Yesterday) "home.ranking.yesterday-title" else "home.ranking.today-title"]
    Column(Modifier.fillMaxWidth().padding(top = SectionGap).testTag("$prefix-section")) {
        SectionHeader(title, "$prefix-more-link", onMore = { callbacks.onRankingMoreClick(kind) })
        Spacer(Modifier.height(ChalkakTheme.spacing.lg))
        when (section) {
            is Section.Ready -> if (section.value.isEmpty()) {
                SectionMessage(copy["home.ranking.empty"], "$prefix-empty")
            } else {
                Row(Modifier.fillMaxWidth().padding(horizontal = ScreenPadding), horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.md)) {
                    // Five equal slots: a short list leaves the right slots empty, so every photo is on screen at once.
                    section.value.take(RANKING_SLOTS).forEach { post ->
                        RankingCard(post, prefix, callbacks, image, Modifier.weight(1f))
                    }
                    repeat(RANKING_SLOTS - section.value.take(RANKING_SLOTS).size) { Spacer(Modifier.weight(1f)) }
                }
            }
            is Section.Error -> SectionMessage(
                text = copy.format("home.ranking.error", "섹션 제목" to title),
                tag = "$prefix-error",
                retryTag = "$prefix-retry-button",
                onRetry = { callbacks.onRankingRetry(kind) },
            )
            Section.Loading -> SectionPlaceholder()
        }
    }
}

@Composable
private fun RankingCard(post: HomePost, prefix: String, callbacks: HomeCallbacks, image: RemoteImage, modifier: Modifier) {
    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(ChalkakTheme.shapes.small)
                .background(ChalkakTheme.colors.calendarCell)
                .clickable(interactionSource = null, indication = null, role = Role.Button) { callbacks.onRankingPostClick(post) }
                .testTag("$prefix-item-${post.id}"),
        ) { image(post.thumbnailImageUrl, Modifier.fillMaxSize()) }
        Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(24.dp)
                    .selectable(
                        selected = post.isLiked,
                        interactionSource = null,
                        indication = null,
                        role = Role.Button,
                        onClick = { callbacks.onLikeClick(post) },
                    )
                    .testTag("$prefix-like-button-${post.id}"),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(if (post.isLiked) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline),
                    contentDescription = null,
                    tint = if (post.isLiked) ChalkakTheme.colors.destructive else ChalkakTheme.colors.iconSecondary,
                    modifier = Modifier.size(16.dp),
                )
            }
            Text(
                text = post.likeCount.toString(),
                style = ChalkakTheme.typography.caption,
                color = ChalkakTheme.colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Clip,
                modifier = Modifier.testTag("$prefix-like-count-${post.id}"),
            )
        }
    }
}

// ---- ISSUE -----------------------------------------------------------------------------------------------------------------

@Composable
private fun IssueHeader() {
    val copy = LocalCopy.current
    Column(Modifier.fillMaxWidth().padding(top = SectionGap).testTag("home.issue-section")) {
        SectionHeader(copy["home.banner.title"], moreTag = null, onMore = {})
        Spacer(Modifier.height(ChalkakTheme.spacing.lg))
    }
}

/** ISSUE banner (screens-a 7.8): 1672 : 941 image on `surfaceElevated`, `shapes.large`, then bold subheadline title and caption subtitle. */
@Composable
private fun BannerItem(banner: Banner, callbacks: HomeCallbacks, image: RemoteImage) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = ScreenPadding)
            .padding(bottom = SectionGap)
            .clip(ChalkakTheme.shapes.large)
            .clickable(interactionSource = null, indication = null, role = Role.Button) { callbacks.onBannerClick(banner) }
            .testTag("home.issue-item-${banner.id}"),
        verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.lg),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1672f / 941f)
                .clip(ChalkakTheme.shapes.large)
                .background(ChalkakTheme.colors.surfaceElevated),
        ) {
            image(banner.thumbnailUrl, Modifier.fillMaxSize())
        }
        Column(verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm)) {
            Text(
                banner.title,
                style = ChalkakTheme.typography.subheadline,
                fontWeight = FontWeight.Bold,
                color = ChalkakTheme.colors.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                banner.subtitle,
                style = ChalkakTheme.typography.caption,
                color = ChalkakTheme.colors.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ---- shared section states -------------------------------------------------------------------------------------------------

@Composable
private fun SectionMessage(text: String, tag: String, retryTag: String? = null, onRetry: () -> Unit = {}) {
    val copy = LocalCopy.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = ScreenPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.md),
    ) {
        Text(
            text = text,
            style = ChalkakTheme.typography.footnote,
            color = ChalkakTheme.colors.textSecondary,
            modifier = Modifier.weight(1f, fill = false).testTag(tag),
        )
        if (retryTag != null) ChalkakRetryButton(copy["home.hero.retry"], onRetry, Modifier.testTag(retryTag), size = 32.dp)
    }
}

/** Loading stand-in for a section: a shimmering skeleton row (still when the shimmer is off, so the screen can go idle in tests). */
@Composable
private fun SectionPlaceholder() {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = ScreenPadding),
        horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm),
    ) {
        repeat(7) { ChalkakSkeleton(Modifier.weight(1f).aspectRatio(1f).clip(ChalkakTheme.shapes.small)) }
    }
}
