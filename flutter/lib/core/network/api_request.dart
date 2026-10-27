enum HttpMethod {
  get('GET'),
  post('POST'),
  put('PUT'),
  patch('PATCH'),
  delete('DELETE');

  const HttpMethod(this.wire);
  final String wire;
}

class ApiRequest {
  const ApiRequest(this.method, this.path, {this.query = const {}, this.body});

  const ApiRequest.get(String path, {Map<String, String> query = const {}})
    : this(HttpMethod.get, path, query: query);

  /// `/api/v1` 뒤의 경로. 예: `/posts/today`.
  final HttpMethod method;
  final String path;
  final Map<String, String> query;

  /// JSON으로 직렬화할 본문. null이면 본문과 Content-Type을 보내지 않는다.
  final Map<String, Object?>? body;
}
