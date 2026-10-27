import { SIGNATURE_MAX_BYTES } from '../../shared/constants';
import { t } from '../../shared/copy';
import { deferred } from '../../core/http/__testing__/FakeTransport';
import { SignatureDrawViewModel } from './SignatureDrawViewModel';
import { SignatureEncoder } from './SignatureEncoder';
import { CANVAS, drawDot, drawLine, flush } from './__testing__/draw';
import { FakeSignatureRasterizer } from './__testing__/FakeSignatureRasterizer';
import type { SignatureRasterizer } from './SignatureRasterizer';

function setup(rasterizer: SignatureRasterizer = new FakeSignatureRasterizer()) {
  const confirmed: Uint8Array[] = [];
  const vm = new SignatureDrawViewModel({
    canvas: CANVAS,
    encoder: new SignatureEncoder(rasterizer),
    onConfirmed: (png) => confirmed.push(png),
  });
  return { vm, confirmed };
}

describe('SignatureDrawViewModel', () => {
  it('TC-SIGN-001 획이 없으면 제출·되돌리기·전체 지우기가 모두 비활성이다', () => {
    const { vm } = setup();
    expect(vm.getSnapshot()).toMatchObject({
      hasSignature: false,
      canUndo: false,
      canClear: false,
      canSubmit: false,
      strokes: [],
      error: null,
    });
  });

  it('TC-SIGN-002 점 하나만 찍어도 세 버튼이 활성이다', () => {
    const { vm } = setup();
    drawDot(vm);
    expect(vm.getSnapshot()).toMatchObject({
      hasSignature: true,
      canUndo: true,
      canClear: true,
      canSubmit: true,
    });
  });

  it('TC-SIGN-004 그리는 도중에도 획이 상태에 반영된다(화면이 실시간으로 그릴 수 있다)', () => {
    const { vm } = setup();
    vm.beginStroke({ x: 10, y: 10 });
    vm.appendPoint({ x: 20, y: 20 });
    expect(vm.getSnapshot().strokes).toEqual([
      [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    ]);
    vm.endStroke();
    expect(vm.getSnapshot().strokes).toHaveLength(1);
  });

  it('TC-SIGN-005 캔버스 밖 좌표는 영역 안으로 보정된다', () => {
    const { vm } = setup();
    vm.beginStroke({ x: -50, y: 9999 });
    vm.endStroke();
    expect(vm.getSnapshot().strokes[0][0]).toEqual({ x: 0, y: CANVAS.height });
  });

  it('TC-SIGN-006 되돌리기 3회로 마지막 획부터 사라지고 0개가 되면 제출·되돌리기가 비활성이다', () => {
    const { vm } = setup();
    drawDot(vm, 10, 10);
    drawDot(vm, 20, 20);
    drawDot(vm, 30, 30);
    vm.undo();
    expect(vm.getSnapshot().strokes).toHaveLength(2);
    expect(vm.getSnapshot().strokes[1][0]).toEqual({ x: 20, y: 20 });
    vm.undo();
    vm.undo();
    expect(vm.getSnapshot()).toMatchObject({ canUndo: false, canSubmit: false, canClear: false });
  });

  it('TC-SIGN-007 전체 지우기 후 제출이 비활성이고 이어서 새로 그릴 수 있다', () => {
    const { vm } = setup();
    drawLine(vm);
    drawDot(vm);
    vm.clear();
    expect(vm.getSnapshot()).toMatchObject({ strokes: [], canSubmit: false });
    drawDot(vm);
    expect(vm.getSnapshot().canSubmit).toBe(true);
  });

  it('REQ-SIGN-003 획이 없을 때 confirm은 인코딩도 onConfirmed도 하지 않는다', async () => {
    const rasterizer = new FakeSignatureRasterizer();
    const { vm, confirmed } = setup(rasterizer);
    await vm.confirm();
    expect(rasterizer.requests).toHaveLength(0);
    expect(confirmed).toHaveLength(0);
  });

  it('REQ-SIGN-008 confirm이 PNG를 만들어 onConfirmed에 한 번 넘긴다', async () => {
    const rasterizer = new FakeSignatureRasterizer().setSize(500);
    const { vm, confirmed } = setup(rasterizer);
    drawLine(vm);
    await vm.confirm();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].byteLength).toBe(500);
    expect(vm.getSnapshot().encoding).toBe(false);
  });

  it('TC-SIGN-008 인코딩 중 "이 사인으로 할래요"를 연타해도 onConfirmed는 한 번이다', async () => {
    const gate = deferred<Uint8Array>();
    const slow: SignatureRasterizer = { rasterize: () => gate.promise };
    const { vm, confirmed } = setup(slow);
    drawLine(vm);
    const calls = [vm.confirm(), vm.confirm(), vm.confirm()];
    expect(vm.getSnapshot()).toMatchObject({ encoding: true, canSubmit: false });
    gate.resolve(new Uint8Array(10));
    await Promise.all(calls);
    expect(confirmed).toHaveLength(1);
  });

  it('TC-SIGN-015 1 MiB 초과면 onConfirmed 없이 sign.error.too-large를 보이고 획은 유지한다', async () => {
    const { vm, confirmed } = setup(new FakeSignatureRasterizer().setSize(SIGNATURE_MAX_BYTES + 1));
    drawLine(vm);
    await vm.confirm();
    expect(confirmed).toHaveLength(0);
    expect(vm.getSnapshot().error).toBe(t('sign.error.too-large'));
    expect(vm.getSnapshot().strokes).toHaveLength(1);
    expect(vm.getSnapshot()).toMatchObject({ encoding: false, canSubmit: true });
  });

  it('REQ-SIGN-008 새로 그리기 시작하거나 지우면 이전 오류가 사라진다', async () => {
    const { vm } = setup(new FakeSignatureRasterizer().setSize(SIGNATURE_MAX_BYTES + 1));
    drawLine(vm);
    await vm.confirm();
    vm.beginStroke({ x: 1, y: 1 });
    expect(vm.getSnapshot().error).toBeNull();
    vm.endStroke();
    await vm.confirm();
    expect(vm.getSnapshot().error).not.toBeNull();
    vm.clear();
    expect(vm.getSnapshot().error).toBeNull();
  });

  it('REQ-SIGN-028 래스터라이저가 실패하면 일반 오류 문구로 알리고 획은 유지한다', async () => {
    const { vm, confirmed } = setup(new FakeSignatureRasterizer().failWith(new Error('skia boom')));
    drawLine(vm);
    await vm.confirm();
    await flush();
    expect(confirmed).toHaveLength(0);
    expect(vm.getSnapshot().error).not.toBeNull();
    expect(vm.getSnapshot().strokes).toHaveLength(1);
  });

  it('REQ-SIGN-011 showError는 획을 유지한 채 문구만 올리고 dismissError로 닫는다', () => {
    const { vm } = setup();
    drawLine(vm);
    vm.showError(t('sign.error.invalid'));
    expect(vm.getSnapshot()).toMatchObject({ error: t('sign.error.invalid'), canSubmit: true });
    vm.dismissError();
    expect(vm.getSnapshot().error).toBeNull();
  });
});

describe('SignatureDrawViewModel: 진행 표시를 위한 양보', () => {
  it('confirm은 encoding 상태를 먼저 알리고 한 번 양보한 뒤에 래스터라이즈를 시작한다', async () => {
    const rasterizer = new FakeSignatureRasterizer();
    const { vm, confirmed } = setup(rasterizer);
    drawLine(vm);
    const pending = vm.confirm();
    expect(vm.getSnapshot().encoding).toBe(true);
    expect(rasterizer.requests).toHaveLength(0); // 아직 JS 스레드를 잡지 않았다
    await pending;
    expect(rasterizer.requests).toHaveLength(1);
    expect(confirmed).toHaveLength(1);
  });
});
