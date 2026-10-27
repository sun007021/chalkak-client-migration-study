// ignore_for_file: unused_field
import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/banner_models.dart';
import '../domain/banner_repository.dart';

class ApiBannerRepository implements BannerRepository {
  ApiBannerRepository({required this._client});

  final ApiClient _client;

  @override
  Future<BannerPage> fetchPage(int page, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
