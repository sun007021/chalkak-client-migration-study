// TDD 껍데기: 구현 단계에서 이 줄과 사용하지 않는 필드 경고를 지운다.
// ignore_for_file: unused_field

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/time/kst_date.dart';
import '../domain/record_models.dart';
import '../domain/record_repository.dart';

/// [RecordRepository]의 `ApiClient` 구현. 응답 검증은 [RecordRepository.calendar] 문서를 따른다.
class ApiRecordRepository implements RecordRepository {
  ApiRecordRepository({required this._client});

  final ApiClient _client;

  @override
  Future<List<KstMonth>> months({CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<List<RecordPhoto>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
