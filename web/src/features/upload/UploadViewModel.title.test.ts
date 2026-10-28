import { createBody, createUploadHarness, openUpload, prepareReady, settleMore } from '../../test/uploadHarness';
import type { UploadHarness } from '../../test/uploadHarness';

const FAMILY = '👨‍👩‍👧'; // 5 code points (사람, ZWJ, 사람, ZWJ, 아이)

async function submitWithTitle(h: UploadHarness, title: string) {
  await prepareReady(h);
  h.vm.setTitle(title);
  const outcome = h.vm.submit();
  await settleMore();
  await expect(outcome).resolves.toEqual({ kind: 'success' });
}

describe('UploadViewModel 제목 입력 (REQ-UPL-022~024)', () => {
  it('TC-UPL-080 한글 10자는 허용하고 11번째 글자는 들어가지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle('가나다라마바사아자차');
    expect(h.vm.state.title).toBe('가나다라마바사아자차');
    expect(h.vm.state.titleCount).toBe(10);
    h.vm.setTitle('가나다라마바사아자차카');
    expect(h.vm.state.title).toBe('가나다라마바사아자차');
    expect(h.vm.state.titleCount).toBe(10);
  });

  it('TC-UPL-080 이모지 10개(UTF-16 길이 20)는 허용하고 11번째는 들어가지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle('😀'.repeat(10));
    expect(h.vm.state.title).toBe('😀'.repeat(10));
    expect(h.vm.state.titleCount).toBe(10);
    h.vm.setTitle('😀'.repeat(11));
    expect(h.vm.state.title).toBe('😀'.repeat(10));
  });

  it('TC-UPL-081 결합 이모지는 grapheme이 아니라 code point로 센다(가족 이모지 2개가 정확히 10)', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle(FAMILY + FAMILY);
    expect(h.vm.state.titleCount).toBe(10);
    expect(h.vm.state.title).toBe(FAMILY + FAMILY);
    h.vm.setTitle(FAMILY + FAMILY + '가');
    expect(h.vm.state.title).toBe(FAMILY + FAMILY);
    expect(h.vm.state.titleCount).toBe(10);
  });

  it('TC-UPL-081 가족 이모지 1개 뒤에 한글 6자를 넣으면 11번째 code point부터 막힌다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle(FAMILY + '가나다라마바');
    expect(h.vm.state.titleCount).toBe(10);
    expect(h.vm.state.title).toBe(FAMILY + '가나다라마');
  });

  it('TC-UPL-081 붙여넣기 16자는 10 code point까지만 들어간다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle('하나둘셋넷다섯여섯일곱여덟아홉열');
    expect(h.vm.state.title).toBe('하나둘셋넷다섯여섯일');
    expect(h.vm.state.titleCount).toBe(10);
  });

  it('TC-UPL-082 앞뒤 공백은 글자 수에 넣지 않아 " 가나다라마바사아자차 "는 10자로 허용된다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle(' 가나다라마바사아자차 ');
    expect(h.vm.state.title).toBe(' 가나다라마바사아자차 ');
    expect(h.vm.state.titleCount).toBe(10);
  });

  it('TC-UPL-082 제출하면 title은 공백을 제거한 값으로 전송된다', async () => {
    const h = createUploadHarness();
    await submitWithTitle(h, ' 가나다라마바사아자차 ');
    expect(createBody(h).title).toBe('가나다라마바사아자차');
  });

  it('TC-UPL-082 공백만 입력하면 제목 없음(null)으로 전송된다', async () => {
    const h = createUploadHarness();
    await submitWithTitle(h, '   ');
    expect(createBody(h)).toHaveProperty('title', null);
  });

  it('TC-UPL-082 입력하지 않으면 title은 null이다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const outcome = h.vm.submit();
    await settleMore();
    await outcome;
    expect(createBody(h)).toHaveProperty('title', null);
  });

  it('TC-UPL-082 글자 수는 앞뒤 공백을 뺀 수다(공백만이면 0)', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.vm.setTitle('   ');
    expect(h.vm.state.titleCount).toBe(0);
    h.vm.setTitle('하늘');
    expect(h.vm.state.titleCount).toBe(2);
    h.vm.setTitle('');
    expect(h.vm.state.title).toBe('');
    expect(h.vm.state.titleCount).toBe(0);
  });

  it('제목은 사진을 고르기 전에도, 주제를 받기 전에도 입력할 수 있고 사진을 바꿔도 유지된다', async () => {
    const h = createUploadHarness();
    h.vm.setTitle('먼저');
    expect(h.vm.state.title).toBe('먼저');
    await prepareReady(h);
    expect(h.vm.state.title).toBe('먼저');
  });
});
