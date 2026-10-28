package kr.chalkak.core.data.notification.testing

import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.notification.NotificationDetail
import kr.chalkak.core.data.notification.NotificationItem
import kr.chalkak.core.data.notification.NotificationPage
import kr.chalkak.core.data.notification.NotificationRepository
import kr.chalkak.core.data.notification.NotificationType
import kr.chalkak.core.data.notification.PushDeviceRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

fun httpFail(status: Int, code: ErrorCode = ErrorCode.BUSINESS_ERROR) = ApiResult.Failure(ApiError.Http(status, code))

fun offlineFail() = ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE))

fun invalidResponseFail() = ApiResult.Failure(ApiError.InvalidResponse("fixture"))

/**
 * Turns the files in `shared/fixtures/notification` into domain models WITHOUT production mapping code, so holder tests depend on the
 * fixtures only. Every function takes the path relative to `shared/fixtures/`.
 */
object NotificationFixtureModels {
    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

    private fun type(raw: String?): NotificationType = NotificationType.entries.firstOrNull { it.name == raw } ?: NotificationType.UNKNOWN

    fun item(o: JsonObject): NotificationItem = NotificationItem(
        id = o.str("id")!!,
        type = type(o.str("type")),
        rawType = o.str("type")!!,
        sourceType = o.str("sourceType"),
        sourceId = o.str("sourceId"),
        title = o.str("title")!!,
        body = o.str("body")!!,
        thumbnailImageUrl = o.str("thumbnailImageUrl"),
        readAt = o.str("readAt")?.let(Instant::parse),
        createdAt = Instant.parse(o.str("createdAt")!!),
    )

    fun page(path: String): NotificationPage = Fixtures.json(path).jsonObject.let { o ->
        NotificationPage(
            currentPage = o["currentPage"]!!.jsonPrimitive.intOrNull!!,
            pageSize = o["pageSize"]!!.jsonPrimitive.intOrNull!!,
            hasNext = o["hasNext"]!!.jsonPrimitive.booleanOrNull!!,
            items = o.getValue("notifications").jsonArray.map { item(it.jsonObject) },
        )
    }

    fun detail(path: String): NotificationDetail = Fixtures.json(path).jsonObject.let { o ->
        NotificationDetail(
            id = o.str("id")!!,
            type = type(o.str("type")),
            title = o.str("title")!!,
            body = o.str("body")!!,
            originalImageUrl = o.str("originalImageUrl"),
            rejectionReason = o.str("rejectionReason"),
            readAt = o.str("readAt")?.let(Instant::parse),
            createdAt = Instant.parse(o.str("createdAt")!!),
        )
    }

    /** One row of a list fixture by id. */
    fun itemById(path: String, id: String): NotificationItem = page(path).items.first { it.id == id }

    fun success(path: String) = ApiResult.Success(page(path))
}

/**
 * Scripted [NotificationRepository]. Unscripted calls succeed with an empty last page / Unit.
 * Results are taken when a call STARTS (so overlapping calls get results in call order); gates then hold the call in flight,
 * one gate per call in call order.
 */
class FakeNotificationRepository(val log: EventLog = EventLog()) : NotificationRepository {
    val listCalls = CopyOnWriteArrayList<Int>()
    val detailCalls = CopyOnWriteArrayList<String>()
    val readCalls = CopyOnWriteArrayList<String>()
    val listResults = ArrayDeque<ApiResult<NotificationPage>>()
    val detailResults = ArrayDeque<ApiResult<NotificationDetail>>()
    val readResults = ArrayDeque<ApiResult<Unit>>()
    val listGates = ArrayDeque<CompletableDeferred<Unit>>()
    val detailGates = ArrayDeque<CompletableDeferred<Unit>>()
    val readGates = ArrayDeque<CompletableDeferred<Unit>>()

    override suspend fun list(page: Int): ApiResult<NotificationPage> {
        log.add("list:$page")
        listCalls += page
        val result = listResults.removeFirstOrNull() ?: ApiResult.Success(NotificationPage(page, 20, false, emptyList()))
        listGates.removeFirstOrNull()?.await()
        return result
    }

    override suspend fun detail(id: String): ApiResult<NotificationDetail> {
        log.add("detail:$id")
        detailCalls += id
        val result = detailResults.removeFirstOrNull() ?: invalidResponseFail()
        detailGates.removeFirstOrNull()?.await()
        return result
    }

    override suspend fun markRead(id: String): ApiResult<Unit> {
        log.add("read:$id")
        readCalls += id
        val result = readResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
        readGates.removeFirstOrNull()?.await()
        return result
    }
}

/** Scripted [PushDeviceRepository]. Unscripted calls succeed. */
class FakePushDeviceRepository(val log: EventLog = EventLog()) : PushDeviceRepository {
    val tokens = CopyOnWriteArrayList<String>()
    val results = ArrayDeque<ApiResult<Unit>>()
    val gates = ArrayDeque<CompletableDeferred<Unit>>()

    override suspend fun register(fcmToken: String): ApiResult<Unit> {
        log.add("register:$fcmToken")
        tokens += fcmToken
        val result = results.removeFirstOrNull() ?: ApiResult.Success(Unit)
        gates.removeFirstOrNull()?.await()
        return result
    }
}
