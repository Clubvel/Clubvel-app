const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { paymentRemaining, paymentSummaryRecords } = load('services/paymentSummaryRecords.ts');
const row = (id, due, paid, status = 'pending', raw = status) => ({ id, amount_due: due, amount_paid: paid, status, contribution_status: raw });
test('Payments reconciliation includes valid unconfirmed recorded payments and preserves separate contributions', () => {
  const records = [row('one',100,25),row('two',100,50,'proof_uploaded'),row('settled',100,10,'confirmed'),row('excused',100,90,'excused'),row('unknown',null,10),row('negative',100,-1),row('invalid',NaN,4),row('boolean',true,4)];
  const result = paymentSummaryRecords(records,{collected:85,outstanding:125});
  assert.equal(result.collectedMatches,true);assert.equal(result.outstandingMatches,true);
  assert.deepEqual(result.collected.map(r=>r.id),['one','two','settled']);assert.deepEqual(result.outstanding.map(r=>r.id),['one','two']);
  assert.equal(paymentRemaining(records[2]),0);assert.equal(paymentRemaining(records[4]),null);
});
test('Settled/excused/overpaid balances and zero totals do not invent outstanding records', () => {
  for(const status of ['confirmed','paid','excused'])assert.equal(paymentRemaining(row(status,100,10,status)),0);
  assert.equal(paymentRemaining(row('over',100,120)),0);
  const empty = paymentSummaryRecords([],{collected:0,outstanding:0});assert.equal(empty.collectedMatches,true);assert.equal(empty.outstandingMatches,true);
  const mismatch = paymentSummaryRecords([row('one',100,25)],{collected:100,outstanding:100});assert.equal(mismatch.collectedMatches,false);assert.equal(mismatch.outstandingMatches,false);
});
