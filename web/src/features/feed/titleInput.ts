import { POST_TITLE_MAX } from '../../constants';
export function countCodePoints(text: string): number { return [...text].length; }
export function clampTitleInput(text: string): string {
  if (countCodePoints(text.trim()) <= POST_TITLE_MAX) return text;
  const lead = text.length - text.trimStart().length;
  const body = [...text.trim()].slice(0, POST_TITLE_MAX).join('');
  return text.slice(0, lead) + body;
}
export function titlePayload(text: string): string | null { const s = text.trim(); return s === '' ? null : s; }
