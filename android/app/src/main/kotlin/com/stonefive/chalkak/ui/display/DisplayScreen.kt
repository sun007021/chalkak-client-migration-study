package com.stonefive.chalkak.ui.display

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
private val GridGap = 8.dp

/** Stateless exhibition tab. The only local state is the date picker sheet (open flag). */
@Composable
fun DisplayScreen(
    state: DisplayUiState,
    callbacks: DisplayCallbacks,
    remoteImage: RemoteImage,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    Box(modifier.fillMaxSize().background(ChalkakTheme.colors.background).testTag("display.root")) {
        Column(Modifier.fillMaxSize()) {
            Header(state, callbacks, onPickDate = { pickerOpen = true })
            Box(Modifier.fillMaxWidth().weight(1f)) {
                when (state.status) {
                    DisplayStatus.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Loading(Modifier.testTag("display.loading"))
                    }
                    DisplayStatus.Empty -> Message(Modifier.testTag("display.empty-state")) {
                        Text(copy["display.empty"], style = MaterialTheme.typography.bodyLarge, color = ChalkakTheme.colors.textInactive)
                    }
                    DisplayStatus.Error -> Message(Modifier.testTag("display.error-state")) {
                        Text(
                            copy[state.errorCopyKey ?: "display.error"],
                            style = MaterialTheme.typography.bodyLarge,
                            color = ChalkakTheme.colors.textPrimary,
                            textAlign = TextAlign.Center,
                        )
                        if (state.showRetry) {
                            Spacer(Modifier.height(16.dp))
                            ChalkakButton(copy["display.retry"], callbacks.onRetry, Modifier.testTag("display.retry-button"))
                        }
                    }
                    // A new date starts at the top (the grid must not keep its anchor on a post that is in both lists).
                    DisplayStatus.Content -> androidx.compose.runtime.key(state.date) { Content(state, callbacks, remoteImage) }
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

@Composable
private fun Header(state: DisplayUiState, callbacks: DisplayCallbacks, onPickDate: () -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ArrowButton(R.drawable.ic_chevron_left, copy["display.nav.previous"], state.canGoPrevious, callbacks.onPreviousDate, "display.prev-date-button")
            Box(
                Modifier
                    .testTag("display.date-picker-button")
                    .pointerInput(Unit) { detectTapGestures { onPickDate() } }
                    .semantics { role = Role.Button; onClick { onPickDate(); true } }
                    .padding(horizontal = 8.dp, vertical = 8.dp),
            ) {
                Text(
                    text = state.dateLabel ?: DateFormats.monthDay(state.date),
                    style = MaterialTheme.typography.titleLarge,
                    color = colors.textPrimary,
                    modifier = Modifier.testTag("display.date-label"),
                )
            }
            ArrowButton(R.drawable.ic_chevron_right, copy["display.nav.next"], state.canGoNext, callbacks.onNextDate, "display.next-date-button")
        }
        state.topic?.let {
            Text(it.title, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary, modifier = Modifier.testTag("display.topic-title"))
        }
        Text(
            copy[state.descriptionKey],
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textNeutral,
            modifier = Modifier.padding(top = 2.dp).testTag("display.description"),
        )
        if (state.sortOptions.isNotEmpty()) {
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                state.sortOptions.forEach { sort ->
                    SortTab(sort, selected = sort == state.sort, onClick = { callbacks.onSortSelected(sort) })
                }
            }
        }
    }
}

@Composable
private fun ArrowButton(icon: Int, description: String, enabled: Boolean, onClick: () -> Unit, tag: String) {
    Box(
        Modifier
            .size(44.dp)
            .testTag(tag)
            .semantics { contentDescription = description }
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painterResource(icon),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            alpha = if (enabled) 1f else 0.28f,
        )
    }
}

@Composable
private fun SortTab(sort: PostSort, selected: Boolean, onClick: () -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val (tag, key) = when (sort) {
        PostSort.RECENT -> "display.sort-recent-tab" to "display.sort.recent"
        PostSort.POPULAR -> "display.sort-popular-tab" to "display.sort.popular"
        PostSort.RANDOM -> "display.sort-random-tab" to "display.sort.random"
    }
    Box(
        Modifier
            .testTag(tag)
            .clip(CircleShape)
            .background(if (selected) colors.actionPrimary else colors.inputBackground)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(copy[key], style = MaterialTheme.typography.labelLarge, color = if (selected) colors.onActionPrimary else colors.textPrimary)
    }
}

@Composable
private fun Content(state: DisplayUiState, callbacks: DisplayCallbacks, remoteImage: RemoteImage) {
    val copy = LocalCopy.current
    val gridState = rememberLazyStaggeredGridState()
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
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 24.dp),
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
                    style = MaterialTheme.typography.titleSmall,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.padding(vertical = 8.dp),
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
            .clip(RoundedCornerShape(12.dp))
            .background(ChalkakTheme.colors.inputBackground)
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
            modifier = Modifier.align(Alignment.BottomStart).padding(4.dp),
        )
    }
}

@Composable
private fun LikeOverlay(post: PostSummary, onClick: () -> Unit, buttonTag: String, countTag: String, modifier: Modifier) {
    LikeButton(
        isLiked = post.isLiked,
        count = post.likeCount,
        enabled = true,
        onClick = onClick,
        buttonTag = buttonTag,
        countTag = countTag,
        modifier = modifier
            .background(Color(0x66000000), CircleShape)
            .padding(end = 10.dp),
        tint = Color.White,
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
            style = MaterialTheme.typography.titleSmall,
            color = ChalkakTheme.colors.textPrimary,
            modifier = Modifier.padding(vertical = 8.dp),
        )
        HorizontalPager(pagerState, Modifier.fillMaxWidth(), pageSpacing = GridGap) { index ->
            val post = featured[index]
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(ChalkakTheme.colors.inputBackground)
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
                    modifier = Modifier.align(Alignment.BottomStart).padding(8.dp),
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
            repeat(featured.size) { i ->
                Box(
                    Modifier
                        .padding(3.dp)
                        .size(6.dp)
                        .background(if (i == pagerState.currentPage) ChalkakTheme.colors.actionPrimary else ChalkakTheme.colors.border, CircleShape),
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

    BackHandler(onBack = onDismiss)
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0x66000000))
            .pointerInput(Unit) { detectTapGestures { onDismiss() } },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(colors.inputBackground, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .pointerInput(Unit) { detectTapGestures { } }
                .padding(horizontal = 20.dp, vertical = 20.dp)
                .testTag("display.date-picker-sheet"),
        ) {
            Text(copy["display.picker.title"], style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
}

private val RowHeight = 40.dp

@Composable
private fun Wheel(options: List<Int>, selected: Int, copyKey: String, tag: String, modifier: Modifier, onSelect: (Int) -> Unit) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val state: LazyListState = rememberLazyListState(
        initialFirstVisibleItemIndex = (options.indexOf(selected) - 2).coerceAtLeast(0),
    )
    LazyColumn(modifier.height(RowHeight * 5).testTag(tag), state = state) {
        items(options) { n ->
            val isSelected = n == selected
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(RowHeight)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (isSelected) colors.background else Color.Transparent)
                    .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelect(n) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    copy.format(copyKey, "n" to n),
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isSelected) colors.textPrimary else colors.textInactive,
                )
            }
        }
    }
}
