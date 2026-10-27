import { MainShellViewModel } from './MainShellViewModel';
import { GuestGate } from './GuestGate';
import type { SessionMode } from '../boot/authGate';
import type { TabDestination } from '../../constants';
import { AnalyticsReporter } from '../../core/analytics/AnalyticsReporter';
import { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import { FakeAnalyticsTracker } from '../../test/FakeAnalyticsTracker';
import { FakeClock } from '../../test/FakeClock';
import { FakeUploadEntry } from '../../test/FakeUploadEntry';
import { SequentialIdGenerator } from '../../test/sequentialIds';

function setup(mode: SessionMode) {
  const clock = new FakeClock();
  const toast = new ToastController({ clock, ids: new SequentialIdGenerator() });
  const tracker = new FakeAnalyticsTracker();
  const upload = new FakeUploadEntry();
  const vm = new MainShellViewModel({ mode, guestGate: new GuestGate({ toast }), analytics: new AnalyticsReporter({ tracker }), uploadEntry: upload });
  const selections = () => tracker.events.filter((e) => e.name === 'bottom_navigation_selected');
  return { vm, toast, tracker, upload, selections };
}

describe('MainShellViewModel: 탭 선택', () => {
  it('TC-NAV-003 REQ-NAV-003 상태는 모드뿐이다. 선택된 탭은 URL에서만 파생되어 VM이 들고 있지 않다', () => {
    expect(setup('member').vm.state).toEqual({ mode: 'member' });
    expect(setup('guest').vm.state).toEqual({ mode: 'guest' });
  });

  it('TC-NAV-004 홈에서 전시, 기록, 설정을 차례로 선택하면 이동 계획만 돌려준다(상태를 바꾸지 않는다)', () => {
    const { vm } = setup('member');
    const before = vm.state;
    expect(vm.selectTab('home', 'display', null)).toEqual({ kind: 'push', to: '/display', state: { homeBelow: true } });
    expect(vm.selectTab('display', 'record', { homeBelow: true })).toEqual({ kind: 'replace', to: '/record', state: { homeBelow: true } });
    expect(vm.selectTab('record', 'settings', { homeBelow: true })).toEqual({ kind: 'replace', to: '/settings', state: { homeBelow: true } });
    expect(vm.selectTab('settings', 'home', { homeBelow: true })).toEqual({ kind: 'back' });
    expect(vm.state).toBe(before);
  });

  it('TC-ANL-013 탭을 선택할 때마다 bottom_navigation_selected {destination}을 한 번씩 보낸다', () => {
    const { vm, selections } = setup('member');
    vm.selectTab('home', 'display', null);
    vm.selectTab('display', 'record', { homeBelow: true });
    vm.selectTab('record', 'settings', { homeBelow: true });
    vm.selectTab('settings', 'home', { homeBelow: true });
    expect(selections()).toEqual(['display', 'record', 'settings', 'home'].map((destination) => ({ name: 'bottom_navigation_selected', params: { destination } })));
  });

  it('TC-ANL-014 REQ-NAV-009 이미 선택된 탭을 다시 선택해도 선택마다 전송한다(W1 임시안과 같다). 이동 계획은 없다', () => {
    const { vm, selections } = setup('member');
    expect(vm.selectTab('home', 'home', null)).toEqual({ kind: 'none' });
    vm.selectTab('home', 'display', null);
    expect(vm.selectTab('display', 'display', { homeBelow: true })).toEqual({ kind: 'none' });
    expect(selections().map((e) => e.params)).toEqual([{ destination: 'home' }, { destination: 'display' }, { destination: 'display' }]);
  });

  it('TC-NAV-008 TC-NAV-009 같은 탭을 다시 선택하면 reselect 리스너가 그 탭 이름으로 불린다(맨 위 스크롤은 각 탭 화면 PR)', () => {
    const { vm } = setup('member');
    const seen: TabDestination[] = [];
    const off = vm.subscribeReselect((tab) => seen.push(tab));
    vm.selectTab('home', 'home', null); // 홈 재선택
    vm.selectTab('home', 'display', null); // 전환은 재선택이 아니다
    vm.selectTab('display', 'display', { homeBelow: true }); // 전시 재선택
    expect(seen).toEqual(['home', 'display']);
    off();
    vm.selectTab('display', 'display', { homeBelow: true });
    expect(seen).toHaveLength(2);
  });

  it('REQ-NAV-008 TC-NAV-008 서로 다른 탭으로의 전환은 reselect가 아니다', () => {
    const { vm } = setup('member');
    const seen: TabDestination[] = [];
    vm.subscribeReselect((tab) => seen.push(tab));
    vm.selectTab('home', 'display', null);
    vm.selectTab('display', 'settings', { homeBelow: true });
    expect(seen).toEqual([]);
  });
});

describe('MainShellViewModel: 게스트', () => {
  it('TC-NAV-016 게스트가 기록 탭을 누르면 이동 없음, 선택 불변, 토스트 nav.guest.record', () => {
    const { vm, toast } = setup('guest');
    expect(vm.selectTab('home', 'record', null)).toEqual({ kind: 'none' });
    expect(toast.state.toast?.message).toBe(t('nav.guest.record'));
  });

  it('TC-ANL-016 게스트 제한으로 막힌 기록 탭은 bottom_navigation_selected를 보내지 않는다(이동하지 않았으므로, 임시안)', () => {
    const { vm, tracker } = setup('guest');
    vm.selectTab('home', 'record', null);
    expect(tracker.events).toEqual([]);
  });

  it('REQ-NAV-012 게스트도 홈·전시·설정 탭은 열 수 있고 토스트가 없다', () => {
    const { vm, toast, selections } = setup('guest');
    expect(vm.selectTab('home', 'display', null)).toMatchObject({ kind: 'push', to: '/display' });
    expect(vm.selectTab('display', 'settings', { homeBelow: true })).toMatchObject({ kind: 'replace', to: '/settings' });
    expect(vm.selectTab('settings', 'home', { homeBelow: true })).toEqual({ kind: 'back' });
    expect(toast.state.toast).toBeNull();
    expect(selections()).toHaveLength(3);
  });

  it('TC-NAV-016 게스트가 전시에 있다가 기록 탭을 눌러도 전시에 머문다', () => {
    const { vm } = setup('guest');
    vm.selectTab('home', 'display', null);
    expect(vm.selectTab('display', 'record', { homeBelow: true })).toEqual({ kind: 'none' });
  });

  it('TC-NAV-024 회원은 기록 탭이 열리고 토스트가 없다(정지 회원도 같다)', () => {
    const { vm, toast } = setup('member');
    expect(vm.selectTab('home', 'record', null)).toMatchObject({ kind: 'push', to: '/record' });
    expect(toast.state.toast).toBeNull();
  });
});

describe('MainShellViewModel: 업로드 버튼', () => {
  it('TC-NAV-005 REQ-NAV-002 회원이 누르면 업로드 진입을 시작하고 선택 탭은 바뀌지 않는다', () => {
    const { vm, upload } = setup('member');
    vm.pressUpload();
    expect(upload.starts).toBe(1);
  });

  it('TC-NAV-017 게스트가 누르면 진입 시작 없이 토스트 nav.guest.upload만 보인다', () => {
    const { vm, upload, toast } = setup('guest');
    vm.pressUpload();
    expect(upload.starts).toBe(0);
    expect(toast.state.toast?.message).toBe(t('nav.guest.upload'));
  });

  it('TC-ANL-015 REQ-NAV-009 업로드 버튼은 회원이든 게스트든 bottom_navigation_selected를 보내지 않는다', () => {
    const member = setup('member');
    member.vm.pressUpload();
    const guest = setup('guest');
    guest.vm.pressUpload();
    expect(member.tracker.events).toEqual([]);
    expect(guest.tracker.events).toEqual([]);
  });

  it('TC-NAV-005 누를 때마다 진입 시작을 부른다(중복 요청 방지는 업로드 진입 쪽 책임, REQ-NAV-035)', () => {
    const { vm, upload } = setup('member');
    vm.pressUpload();
    vm.pressUpload();
    expect(upload.starts).toBe(2);
  });
});
