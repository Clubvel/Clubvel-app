const test = require('node:test');
const assert = require('node:assert/strict');
const { load, engine, tick, nodes, text, button, native, colors } = require('./ui-harness.cjs');

async function setup() {
  const ui = engine(), requests = [], opened = [], alerts = [];
  const state = { reject: false, openReject: false, status: 'submitted', wait: null };
  const Screen = load('app/(treasurer)/members.tsx', {
    react: ui.react,
    'react-native': { ...native, TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
      Linking: { openURL: async url => { opened.push(url); if (state.openReject) throw Error('Unavailable'); } },
      Alert: { alert: (...args) => alerts.push(args) } },
    '../../constants/Colors': { Colors: colors }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../../components/StatusPill': { StatusPill: 'StatusPill' }, '../../components/AdBanner': { AdBanner: 'AdBanner' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'admin', full_name: 'Admin' }, token: 'session' }) },
    'expo-router': { useRouter: () => ({ push() {} }) },
    axios: {
      get: async url => ({ data: url.includes('/dashboard/') ? { clubs: [{ id: 'club', name: 'Old local name' }] } : { members: [] } }),
      post: async (url, data, options) => {
        requests.push({ url, data, options });
        if (state.reject) throw { response: { data: { detail: 'Access denied' } } };
        if (state.wait) await state.wait;
        return { data: { phone_number: '+27821234567', invitation_message: 'Hi! A & B → Clubvel?', delivery_status: state.status } };
      },
    },
  }).default;
  const render = () => ui.render(Screen);
  render(); await tick(); render(); await tick(); render();
  button(render(), 'Invite New Member').props.onPress();
  const input = nodes(render()).find(n => n.type === 'TextInput' && n.props.keyboardType === 'phone-pad');
  input.props.onChangeText('0821234567');
  return { render, requests, opened, alerts, state };
}
const exact = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n) === label);

test('WhatsApp posts once with existing session then opens normalized encoded backend message', async () => {
  const c = await setup(); await exact(c.render(), 'WhatsApp').props.onPress();
  assert.equal(c.requests.length, 1);
  assert.deepEqual(c.requests[0].data, { phone_number: '0821234567', name: undefined, group_id: 'club', channel: 'whatsapp' });
  assert.deepEqual(c.requests[0].options.headers, { Authorization: 'Bearer session' });
  assert.equal(c.opened[0], 'https://wa.me/27821234567?text=' + encodeURIComponent('Hi! A & B → Clubvel?'));
  assert.equal(c.alerts.at(-1)[0], 'WhatsApp opened');
  assert.ok(c.requests.every(r => r.url.endsWith('/invite-member')));
});

test('backend failure prevents WhatsApp launch', async () => {
  const c = await setup(); c.state.reject = true;
  await exact(c.render(), 'WhatsApp').props.onPress();
  assert.deepEqual(c.opened, []); assert.equal(c.alerts.at(-1)[1], 'Access denied');
});

test('WhatsApp launch failure offers SMS fallback and never invokes membership acceptance', async () => {
  const c = await setup(); c.state.openReject = true;
  await exact(c.render(), 'WhatsApp').props.onPress();
  const alert = c.alerts.at(-1); assert.equal(alert[0], 'WhatsApp could not be opened');
  assert.match(alert[1], /still pending/);
  await alert[2].find(b => b.text === 'Use SMS').onPress();
  assert.deepEqual(c.requests.map(r => r.data.channel), ['whatsapp', 'sms']);
  assert.ok(c.requests.every(r => r.url.endsWith('/invite-member')));
  assert.equal(c.alerts.at(-1)[0], 'SMS submitted');
});

test('cancellation/unsent WhatsApp leaves no frontend membership operation and allows same invitation retry', async () => {
  const c = await setup(); await exact(c.render(), 'WhatsApp').props.onPress();
  await exact(c.render(), 'WhatsApp').props.onPress();
  assert.equal(c.requests.length, 2);
  assert.deepEqual(c.requests[0].data, c.requests[1].data);
  assert.ok(c.requests.every(r => r.url.endsWith('/invite-member')));
});

test('overlapping taps are blocked before React renders disabled controls', async () => {
  const c = await setup(); let finish; c.state.wait = new Promise(resolve => { finish = resolve; });
  const first = exact(c.render(), 'WhatsApp').props.onPress();
  const second = exact(c.render(), 'SMS').props.onPress();
  await tick(); assert.equal(c.requests.length, 1);
  assert.equal(c.opened.length, 0);
  assert.equal(exact(c.render(), 'SMS').props.disabled, true);
  finish(); await Promise.all([first, second]); assert.equal(c.opened.length, 1);
});

test('SMS failure and mock mode are never described as sent', async () => {
  for (const status of ['failed', 'mock']) {
    const c = await setup(); c.state.status = status;
    await exact(c.render(), 'SMS').props.onPress();
    assert.equal(c.opened.length, 0);
    assert.equal(c.alerts.at(-1)[0], status === 'mock' ? 'Invitation saved' : 'SMS could not be sent');
    assert.match(c.alerts.at(-1)[1], /pending/);
  }
});
