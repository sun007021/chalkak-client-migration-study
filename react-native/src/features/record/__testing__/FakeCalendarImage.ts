import type {
  CalendarImageInput,
  CalendarImageRenderer,
  CalendarImageSaver,
  RenderedImage,
} from '../CalendarImage';

/** 8바이트 PNG 시그니처(89 50 4E 47 0D 0A 1A 0A) 뒤에 임의 바이트. */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
export const fakePng = (): RenderedImage => ({
  bytes: new Uint8Array([...PNG_SIGNATURE, 1, 2, 3]),
  width: 720,
  height: 960,
});

export class FakeCalendarImageRenderer implements CalendarImageRenderer {
  readonly inputs: CalendarImageInput[] = [];
  result: () => Promise<RenderedImage> = () => Promise.resolve(fakePng());

  render(input: CalendarImageInput): Promise<RenderedImage> {
    this.inputs.push(input);
    return this.result();
  }
}

export class FakeCalendarImageSaver implements CalendarImageSaver {
  readonly saved: { fileName: string; bytes: Uint8Array }[] = [];
  behavior: () => Promise<void> = () => Promise.resolve();

  save(image: { fileName: string; bytes: Uint8Array }): Promise<void> {
    this.saved.push(image);
    return this.behavior();
  }
}
