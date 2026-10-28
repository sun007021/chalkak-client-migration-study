/** 그리기 → 미리보기 → 확정 사이에 PNG를 메모리에만 둔다. 가입이 끝나거나 다시 그리면 비운다. 디스크 저장 금지. */
export class SignatureDraft {
  private png: Blob | null = null;
  set(png: Blob): void {
    this.png = png;
  }
  get(): Blob | null {
    return this.png;
  }
  clear(): void {
    this.png = null;
  }
}
