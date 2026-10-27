import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../domain/signature_repository.dart';
import 'upload_ticket_json.dart';

class ApiSignatureRepository implements SignatureRepository {
  ApiSignatureRepository({required this._client});

  final ApiClient _client;

  @override
  Future<CurrentSignature> fetchCurrent({CancelToken? cancelToken}) {
    return _client.request<CurrentSignature>(
      const ApiRequest.get('/users/me/signature'),
      decode: (json) {
        final map = json! as Map;
        return CurrentSignature(
          originalUrl: map['signatureOriginalImageUrl']! as String,
          thumbnailUrl: map['signatureThumbnailImageUrl'] as String?,
        );
      },
      cancelToken: cancelToken,
    );
  }

  @override
  Future<SignatureUploadTicket> requestUpload({CancelToken? cancelToken}) {
    return _client.request<SignatureUploadTicket>(
      const ApiRequest(HttpMethod.post, '/users/me/signature/uploads'),
      decode: (json) => parseUploadTicket(json! as Map),
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> confirm(String uploadId, {CancelToken? cancelToken}) {
    // 응답의 이미지 URL은 쓰지 않는다(D-18). 카드가 다시 조회한다.
    return _client.requestNoContent(
      ApiRequest(
        HttpMethod.put,
        '/users/me/signature',
        body: {'signatureOriginalUploadId': uploadId},
      ),
      cancelToken: cancelToken,
    );
  }
}
