// Runs on the host (Maestro runScript), so the mock server is always http://localhost:4010 here,
// regardless of whether the app reaches it as 10.0.2.2 (Android emulator) or localhost (iOS simulator).
var base = typeof MOCK_ADMIN !== 'undefined' ? MOCK_ADMIN : 'http://localhost:4010';
var name = typeof SCENARIO !== 'undefined' && SCENARIO ? SCENARIO : 'default';
http.post(base + '/__admin/reset', {});
var res = http.post(base + '/__admin/scenario', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: name }),
});
if (!res.ok) {
  throw new Error('cannot select mock scenario "' + name + '": HTTP ' + res.status + ' ' + res.body);
}
