/// 화면에 한 번 보여 줄 토스트. 같은 문구가 연달아도 [id]가 달라 다시 표시된다(D-20).
class ToastMessage {
  const ToastMessage({required this.id, required this.text});

  final int id;
  final String text;

  @override
  String toString() => 'ToastMessage($id, $text)';
}
