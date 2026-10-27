import type { ApiClient } from '../../core/http/ApiClient';
import { HttpError } from '../../core/http/ApiError';
import type { KstDate } from '../../core/time/KstDate';
import { decodeTopic, type Topic } from './Topic';

export type TopicRepositoryDeps = { api: ApiClient };

export class TopicRepository {
  constructor(private readonly deps: TopicRepositoryDeps) {}

  /**
   * GET /topics?date=yyyy-MM-dd (비로그인 허용, 토큰이 있으면 붙인다).
   * 404 BUSINESS_ERROR(주제 없음)이면 null. 응답의 topicDate가 요청 날짜와 다르면 InvalidResponseError.
   * 그 밖의 실패(400 미래 날짜, 5xx, 네트워크 ...)는 ApiError를 그대로 던진다.
   */
  async findByDate(date: KstDate, signal?: AbortSignal): Promise<Topic | null> {
    try {
      return await this.deps.api.requestJson(
        { method: 'GET', path: '/topics', query: { date: date.toString() }, signal },
        (raw) => {
          const topic = decodeTopic(raw);
          if (!topic.topicDate.equals(date)) throw new Error('topicDate mismatch');
          return topic;
        },
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }
}
