import { ApiError, InvalidResponseError, NetworkError, isCancellation } from '../../core/net/errors';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { createNotificationHarness, detailKey, noti, PAGE1, readKey } from '../../test/notificationHarness';
import { track } from '../../test/track';

const query = (call: { query: URLSearchParams }) => Object.fromEntries(call.query.entries());
const instant = (s: string) => Date.parse(s);
const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();

/** page1 fixture 본문을 고쳐 만든 응답(계약 위반 재현). */
function pageWith(change: (item: Record<string, unknown>) => void, extra: Record<string, unknown> = {}): Response {
  const body = structuredClone(loadFixture('notification/notifications__page1.json').json) as { notifications: Record<string, unknown>[] };
  change(body.notifications[0]!);
  return json(200, { ...body, ...extra });
}

/** 가짜 시계를 움직여 재시도(0.5초, 1초) 뒤 약속이 끝나게 한다. */
async function settled<T>(h: { clock: { advance(ms: number): Promise<void> } }, promise: Promise<T>) {
  const result = track(promise);
  await h.clock.advance(5_000);
  return result;
}

describe('NotificationRepository.fetchPage (GET /notifications)', () => {
  it('TC-NOTI-002 page=1&pageSize=20과 Authorization을 보낸다', async () => {
    const h = createNotificationHarness();
    await h.repository.fetchPage(1);
    const calls = h.router.calls(PAGE1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe('/notifications');
    expect(query(calls[0]!)).toEqual({ page: '1', pageSize: '20' });
    expect(calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(calls[0]!.body).toBeNull();
  });

  it('TC-NOTI-002 다음 페이지는 page만 바뀐다', async () => {
    const h = createNotificationHarness();
    await h.repository.fetchPage(2);
    expect(query(h.ff.calls[0]!)).toEqual({ page: '2', pageSize: '20' });
  });

  it('TC-NOTI-003 page1 fixture를 읽는다: 20건, 서버 순서, hasNext, 항목 9개 필드와 UTC Instant', async () => {
    const h = createNotificationHarness();
    const page = await h.repository.fetchPage(1);
    expect(page).toMatchObject({ currentPage: 1, pageSize: 20, hasNext: true });
    expect(page.notifications).toHaveLength(20);
    expect(page.notifications.map((n) => n.id.slice(-2))).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(page.notifications[0]).toEqual({
      id: noti(1),
      type: 'POST_APPROVED',
      sourceType: 'POST',
      sourceId: '22222222-2222-4222-8222-222222222201',
      title: '사진이 승인되었어요',
      body: '오늘의 사진이 전시에 올라갔어요.',
      thumbnailImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/thumbnail.webp',
      readAt: null,
      createdAt: instant('2026-10-27T01:30:00Z'),
    });
    expect(page.notifications[4]).toMatchObject({ type: 'NOTICE', sourceType: 'NOTICE', thumbnailImageUrl: null, readAt: null });
    expect(typeof page.notifications[5]!.readAt).toBe('number'); // 06은 읽음
  });

  it('TC-NOTI-003 sourceType·sourceId·thumbnailImageUrl·readAt이 null이거나 키가 없어도 null로 읽는다', async () => {
    const h = createNotificationHarness();
    h.router.set(PAGE1, () =>
      pageWith((item) => {
        item['sourceType'] = null;
        delete item['sourceId'];
        delete item['thumbnailImageUrl'];
        delete item['readAt'];
      }),
    );
    const page = await h.repository.fetchPage(1);
    expect(page.notifications[0]).toMatchObject({ sourceType: null, sourceId: null, thumbnailImageUrl: null, readAt: null });
  });

  it('TC-NOTI-003 TC-NOTI-012 createdAt은 소수 초가 있거나 없는 UTC Instant를 모두 읽는다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__kst-boundary' } });
    const page = await h.repository.fetchPage(1);
    expect(page.notifications.map((n) => n.createdAt)).toEqual([instant('2026-10-26T15:00:00Z'), instant('2026-10-26T14:59:59Z'), instant('2026-10-26T15:00:00.123Z')]);
  });

  it('TC-NOTI-023 날짜로 거르지 않는다: 30일 경계와 그보다 오래된 항목도 모두 돌려준다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__30day-boundary' } });
    const page = await h.repository.fetchPage(1);
    expect(page.notifications.map((n) => n.id.slice(-2))).toEqual(['01', '02']);
  });

  it('TC-NOTI-024 알 수 없는 type(FUTURE_TYPE)과 sourceType null은 그대로 통과한다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__unknown-type' } });
    const page = await h.repository.fetchPage(1);
    expect(page.notifications[0]).toMatchObject({ type: 'FUTURE_TYPE', sourceType: null, sourceId: null });
  });

  it('TC-NOTI-003 모르는 키는 무시한다', async () => {
    const h = createNotificationHarness();
    h.router.set(PAGE1, () => pageWith((item) => (item['futureField'] = { a: 1 }), { futureTop: true }));
    await expect(h.repository.fetchPage(1)).resolves.toMatchObject({ currentPage: 1 });
  });

  it('TC-NOTI-005 빈 응답은 빈 목록과 hasNext=false다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__empty' } });
    await expect(h.repository.fetchPage(1)).resolves.toMatchObject({ notifications: [], hasNext: false });
  });

  it('TC-NOTI-008 필수 필드(title) 누락은 InvalidResponseError다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__missing-fields' } });
    await expect(h.repository.fetchPage(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['id 없음', (item: Record<string, unknown>) => delete item['id']],
    ['type 없음', (item: Record<string, unknown>) => delete item['type']],
    ['body 숫자', (item: Record<string, unknown>) => (item['body'] = 3)],
    ['createdAt 없음', (item: Record<string, unknown>) => delete item['createdAt']],
    ['createdAt 형식 오류', (item: Record<string, unknown>) => (item['createdAt'] = '2026-10-27 01:30')],
    ['createdAt 시간대 오프셋', (item: Record<string, unknown>) => (item['createdAt'] = '2026-10-27T10:30:00+09:00')],
  ])('TC-NOTI-008 계약 위반(%s)이면 응답 전체가 InvalidResponseError다', async (_name, change) => {
    const h = createNotificationHarness();
    h.router.set(PAGE1, () => pageWith(change));
    await expect(h.repository.fetchPage(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NOTI-008 깨진 JSON·빈 본문은 InvalidResponseError다', async () => {
    const h = createNotificationHarness();
    h.router.set(PAGE1, () => new Response('{"notifications": [', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(h.repository.fetchPage(1)).rejects.toBeInstanceOf(InvalidResponseError);
    h.router.set(PAGE1, () => new Response(null, { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(h.repository.fetchPage(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([0, -1, 1.5, Number.NaN])('page=%s는 요청 없이 RangeError다', async (page) => {
    const h = createNotificationHarness();
    await expect(Promise.resolve().then(() => h.repository.fetchPage(page))).rejects.toBeInstanceOf(RangeError);
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-NOTI-006 500은 ApiError(500)로 0.5초·1초 간격 재시도 2회 뒤 던진다(D-21)', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__internal-error' } });
    const result = await settled(h, h.repository.fetchPage(1));
    expect(result.error).toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-NOTI-007 연결 실패는 재시도 뒤 NetworkError다', async () => {
    const h = createNotificationHarness();
    h.router.set(PAGE1, () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await settled(h, h.repository.fetchPage(1));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-NOTI-010 목록 404는 null이 아니라 ApiError(404)로 던진다(알림함 ViewModel이 오류 화면으로 처리)', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__not-found' } });
    await expect(h.repository.fetchPage(1)).rejects.toMatchObject({ status: 404, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-NOTI-009 401 UNAUTHORIZED는 refresh 뒤 원 요청을 1회만 다시 보내 성공한다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: ['notification/notifications__unauthorized', 'notification/notifications__page1'], 'POST /auth/refresh': 'auth/refresh__success' } });
    await expect(h.repository.fetchPage(1)).resolves.toMatchObject({ currentPage: 1 });
    expect(h.router.calls(PAGE1)).toHaveLength(2);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-NOTI-009 refresh가 REAUTHENTICATION_REQUIRED면 세션을 만료시키고 ApiError(401)를 던진다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__unauthorized', 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    await expect(h.repository.fetchPage(1)).rejects.toMatchObject({ status: 401 });
    expect(h.expired.count).toBe(1);
  });

  it('TC-NOTI-022 요청 취소는 통신 오류가 아니라 취소(AbortError)로 전해지고 재시도하지 않는다', async () => {
    const h = createNotificationHarness();
    const controller = new AbortController();
    controller.abort();
    const error = await h.repository.fetchPage(1, controller.signal).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isCancellation(error)).toBe(true);
    expect(error).not.toBeInstanceOf(NetworkError);
    await h.clock.advance(5_000);
    expect(h.ff.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('NotificationRepository.fetchDetail (GET /notifications/{id})', () => {
  it('TC-NOTI-042 반려 상세를 읽는다: 원본 사진·반려 사유·readAt null', async () => {
    const h = createNotificationHarness();
    const detail = await h.repository.fetchDetail(noti(2));
    expect(h.router.calls(detailKey(2))[0]!.path).toBe(`/notifications/${noti(2)}`);
    expect(h.router.calls(detailKey(2))[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(detail).toEqual({
      id: noti(2),
      type: 'POST_REJECTED',
      title: '사진이 반려되었어요',
      body: '자세한 사유를 확인해 주세요.',
      originalImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/original.webp',
      rejectionReason: '다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.',
      readAt: null,
      createdAt: instant('2026-10-27T01:00:00Z'),
    });
  });

  it('TC-NOTI-044 공지 상세는 originalImageUrl·rejectionReason이 null이다(키가 없어도 같다)', async () => {
    const h = createNotificationHarness();
    await expect(h.repository.fetchDetail(noti(5))).resolves.toMatchObject({ type: 'NOTICE', originalImageUrl: null, rejectionReason: null });
    h.router.set(detailKey(5), () => {
      const body = structuredClone(loadFixture('notification/notification-detail__notice.json').json) as Record<string, unknown>;
      delete body['originalImageUrl'];
      delete body['rejectionReason'];
      delete body['readAt'];
      return json(200, body);
    });
    await expect(h.repository.fetchDetail(noti(5))).resolves.toMatchObject({ originalImageUrl: null, rejectionReason: null, readAt: null });
  });

  it('TC-NOTI-044 공지 본문의 줄바꿈과 전문을 그대로 보존한다', async () => {
    const h = createNotificationHarness();
    const detail = await h.repository.fetchDetail(noti(5));
    expect(detail!.body.split('\n')).toHaveLength(3);
  });

  it('TC-NOTI-043 반려 사유 500자 전문을 자르지 않는다', async () => {
    const h = createNotificationHarness();
    const detail = await h.repository.fetchDetail(noti(7));
    expect(detail!.rejectionReason).toHaveLength(500);
  });

  it('TC-NOTI-047 승인 알림 상세도 읽는다(사진이 있으면 값, 없으면 null)', async () => {
    const h = createNotificationHarness();
    await expect(h.repository.fetchDetail(noti(1))).resolves.toMatchObject({ type: 'POST_APPROVED', originalImageUrl: expect.stringContaining('original.webp') });
  });

  it('요청 경로의 id는 대문자여도 소문자로 보낸다', async () => {
    const h = createNotificationHarness();
    await h.repository.fetchDetail(noti(2).toUpperCase());
    expect(h.ff.calls[0]!.path).toBe(`/notifications/${noti(2)}`);
  });

  it('TC-NOTI-045 404 BUSINESS_ERROR는 오류가 아니라 null이고 재시도하지 않는다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey('33333333-3333-4333-8333-333333333399')]: 'notification/notification-detail__not-found' } });
    await expect(h.repository.fetchDetail('33333333-3333-4333-8333-333333333399')).resolves.toBeNull();
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-NOTI-045 본문 없는(게이트웨이) 404는 null이 아니라 오류다', async () => {
    const h = createNotificationHarness();
    h.router.set(detailKey(2), () => new Response('<html>Not Found</html>', { status: 404, headers: { 'content-type': 'text/html' } }));
    await expect(h.repository.fetchDetail(noti(2))).rejects.toMatchObject({ status: 404, errorCode: null });
  });

  it('TC-NOTI-046 500은 ApiError(500)로 재시도 뒤 던지고, 연결 실패는 NetworkError다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(2)]: 'notification/notification-detail__internal-error' } });
    const failed = await settled(h, h.repository.fetchDetail(noti(2)));
    expect(failed.error).toMatchObject({ status: 500 });
    expect(h.router.calls(detailKey(2))).toHaveLength(3);
    h.router.set(detailKey(2), () => {
      throw new TypeError('Failed to fetch');
    });
    const offline = await settled(h, h.repository.fetchDetail(noti(2)));
    expect(offline.error).toBeInstanceOf(NetworkError);
  });

  it('TC-NOTI-046 필수 필드(title) 누락은 InvalidResponseError다', async () => {
    const h = createNotificationHarness();
    h.router.set(detailKey(2), () => {
      const body = structuredClone(loadFixture('notification/notification-detail__rejected.json').json) as Record<string, unknown>;
      delete body['title'];
      return json(200, body);
    });
    await expect(h.repository.fetchDetail(noti(2))).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NOTI-041 상세 조회는 PATCH read를 보내지 않는다', async () => {
    const h = createNotificationHarness();
    await h.repository.fetchDetail(noti(2));
    await h.repository.fetchPage(1);
    expect(h.ff.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
});

describe('NotificationRepository.markRead (PATCH /notifications/{id}/read)', () => {
  it('TC-NOTI-027 PATCH를 본문·Content-Type 없이 보내고 204를 성공(undefined)으로 읽는다', async () => {
    const h = createNotificationHarness();
    await expect(h.repository.markRead(noti(1))).resolves.toBeUndefined();
    const [call] = h.router.calls(readKey(1));
    expect(call!.method).toBe('PATCH');
    expect(call!.path).toBe(`/notifications/${noti(1)}/read`);
    expect(call!.body).toBeNull();
    expect(call!.headers['content-type']).toBeUndefined();
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('요청 경로의 id는 대문자여도 소문자로 보낸다', async () => {
    const h = createNotificationHarness();
    await h.repository.markRead(noti(1).toUpperCase());
    expect(h.ff.calls[0]!.path).toBe(`/notifications/${noti(1)}/read`);
  });

  it('TC-NOTI-033 404 BUSINESS_ERROR는 ApiError(404)로 던진다(재시도 없음)', async () => {
    const id = '33333333-3333-4333-8333-333333333399';
    const h = createNotificationHarness({ routes: { [readKey(id)]: 'notification/notification-read__not-found' } });
    await expect(h.repository.markRead(id)).rejects.toMatchObject({ status: 404, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-NOTI-034 500은 멱등 PATCH라 0.5초·1초 간격 재시도 2회 뒤 ApiError(500)다', async () => {
    const h = createNotificationHarness({ routes: { [readKey(1)]: 'notification/notification-read__internal-error' } });
    const result = await settled(h, h.repository.markRead(noti(1)));
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-NOTI-032 연결 실패는 재시도 뒤 NetworkError다', async () => {
    const h = createNotificationHarness();
    h.router.set(readKey(1), () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await settled(h, h.repository.markRead(noti(1)));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-NOTI-035 401 UNAUTHORIZED는 refresh 뒤 1회 다시 보내 성공한다', async () => {
    const h = createNotificationHarness({ routes: { [readKey(1)]: ['notification/notification-read__unauthorized', 'notification/notification-read__no-content'], 'POST /auth/refresh': 'auth/refresh__success' } });
    await expect(h.repository.markRead(noti(1))).resolves.toBeUndefined();
    expect(h.router.calls(readKey(1))).toHaveLength(2);
  });

  it('TC-NOTI-035 refresh가 REAUTHENTICATION_REQUIRED면 세션을 만료시키고 ApiError(401)를 던진다', async () => {
    const h = createNotificationHarness({ routes: { [readKey(1)]: 'notification/notification-read__unauthorized', 'POST /auth/refresh': respond('auth/refresh__reauthentication-required') } });
    await expect(h.repository.markRead(noti(1))).rejects.toMatchObject({ status: 401 });
    expect(h.expired.count).toBe(1);
  });

  it('TC-NOTI-039 요청 취소는 AbortError로 전해진다', async () => {
    const h = createNotificationHarness();
    const controller = new AbortController();
    controller.abort();
    const error = await h.repository.markRead(noti(1), controller.signal).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isCancellation(error)).toBe(true);
  });
});
