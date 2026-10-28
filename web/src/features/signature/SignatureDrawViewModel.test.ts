import { SIGNATURE_MAX_BYTES } from '../../constants';
import { t } from '../../copy/ko';
import { FakeSignatureRasterizer } from '../../test/FakeSignatureRasterizer';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { SignatureDraft } from './SignatureDraft';
import { SignatureDrawViewModel } from './SignatureDrawViewModel';
import type { SignatureMode } from './SignatureMode';
import { SignaturePad } from './SignaturePad';

function setup(mode: SignatureMode = 'onboarding') {
  const pad = new SignaturePad({ width: 1024, height: 512 });
  const rasterizer = new FakeSignatureRasterizer();
  const draft = new SignatureDraft();
  const ids = new SequentialIdGenerator();
  const vm = new SignatureDrawViewModel({ mode, pad, rasterizer, draft, nextId: () => ids.next() });
  return { vm, pad, rasterizer, draft };
}
const scribble = (pad: SignaturePad) => pad.addStroke([{ x: 10, y: 10 }, { x: 100, y: 80 }]);

describe('SignatureDrawViewModel', () => {
  it('TC-SIGN-001 획이 없으면 제출은 아무것도 하지 않는다(rasterizer 0회, draft 비어 있음)', async () => {
    const { vm, rasterizer, draft } = setup();
    expect(vm.pad.state.hasSignature).toBe(false);
    expect(await vm.submit()).toEqual({ kind: 'stay' });
    expect(rasterizer.calls).toBe(0);
    expect(draft.get()).toBeNull();
  });

  it('REQ-SIGN-008 획이 있으면 snapshot을 PNG로 만들어 draft에 넣고 미리보기로 간다', async () => {
    const { vm, pad, rasterizer, draft } = setup();
    scribble(pad);
    expect(await vm.submit()).toEqual({ kind: 'preview' });
    expect(rasterizer.calls).toBe(1);
    expect(rasterizer.drawings[0]).toEqual(pad.snapshot());
    expect(draft.get()).toBe(rasterizer.results[0]);
    expect(vm.state).toMatchObject({ busy: false, error: null });
  });

  it('TC-SIGN-008 제출을 연타해도 PNG 생성과 미리보기는 한 번뿐이다', async () => {
    const { vm, pad, rasterizer } = setup();
    scribble(pad);
    rasterizer.hold();
    const first = vm.submit();
    expect(await vm.submit()).toEqual({ kind: 'stay' });
    expect(await vm.submit()).toEqual({ kind: 'stay' });
    expect(vm.state.busy).toBe(true);
    rasterizer.release();
    expect(await first).toEqual({ kind: 'preview' });
    expect(rasterizer.calls).toBe(1);
  });

  it('TC-SIGN-014 인코딩 결과가 정확히 1,048,576B면 허용한다', async () => {
    const { vm, pad, rasterizer, draft } = setup();
    scribble(pad);
    rasterizer.size = SIGNATURE_MAX_BYTES;
    expect(await vm.submit()).toEqual({ kind: 'preview' });
    expect(draft.get()?.size).toBe(1_048_576);
    expect(vm.state.error).toBeNull();
  });

  it('TC-SIGN-015 REQ-SIGN-008 1,048,577B면 미리보기로 가지 않고 "사인 이미지가 1MB를 초과했어요."를 보이며 그린 내용은 유지한다', async () => {
    const { vm, pad, rasterizer, draft } = setup();
    scribble(pad);
    rasterizer.size = SIGNATURE_MAX_BYTES + 1;
    expect(await vm.submit()).toEqual({ kind: 'stay' });
    expect(vm.state.error?.message).toBe(t('sign.error.too-large'));
    expect(vm.state.error?.message).toBe('사인 이미지가 1MB를 초과했어요.');
    expect(draft.get()).toBeNull();
    expect(pad.state.hasSignature).toBe(true);
    expect(vm.state.busy).toBe(false);
  });

  it('TC-SIGN-015 같은 초과를 연달아 겪어도 오류마다 id가 다르다', async () => {
    const { vm, pad, rasterizer } = setup();
    scribble(pad);
    rasterizer.size = SIGNATURE_MAX_BYTES + 1;
    await vm.submit();
    const first = vm.state.error!.id;
    await vm.submit();
    expect(vm.state.error!.id).not.toBe(first);
  });

  it('오류는 다시 그리거나 되돌리거나 지우면 사라지고, dismissError로도 닫는다', async () => {
    const { vm, pad, rasterizer } = setup();
    scribble(pad);
    rasterizer.size = SIGNATURE_MAX_BYTES + 1;
    await vm.submit();
    pad.beginStroke({ x: 5, y: 5 });
    expect(vm.state.error).toBeNull();
    pad.endStroke();
    await vm.submit();
    expect(vm.state.error).not.toBeNull();
    pad.undo();
    expect(vm.state.error).toBeNull();
    scribble(pad);
    await vm.submit();
    vm.dismissError();
    expect(vm.state.error).toBeNull();
  });

  it('rasterizer가 던지면 모드별 일반 실패 문구를 보이고 draft는 비어 있다', async () => {
    const onboarding = setup('onboarding');
    scribble(onboarding.pad);
    onboarding.rasterizer.fail = new Error('canvas failed');
    expect(await onboarding.vm.submit()).toEqual({ kind: 'stay' });
    expect(onboarding.vm.state.error?.message).toBe(t('onb.signup.error.generic'));
    expect(onboarding.draft.get()).toBeNull();

    const change = setup('change');
    scribble(change.pad);
    change.rasterizer.fail = new Error('canvas failed');
    await change.vm.submit();
    expect(change.vm.state.error?.message).toBe(t('sign.change.error.generic'));
  });

  it('dispose 뒤에 끝난 PNG는 draft에 넣지 않는다', async () => {
    const { vm, pad, rasterizer, draft } = setup();
    scribble(pad);
    rasterizer.hold();
    const pending = vm.submit();
    vm.dispose();
    rasterizer.release();
    expect(await pending).toEqual({ kind: 'stay' });
    expect(draft.get()).toBeNull();
  });
});
