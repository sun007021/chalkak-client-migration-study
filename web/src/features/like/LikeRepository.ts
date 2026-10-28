import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { InvalidResponseError } from '../../core/net/errors';
import { path } from '../../core/net/url';
export interface LikeResult { postId: string; likeCount: number; isLiked: boolean }
const decode = d.object({ postId: d.string(), likeCount: d.number(), isLiked: d.boolean() });
export class LikeRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}
  async like(id: string, signal?: AbortSignal): Promise<LikeResult> {
    const r = await this.deps.api.request({ method: 'PUT', path: path`/posts/${id}/likes`, signal }, decode);
    if (r.postId.toLowerCase() !== id.toLowerCase() || !r.isLiked) throw new InvalidResponseError('like mismatch');
    return r;
  }
  async unlike(id: string, signal?: AbortSignal): Promise<LikeResult> {
    const r = await this.deps.api.request({ method: 'DELETE', path: path`/posts/${id}/likes`, signal }, decode);
    if (r.postId.toLowerCase() !== id.toLowerCase() || r.isLiked) throw new InvalidResponseError('unlike mismatch');
    return r;
  }
}
