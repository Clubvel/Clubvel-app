const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const policy = load('services/contributions.ts');
const record = (extra = {}) => ({ contribution_id: 'obligation-1', group_id: 'group-1', group_name: 'Test group',
  amount_due: 125.50, amount_paid: 25, contribution_status: 'pending', proof_uploaded: false, month: 8, year: 2026, ...extra });

for (const status of ['pending', 'due', 'late']) {
  test(`${status} actual outstanding contribution is eligible`, () => {
    const rows = policy.eligibleProofContributions({ contributions: [record({ contribution_status: status })] });
    assert.equal(rows.length, 1); assert.equal(policy.proofOutstanding(rows[0]), 100.5);
  });
}
test('settled, excused, awaiting review and fully paid records are not eligible', () => {
  for (const contribution_status of ['confirmed', 'paid', 'excused', 'proof_uploaded']) {
    assert.deepEqual(policy.eligibleProofContributions({ contributions: [record({ contribution_status })] }), []);
  }
  for (const extra of [{ amount_paid: 125.5 }, { amount_paid: 150 }, { proof_uploaded: true }]) {
    assert.deepEqual(policy.eligibleProofContributions({ contributions: [record(extra)] }), []);
  }
});
test('no recorded obligation stays empty; invalid or incomplete responses fail rather than inventing data', () => {
  assert.deepEqual(policy.eligibleProofContributions({ contributions: [] }), []);
  for (const data of [{}, null, { contributions: [record({ amount_due: null })] },
    { contributions: [record({ amount_paid: NaN })] }, { contributions: [record({ contribution_id: '' })] }]) {
    assert.throws(() => policy.eligibleProofContributions(data));
  }
});
test('confirmation submits only the exact contribution ID and contextual administrator identity', () => {
  assert.deepEqual(policy.confirmationPayload('obligation-1', 'person'), { contribution_id: 'obligation-1', treasurer_id: 'person' });
  assert.throws(() => policy.confirmationPayload(null, 'person'));
  assert.throws(() => policy.confirmationPayload('obligation-1', undefined));
  const screen = fs.readFileSync(path.join(__dirname, '../app/(treasurer)/club-detail.tsx'), 'utf8');
  assert.match(screen, /handleConfirmPayment\(member\.contribution_id,/);
  assert.match(screen, /confirmationPayload\(contributionId, user\?\.id\)/);
  const proofs = fs.readFileSync(path.join(__dirname, '../app/(member)/proofs.tsx'), 'utf8');
  assert.match(proofs, /const contributionId = club\.contribution_id/);
  assert.match(proofs, /contribution_id: contributionId/);
  assert.doesNotMatch(proofs, /\/api\/member\/club\//);
});

// Run the actual hook with in-memory React primitives; no native runtime/network.
function harness(loader) {
  const slots = []; let cursor = 0; let effects = []; let loadFn = loader;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const { useProofSelector } = load('hooks/useProofSelector.ts', { react });
  const render = () => { cursor = 0; effects = []; const state = useProofSelector(loadFn); effects.forEach(f => f()); return state; };
  render();
  return { render, changePerson: fn => { loadFn = fn; render(); } };
}
test('first tap immediately opens loading, then displays actual contributions without a second tap', async () => {
  let resolve; const h = harness(() => new Promise(r => { resolve = r; }));
  const waiting = h.render().open();
  assert.equal(h.render().visible, true); assert.equal(h.render().phase, 'loading');
  resolve([record()]); await waiting;
  assert.equal(h.render().phase, 'ready'); assert.equal(h.render().contributions[0].contribution_id, 'obligation-1');
});
test('network failure differs from empty and Retry loads again', async () => {
  let fail = true; const h = harness(async () => { if (fail) throw new Error('offline'); return []; });
  await h.render().open(); assert.equal(h.render().phase, 'error'); assert.ok(h.render().error);
  fail = false; await h.render().open(); assert.equal(h.render().phase, 'empty'); assert.equal(h.render().error, null);
});
test('closing the modal or switching person prevents stale responses reopening it', async () => {
  for (const switchPerson of [false, true]) {
    let resolve; const h = harness(() => new Promise(r => { resolve = r; }));
    const waiting = h.render().open();
    if (switchPerson) h.changePerson(async () => []); else h.render().close();
    resolve([record()]); await waiting;
    assert.equal(h.render().visible, false); assert.deepEqual(h.render().contributions, []);
  }
});
