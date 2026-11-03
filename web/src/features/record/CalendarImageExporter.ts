import type { CalendarImageModel } from './calendarImage';

const NOT_IMPLEMENTED = 'not implemented';

/**
 * 달력을 PNG Blob 한 장으로 그리는 포트. 렌더 방식(Web은 canvas)은 구현 소관이고 결과는 image/png여야 한다.
 * 기본 구현은 canvas이며 실제 그리기는 jsdom이 아니라 Playwright(Chromium)로 확인한다. 테스트는 Fake를 주입한다.
 */
export interface CalendarImageExporter {
  render(model: CalendarImageModel, signal?: AbortSignal): Promise<Blob>;
}

/** 실제 canvas 구현. 썸네일을 불러오지 못한 칸은 날짜만 그린다(그리기 전체를 실패시키지 않는다). */
export class CanvasCalendarImageExporter implements CalendarImageExporter {
  render(_model: CalendarImageModel, _signal?: AbortSignal): Promise<Blob> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
