const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../app/(treasurer)/dashboard.tsx'), 'utf8');
const colorsSource = fs.readFileSync(path.join(__dirname, '../constants/Colors.ts'), 'utf8');
const moduleColors = { exports: {} };
new Function('exports', ts.transpileModule(colorsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleColors.exports);
const Colors = moduleColors.exports.Colors;
const block = source.match(/<Text style=\{styles.progressText\}>([\s\S]*?)<\/Text>\s*<\/View>/)[1];
for (const [collected, expected] of [[200, 0], [0, 100]]) {
  test(`club card ${collected}/${expected} retains values with brand hierarchy`, () => {
    const spans = [...block.matchAll(/<Text style=\{\{ color: Colors\.(\w+) \}\}>([\s\S]*?)<\/Text>/g)];
    assert.deepEqual(spans.map(s => s[1]), ['accent', 'textMuted', 'primary']);
    assert.deepEqual(spans.map(s => Colors[s[1]]), ['#2677E8', '#6B7280', '#06285B']);
    const club = { financial_summary: { collected, total_expected: expected } };
    const paymentMoney = require("./ui-harness.cjs").load("services/paymentSummaryRecords.ts").paymentMoney;
    const rendered = spans.map(s => s[2].replace(/\{([^}]+)\}/g, (_, expression) => new Function('club', 'paymentMoney', `return ${expression}`)(club,paymentMoney))).join('');
    assert.equal(rendered, `R${collected.toFixed(2)} / R${expected.toFixed(2)}`);
  });
}
test('Member My Clubs describes its configured contribution model rather than an actual/expected pair', () => {
  const member = fs.readFileSync(path.join(__dirname, '../app/(member)/home.tsx'), 'utf8');
  assert.ok(member.includes('{contributionDescription(club)}'));
  assert.ok(member.includes("club.contribution_mode === 'fixed_monthly'"));
  assert.ok(member.includes('`${paymentMoney(amount)}/month`'));
  assert.ok(member.includes("club.contribution_mode === 'flexible_goal'"));
  assert.ok(member.includes('`${paymentMoney(target)} goal per member`'));
  assert.ok(!member.includes('R{club.monthly_contribution}/month'));
});
