import 'package:flutter/material.dart';

/// 라우트가 ViewModel의 생성과 해제를 맡는다(화면이 사라지면 dispose).
class ViewModelHost<T extends ChangeNotifier> extends StatefulWidget {
  const ViewModelHost({super.key, required this.create, required this.builder});

  final T Function() create;
  final Widget Function(BuildContext context, T viewModel) builder;

  @override
  State<ViewModelHost<T>> createState() => ViewModelHostState<T>();
}

class ViewModelHostState<T extends ChangeNotifier>
    extends State<ViewModelHost<T>> {
  late final T _viewModel = widget.create();

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _viewModel);
}
