export type Point = { readonly x: number; readonly y: number };
/** 한 번의 터치 입력(손가락을 대고 뗄 때까지). 점이 하나뿐이어도 획이다. */
export type Stroke = readonly Point[];
export type Size = { readonly width: number; readonly height: number };
