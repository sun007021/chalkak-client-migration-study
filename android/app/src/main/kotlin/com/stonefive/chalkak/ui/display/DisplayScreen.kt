package com.stonefive.chalkak.ui.display

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import com.stonefive.chalkak.ui.components.ChalkakSortSelector
import com.stonefive.chalkak.ui.components.ChalkakSkeleton
import com.stonefive.chalkak.ui.components.ChalkakSheet
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.LikeButton
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import java.time.LocalDate
import kotlinx.coroutines.flow.distinctUntilChanged
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.common.TopicDateRange
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.display.DatePickerOptions
import kr.chalkak.feature.display.DisplayStatus
import kr.chalkak.feature.display.DisplayUiState

/** User events of the exhibition screen; [DisplayRoute] maps each to the matching `DisplayStateHolder` method. */
data class DisplayCallbacks(
    val onPreviousDate: () -> Unit = {},
    val onNextDate: () -> Unit = {},
    /** Date picker "confirm" (already combined into one date). */
    val onDateSelected: (LocalDate) -> Unit = {},
    val onSortSelected: (PostSort) -> Unit = {},
    /** The grid scrolled within the last 3 items. */
    val onReachedEnd: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onPhotoClick: (postId: String) -> Unit = {},
    val onLikeClick: (postId: String) -> Unit = {},
    val onFeaturedPageChanged: (index: Int) -> Unit = {},
    /** `ToastLayer` expiry (2.5 s) of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

private const val END_THRESHOLD = 3
/** Grid gutters (screens-a 9.3: iOS and Android unified on 25 / 12 / 12). */
private val GridGap = 12.dp

/** Stateless exhibition tab. The only local state is the date picker sheet (open flag). */
@Composable
fun DisplayScreen(
    state: DisplayUiState,
    callbacks: DisplayCallbacks,
    remoteImage: RemoteImage,
    modifier: Modifier = Modifier,
    scrollToTopCount: Int = 0,
) {
    val copy = LocalCopy.current
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    Box(modifier.fillMaxSize().background(ChalkakTheme.colors.background).testTag("display.root")) {
        Column(Modifier.fillMaxSize()) {
            Header(state, callbacks, onPickDate = { pickerOpen = true })
            Box(Modifier.fillMaxWidth().weight(1f)) {
                when (state.status) {
                    DisplayStatus.Loading -> DisplaySkeleton(Modifier.testTag("display.loading"))
                    DisplayStatus.Empty -> Message(Modifier.testTag("display.empty-state")) {
                        Text(copy["display.empty"], style = ChalkakTheme.typography.body, color = ChalkakTheme.colors.textSecondary)
                    }
                    DisplayStatus.Error -> Message(Modifier.testTag("display.error-state")) {
                        Text(
                            copy[state.errorCopyKey ?: "display.error"],
                            style = ChalkakTheme.typography.body,
                            color = ChalkakTheme.colors.textSecondary,
                            textAlign = TextAlign.Center,
                        )
                        if (state.showRetry) {
                            Spacer(Modifier.height(ChalkakTheme.spacing.xl))
                            ChalkakButton(copy["display.retry"], callbacks.onRetry, Modifier.testTag("display.retry-button"))
                        }
                    }
                    // A new date starts at the top (the grid must not keep its anchor on a post that is in both lists).
                    DisplayStatus.Content -> androidx.compose.runtime.key(state.date) { Content(state, callbacks, remoteImage, scrollToTopCount) }
                }
                if (state.isRefreshing) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter).testTag("display.refresh-indicator"),
                        color = ChalkakTheme.colors.actionPrimary,
                        trackColor = Color.Transparent,
                    )
                }
                if (state.isPaging) {
                    Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) { Loading(Modifier.testTag("display.load-more-indicator")) }
                }
            }
        }
        ToastLayer(
            toast = state.toast?.let { ToastUi(it.id, copy[it.copyKey]) },
            onExpired = callbacks.onToastExpired,
        )
        if (pickerOpen) {
            DatePickerSheet(
                range = TopicDateRange(state.earliestDate, state.latestDate),
                initial = state.date,
                onConfirm = {
                    pickerOpen = false
                    callbacks.onDateSelected(it)
                },
                onDismiss = { pickerOpen = false },
            )
        }
    }
}

@Composable
private fun Message(modifier: Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) { content() }
}

/** Loading stand-in: two columns of shimmering photo tiles with the staggered heights of the real grid (screens-b 1.5). */
@Composable
private fun DisplaySkeleton(modifier: Modifier = Modifier) {
    val ratios = listOf(listOf(3f / 4, 1f, 4f / 5), listOf(1f, 3f / 4, 1f))
    Row(
        modifier.fillMaxSize().padding(horizontal = ChalkakTheme.spacing.screenHorizontal, vertical = ChalkakTheme.spacing.lg),
        horizontalArrangement = Arrangement.spacedBy(GridGap),
    ) {
        ratios.forEach { column ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(GridGap)) {
                column.forEach { ratio -> ChalkakSkeleton(Modifier.fillMaxWidth().aspectRatio(ratio).clip(ChalkakTheme.shapes.photoCard)) }
            }
        }
    }
}

/** Date row, topic, description and sort selector (screens-b 2.1): headline date between 24dp arrows, hairline under the topic block. */
@Composable
private fun Header(state: DisplayUiState, callbacks: DisplayCallbacks, onPickDate: () -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val side = ChalkakTheme.spacing.screenHorizontal
    Column(Modifier.fillMaxWidth().background(colors.background).statusBarsPadding()) {
        Row(Modifier.padding(start = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            ArrowButton(R.drawable.ic_display_arrow_left, copy["display.nav.previous"], state.canGoPrevious, callbacks.onPreviousDate, "display.prev-date-button")
            Box(
                Modifier
                    .testTag("display.date-picker-button")
                    .pointerInput(Unit) { detectTapGestures { onPickDate() } }
                    .semantics { role = Role.Button; onClick { onPickDate(); true } }
                    .defaultMinSize(minHeight = 48.dp)
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    text = state.dateLabel ?: DateFormats.monthDay(state.date),
                    style = ChalkakTheme.typography.headline,
                    color = colors.textPrimary,
                    maxLines = 1,
                    modifier = Modifier.testTag("display.date-label"),
                )
            }
            ArrowButton(R.drawable.ic_display_arrow_right, copy["display.nav.next"], state.canGoNext, callbacks.onNextDate, "display.next-date-button")
        }
        state.topic?.let {
            Text(
                it.title,
                style = ChalkakTheme.typography.title2,
                color = colors.textPrimary,
                modifier = Modifier.padding(start = side, top = ChalkakTheme.spacing.xs, end = side).testTag("display.topic-title"),
            )
        }
        Text(
            copy[state.descriptionKey],
            style = ChalkakTheme.typography.subheadline,
            color = colors.textInactive,
            modifier = Modifier.padding(start = side, top = ChalkakTheme.spacing.md, end = side, bottom = ChalkakTheme.spacing.xl).testTag("display.description"),
        )
        HorizontalDivider(thickness = 0.5.dp, color = colors.border)
        if (state.sortOptions.isNotEmpty()) {
            ChalkakSortSelector(
                options = state.sortOptions,
                selected = state.sort,
                label = { copy[sortKey(it)] },
                tag = ::sortTag,
                onSelect = callbacks.onSortSelected,
                modifier = Modifier.padding(horizontal = side),
            )
        }
    }
}

private fun sortTag(sort: PostSort) = when (sort) {
    PostSort.RECENT -> "display.sort-recent-tab"
    PostSort.POPULAR -> "display.sort-popular-tab"
    PostSort.RANDOM -> "display.sort-random-tab"
}

private fun sortKey(sort: PostSort) = when (sort) {
    PostSort.RECENT -> "display.sort.recent"
    PostSort.POPULAR -> "display.sort.popular"
    PostSort.RANDOM -> "display.sort.random"
}

@Composable
private fun ArrowButton(icon: Int, description: String, enabled: Boolean, onClick: () -> Unit, tag: String) {
    Box(
        Modifier
            .size(48.dp)
            .testTag(tag)
            .semantics { contentDescription = description }
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painterResource(icon),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            alpha = if (enabled) 1f else 0.35f,
        )
    }
}

@Composable
private fun Content(state: DisplayUiState, callbacks: DisplayCallbacks, remoteImage: RemoteImage, scrollToTopCount: Int) {
    val copy = LocalCopy.current
    val gridState = rememberLazyStaggeredGridState()
    // Re-selecting the tab (count changes after this composition began) scrolls to the top.
    val initialScrollCount = remember { scrollToTopCount }
    LaunchedEffect(scrollToTopCount) { if (scrollToTopCount != initialScrollCount) gridState.animateScrollToItem(0) }
    val onReachedEnd by rememberUpdatedState(callbacks.onReachedEnd)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index
            last != null && info.totalItemsCount > 0 && last >= info.totalItemsCount - END_THRESHOLD
        }.distinctUntilChanged().collect { if (it) onReachedEnd() }
    }
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(2),
        modifier = Modifier.fillMaxSize().testTag("display.grid"),
        state = gridState,
        contentPadding = PaddingValues(start = ChalkakTheme.spacing.screenHorizontal, end = ChalkakTheme.spacing.screenHorizontal, top = ChalkakTheme.spacing.lg, bottom = ChalkakTheme.spacing.xxl),
        horizontalArrangement = Arrangement.spacedBy(GridGap),
        verticalItemSpacing = GridGap,
    ) {
        if (state.isArchive && state.featured.isNotEmpty()) {
            item(key = "featured", span = StaggeredGridItemSpan.FullLine) {
                FeaturedPager(state, callbacks, remoteImage)
            }
            item(key = "grid-title", span = StaggeredGridItemSpan.FullLine) {
                Text(
                    copy["display.grid.title"],
                    style = ChalkakTheme.typography.callout,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.padding(vertical = ChalkakTheme.spacing.sm),
                )
            }
        }
        items(state.photos, key = { it.id }) { post ->
            PhotoCard(post, callbacks, remoteImage)
        }
    }
}

@Composable
private fun PhotoCard(post: PostSummary, callbacks: DisplayCallbacks, remoteImage: RemoteImage) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(ChalkakTheme.shapes.photoCard)
            .background(Color.Black)
            .testTag("display.item-${post.id}"),
    ) {
        Box(Modifier.fillMaxWidth().clickable { callbacks.onPhotoClick(post.id) }) {
            remoteImage(post.thumbnailOrOriginalUrl, Modifier.fillMaxWidth())
        }
        LikeOverlay(
            post = post,
            onClick = { callbacks.onLikeClick(post.id) },
            buttonTag = "display.like-button-${post.id}",
            countTag = "display.like-count-${post.id}",
            modifier = Modifier.align(Alignment.BottomStart),
        )
    }
}

/** Heart + count over the photo (screens-b 2.2): white on the image with a soft shadow, no dark chip; 10dp from the corner. */
@Composable
private fun LikeOverlay(post: PostSummary, onClick: () -> Unit, buttonTag: String, countTag: String, modifier: Modifier) {
    LikeButton(
        isLiked = post.isLiked,
        count = post.likeCount,
        enabled = true,
        onClick = onClick,
        buttonTag = buttonTag,
        countTag = countTag,
        modifier = modifier,
        tint = ChalkakTheme.colors.textOnImage,
        liked = ChalkakTheme.colors.textOnImage,
        onImage = true,
    )
}

@Composable
private fun FeaturedPager(state: DisplayUiState, callbacks: DisplayCallbacks, remoteImage: RemoteImage) {
    val copy = LocalCopy.current
    val featured = state.featured
    val pagerState = rememberPagerState(initialPage = state.featuredPage.coerceIn(0, featured.lastIndex)) { featured.size }
    val onPageChanged by rememberUpdatedState(callbacks.onFeaturedPageChanged)
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }.distinctUntilChanged().collect { onPageChanged(it) }
    }
    Column(Modifier.fillMaxWidth().testTag("display.featured-pager")) {
        Text(
            copy["display.featured.title"],
            style = ChalkakTheme.typography.callout,
            color = ChalkakTheme.colors.textPrimary,
            modifier = Modifier.padding(vertical = ChalkakTheme.spacing.sm),
        )
        HorizontalPager(pagerState, Modifier.fillMaxWidth(), pageSpacing = GridGap) { index ->
            val post = featured[index]
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(ChalkakTheme.shapes.photoCard)
                    .background(Color.Black)
                    .testTag("display.featured-item-${post.id}"),
            ) {
                Box(Modifier.fillMaxWidth().clickable { callbacks.onPhotoClick(post.id) }) {
                    remoteImage(post.originalImageUrl, Modifier.fillMaxWidth())
                }
                LikeOverlay(
                    post = post,
                    onClick = { callbacks.onLikeClick(post.id) },
                    buttonTag = "display.featured-like-button-${post.id}",
                    countTag = "display.featured-like-count-${post.id}",
                    modifier = Modifier.align(Alignment.BottomStart),
                )
            }
        }
        // Page indicator (screens-b 2.3): selected 24 x 7 capsule in actionPrimary, others 7dp dots in textMuted at 45%.
        Row(Modifier.fillMaxWidth().padding(top = ChalkakTheme.spacing.lg), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
            repeat(featured.size) { i ->
                val current = i == pagerState.currentPage
                Box(
                    Modifier
                        .size(width = if (current) 24.dp else 7.dp, height = 7.dp)
                        .background(
                            if (current) ChalkakTheme.colors.actionPrimary else ChalkakTheme.colors.textMuted.copy(alpha = ChalkakTheme.colors.textMuted.alpha * 0.45f),
                            ChalkakTheme.shapes.pill,
                        ),
                )
            }
        }
    }
}

/** In-tree bottom sheet (like `ChalkakAlert`, testable): year / month / day columns limited to [range]; tap selects, confirm picks. */
@Composable
private fun DatePickerSheet(range: TopicDateRange, initial: LocalDate, onConfirm: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    var year by remember { mutableIntStateOf(initial.year) }
    var month by remember { mutableIntStateOf(initial.monthValue) }
    var day by remember { mutableIntStateOf(initial.dayOfMonth) }
    val years = DatePickerOptions.years(range)
    val shownYear = year.coerceIn(years.first(), years.last())
    val months = DatePickerOptions.months(shownYear, range)
    val shownMonth = month.coerceIn(months.first(), months.last())
    val days = DatePickerOptions.days(shownYear, shownMonth, range)
    val shownDay = day.coerceIn(days.first(), days.last())

    ChalkakSheet(onDismiss = onDismiss, tag = "display.date-picker-sheet") {
        Text(copy["display.picker.title"], style = ChalkakTheme.typography.title3, color = colors.textPrimary)
        Row(Modifier.fillMaxWidth().padding(vertical = ChalkakTheme.spacing.lg), horizontalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.lg)) {
            Wheel(years, shownYear, "display.picker.year", "display.date-picker-year", Modifier.weight(1f)) { year = it }
            Wheel(months, shownMonth, "display.picker.month", "display.date-picker-month", Modifier.weight(1f)) { month = it }
            Wheel(days, shownDay, "display.picker.day", "display.date-picker-day", Modifier.weight(1f)) { day = it }
        }
        ChalkakButton(
            text = copy["common.confirm"],
            onClick = { onConfirm(DatePickerOptions.pick(shownYear, shownMonth, shownDay, range)) },
            modifier = Modifier.fillMaxWidth().testTag("display.date-picker-confirm-button"),
        )
    }
}

/** Wheel row height and visible rows (screens-b 1.3: 44dp x 5). The selected row is kept in the middle, between two `border` hairlines. */
private val RowHeight = 44.dp

@Composable
private fun Wheel(options: List<Int>, selected: Int, copyKey: String, tag: String, modifier: Modifier, onSelect: (Int) -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val selectedIndex = options.indexOf(selected).coerceAtLeast(0)
    val state: LazyListState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    LaunchedEffect(selectedIndex, options.size) { state.animateScrollToItem(selectedIndex) }
    Box(modifier.height(RowHeight * 5)) {
        Column(Modifier.align(Alignment.Center)) {
            HorizontalDivider(thickness = 1.dp, color = colors.border)
            Spacer(Modifier.height(RowHeight - 2.dp))
            HorizontalDivider(thickness = 1.dp, color = colors.border)
        }
        LazyColumn(Modifier.fillMaxSize().testTag(tag), state = state, contentPadding = PaddingValues(vertical = RowHeight * 2)) {
            itemsIndexed(options) { index, n ->
                val isSelected = n == selected
                val distance = kotlin.math.abs(index - selectedIndex)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(RowHeight)
                        .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelect(n) }),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        copy.format(copyKey, "n" to n),
                        style = when (distance) {
                            0 -> ChalkakTheme.typography.title3
                            1 -> ChalkakTheme.typography.body
                            else -> ChalkakTheme.typography.callout
                        },
                        color = when (distance) {
                            0 -> colors.textPrimary
                            1 -> colors.textMuted
                            else -> colors.textPrimary.copy(alpha = 0.22f)
                        },
                    )
                }
            }
        }
    }
}
