const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, engine, nodes, text, native, colors } = require('./ui-harness.cjs');

const mission = 'Clubvel helps people achieve more together. From traditional stokvels to new ways of saving towards shared goals, we make it simple to organise, contribute, track progress and manage money together.';
const features = [
  ['Save Together', 'Create a Clubvel with people you trust and work towards a shared goal.'],
  ['Stay Organised', 'Keep contributions, payments, claims and important records together.'],
  ['See Your Progress', "Know what's been contributed, what's outstanding and how your Clubvel is progressing."],
  ['Manage Together', 'Give members and administrators the information they need to keep the group transparent and organised.'],
];
function render(role, height = 84, bottom = 24) {
  const hooks = engine(); const routes = []; const links = [];
  const Screen = load(`app/(${role})/about.tsx`, {
    react: hooks.react,
    'react-native': { ...native, Linking: { openURL: url => links.push(url) } },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '../../constants/Colors': { Colors: colors },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 30, bottom }) },
    '@react-navigation/bottom-tabs': { useBottomTabBarHeight: () => height },
    '../../assets/images/clubvel-launcher-icon.png': 'approved-logo',
  }).default;
  return { tree: hooks.render(Screen), routes, links };
}
for (const role of ['member', 'treasurer']) {
  test(`${role}: approved exact copy and broader positioning`, () => {
    const { tree } = render(role); const labels = nodes(tree).filter(n => n.type === 'Text').map(text);
    for (const label of ['Clubvel', 'save, plan, grow together', 'Our Mission', mission, 'What We Do', ...features.flat()]) assert.ok(labels.includes(label), label);
    const titles = features.map(([title]) => labels.indexOf(title));
    assert.deepEqual([...titles].sort((a, b) => a - b), titles);
    assert.doesNotMatch(text(tree), /Smart Stokvel|Social Club \/ Society Management|Claims Rotation|building towards something important/);
  });
  test(`${role}: current unchanged app logo with contain cropping`, () => {
    const image = nodes(render(role).tree).find(n => n.type === 'Image');
    assert.equal(image.props.source, 'approved-logo');
    assert.equal(image.props.resizeMode, 'contain');
    const wordmark = nodes(render(role).tree).find(n => n.type === 'Text' && text(n) === 'Clubvel');
    assert.equal(wordmark.props.style.marginTop, 0);
    assert.equal(image.props.style.width, 104); assert.equal(image.props.style.height, 104);
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'))).expo;
    assert.equal(config.icon, './assets/images/clubvel-launcher-icon.png');
  });
  test(`${role}: scroll content clears tab bar and system inset`, () => {
    for (const [height, bottom] of [[60, 0], [84, 24], [108, 48], [60, 80]]) {
      const { tree } = render(role, height, bottom);
      const scroll = nodes(tree).find(n => n.type === 'ScrollView');
      assert.equal(scroll.props.contentContainerStyle.paddingBottom, Math.max(height, bottom) + 24);
      assert.ok(text(scroll).endsWith('Made with ❤️ in South Africa'));
      assert.equal(nodes(tree)[1].props.style[1].paddingTop, 46);
      const description = nodes(tree).find(n => n.type === 'Text' && text(n) === features[0][1]);
      assert.equal(description.props.numberOfLines, undefined);
    }
  });
  test(`${role}: existing Back and contact actions preserved`, () => {
    const { tree, routes, links } = render(role);
    const buttons = nodes(tree).filter(n => n.type === 'TouchableOpacity');
    buttons.forEach(b => b.props.onPress());
    assert.deepEqual(routes, [`/(${role})/profile`]);
    assert.deepEqual(links, ['mailto:support@clubvel.co.za', 'https://www.clubvel.co.za']);
  });
}
test('Member and Admin About content and layout remain identical', () => {
  const member = render('member').tree; const admin = render('treasurer').tree;
  assert.equal(text(member), text(admin));
  assert.deepEqual(JSON.parse(JSON.stringify(member)), JSON.parse(JSON.stringify(admin)));
});
