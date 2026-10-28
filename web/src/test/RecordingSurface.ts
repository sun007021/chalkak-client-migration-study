import type { DrawSurface } from '../features/signature/SignatureRasterizer';
import { fakePng } from './FakeSignatureRasterizer';

export type SurfaceCall = { name: string; args: number[] };

/** 그리기 호출과 스타일 설정을 순서대로 기록하는 DrawSurface Fake. 화소는 만들지 않는다(픽셀 검사는 브라우저 E2E). */
export class RecordingSurface implements DrawSurface {
  readonly calls: SurfaceCall[] = [];
  readonly styleLog: { prop: string; value: unknown; callIndex: number }[] = [];
  pngBlob = fakePng(128);
  private _strokeStyle = '';
  private _fillStyle = '';
  private _lineWidth = 1;
  private _lineCap: DrawSurface['lineCap'] = 'butt';
  private _lineJoin: DrawSurface['lineJoin'] = 'miter';

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  get strokeStyle(): string {
    return this._strokeStyle;
  }
  set strokeStyle(v: string) {
    this.log('strokeStyle', v);
    this._strokeStyle = v;
  }
  get fillStyle(): string {
    return this._fillStyle;
  }
  set fillStyle(v: string) {
    this.log('fillStyle', v);
    this._fillStyle = v;
  }
  get lineWidth(): number {
    return this._lineWidth;
  }
  set lineWidth(v: number) {
    this.log('lineWidth', v);
    this._lineWidth = v;
  }
  get lineCap(): DrawSurface['lineCap'] {
    return this._lineCap;
  }
  set lineCap(v: DrawSurface['lineCap']) {
    this.log('lineCap', v);
    this._lineCap = v;
  }
  get lineJoin(): DrawSurface['lineJoin'] {
    return this._lineJoin;
  }
  set lineJoin(v: DrawSurface['lineJoin']) {
    this.log('lineJoin', v);
    this._lineJoin = v;
  }

  private log(prop: string, value: unknown): void {
    this.styleLog.push({ prop, value, callIndex: this.calls.length });
  }
  private record(name: string, ...args: number[]): void {
    this.calls.push({ name, args });
  }
  beginPath(): void {
    this.record('beginPath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.record('quadraticCurveTo', cx, cy, x, y);
  }
  arc(x: number, y: number, radius: number, start: number, end: number): void {
    this.record('arc', x, y, radius, start, end);
  }
  fill(): void {
    this.record('fill');
  }
  stroke(): void {
    this.record('stroke');
  }
  toPng(): Promise<Blob> {
    this.record('toPng');
    return Promise.resolve(this.pngBlob);
  }

  names(): string[] {
    return this.calls.map((c) => c.name);
  }
}
