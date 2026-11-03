import { vi } from 'vitest';
import { FakeBlobUrls } from '../../test/FakeBlobUrls';
import { pngOf } from '../../test/pngBytes';
import { AnchorFileDownloader, SaveDeniedError } from './FileDownloader';

interface Click {
  download: string;
  href: string;
  connected: boolean;
}

function setup() {
  const urls = new FakeBlobUrls();
  const clicks: Click[] = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.getAttribute('download') ?? '', href: this.getAttribute('href') ?? '', connected: this.isConnected });
  });
  const downloader = new AnchorFileDownloader({ blobUrls: urls });
  return { urls, clicks, spy, downloader };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnchorFileDownloader (`<a download>`, REQ-REC-038)', () => {
  it('TC-REC-038 blob URL을 href로, 파일 이름을 download 속성으로 둔 앵커를 클릭한다', async () => {
    const { downloader, clicks, urls } = setup();
    const blob = pngOf();
    await downloader.download({ name: 'chalkak-calendar-2026-10.png', blob });
    expect(clicks).toEqual([{ download: 'chalkak-calendar-2026-10.png', href: 'blob:fake-1', connected: true }]);
    expect(urls.created).toEqual([blob]);
  });

  it('TC-REC-038 클릭 뒤 임시 앵커를 DOM에서 빼고 blob URL을 해제한다', async () => {
    const { downloader, urls } = setup();
    await downloader.download({ name: 'chalkak-calendar-2026-10.png', blob: pngOf() });
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(urls.revoked).toEqual(['blob:fake-1']);
  });

  it('TC-REC-040 호출마다 새 URL을 만들고 서로 해제한다', async () => {
    const { downloader, urls, clicks } = setup();
    await downloader.download({ name: 'a.png', blob: pngOf() });
    await downloader.download({ name: 'b.png', blob: pngOf() });
    expect(clicks.map((c) => c.download)).toEqual(['a.png', 'b.png']);
    expect(urls.revoked).toEqual(['blob:fake-1', 'blob:fake-2']);
  });

  it('TC-REC-039 클릭이 예외를 던지면 거절하고 앵커·URL을 정리한다', async () => {
    const { downloader, urls, spy } = setup();
    spy.mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(downloader.download({ name: 'a.png', blob: pngOf() })).rejects.toThrow('blocked');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(urls.revoked).toEqual(['blob:fake-1']);
  });

  it('TC-REC-039 SaveDeniedError는 Error이고 이름으로 구분된다', () => {
    const error = new SaveDeniedError('denied');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SaveDeniedError');
  });
});
