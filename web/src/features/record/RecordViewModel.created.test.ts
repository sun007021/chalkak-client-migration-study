import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { finish, settle } from '../../test/homeHarness';
import { createRecordHarness, datesOf } from '../../test/recordHarness';
import { OCT, OCT_20, OCT_27, SEP, SEP_17, SEP_30, monthResponse } from '../../test/recordRoutes';

const created = (topicDate: string, postId: string) => ({ type: 'created', postId, topicDate, moderationStatus: 'PENDING' }) as const;

describe('RecordViewModel 업로드 반영 중 낡은 응답 (created)', () => {
  it('진행 중이던 재검증의 업로드 이전 응답이 새로 불러온 응답을 덮지 못한다', async () => {
    const gate = deferred<void>();
    const before = monthResponse(2026, 10, [['2026-10-20', OCT_20, 'APPROVED']]);
    const h = createRecordHarness({ routes: { [OCT]: [before, gated(gate, 'record/posts-calendar__2026-10-after-delete'), 'record/posts-calendar__2026-10'] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const stale = vm.onTabReselect(); // 업로드 이전 상태를 돌려줄 낡은 요청
    await settle();
    h.changes.publish(created('2026-10-27', OCT_27));
    await finish(h, Promise.resolve());
    await settle();
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    gate.resolve();
    await finish(h, stale);
    await settle();
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(h.toasts.messages).toEqual([]);
  });

  it('보이지 않는 달의 진행 중 읽기도 취소되어, 늦게 온 낡은 응답이 버린 캐시를 되살리지 못한다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: [gated(gate, 'record/posts-calendar__2026-09'), monthResponse(2026, 9, [['2026-09-17', SEP_17, 'APPROVED']])] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const toSep = vm.selectPreviousMonth(); // 9월 첫 읽기가 붙잡혀 있다
    await settle();
    const toOct = vm.selectNextMonth();
    await finish(h, toOct);
    h.changes.publish(created('2026-09-30', SEP_30));
    gate.resolve();
    await finish(h, toSep);
    await settle();
    // 낡은 9월 응답은 캐시에 없다: 다시 가면 로딩이고, 새로 받은 값이 보인다.
    const again = vm.selectPreviousMonth();
    await settle();
    expect(datesOf(vm)).toEqual(['2026-09-17']);
    await finish(h, again);
    expect(h.router.calls(SEP)).toHaveLength(2);
  });
});
