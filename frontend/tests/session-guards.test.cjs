const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, engine } = require('./ui-harness.cjs');

for (const role of ['member', 'treasurer']) {
  test(`${role} protected routes wait for restoration and redirect signed-out users`, () => {
    const e = engine();
    const auth = { loading: true, user: null };
    const Layout = load(`app/(${role})/_layout.tsx`, {
      react: e.react,
      'expo-router': { Tabs: { Screen: 'Screen' }, Redirect: 'Redirect' },
      '../../contexts/AuthContext': { useAuth: () => auth },
      '@expo/vector-icons': { Ionicons: 'Icon' },
      '../../constants/Colors': { Colors: {} },
      'react-native': { Platform: { OS: 'android' } },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    }).default;
    assert.equal(e.render(Layout), null);
    auth.loading = false;
    const signedOut = e.render(Layout);
    assert.equal(signedOut.type, 'Redirect');
    assert.equal(signedOut.props.href, '/auth');
    auth.user = { id: 'test-person' };
    assert.notEqual(e.render(Layout).type, 'Redirect');
  });
}
