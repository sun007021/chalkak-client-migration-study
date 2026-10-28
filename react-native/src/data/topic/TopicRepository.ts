import type { ApiClient } from '../../core/http/ApiClient';
import { HttpError } from '../../core/http/ApiError';
import type { KstDate } from '../../core/time/KstDate';
import { decodeTopic, type Topic } from './Topic';

export type TopicRepositoryDeps = { api: ApiClient };

export class TopicRepository {
  constructor(private readonly deps: TopicRepositoryDeps) {}

  /**
   * GET /topics?date=yyyy-MM-dd (비로그인 허용, 토큰이 있으면 붙인다).
   * 404이고 errorCode가 BUSINESS_ERROR(주제 없음, api-contract 5.2)일 때만 null. 알 수 없는 errorCode도 BUSINESS_ERROR로
   * 정규화되므로(parseErrorBody) 오류 본문이 있는 404는 모두 해당한다. 본문이 없는 404(게이트웨이 등)는 오류로 던진다. 응답의 topicDate가 요청 날짜와 다르면 InvalidResponseError.
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
      if (
        error instanceof HttpError &&
        error.status === 404 &&
        error.errorCode === 'BUSINESS_ERROR'
      ) {
        return null;
      }
      throw error;
    }
  }
}
