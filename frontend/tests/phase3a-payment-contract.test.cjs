const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { paymentMoney, paymentStateLabel, paymentRemaining, paymentSummaryRecords } = load('services/paymentSummaryRecords.ts');
test('confirmed collection keeps multiple contributions but excludes unconfirmed recorded amounts', () => {
 const rows = [{id:'partial',amount_due:100,amount_paid:30,contribution_status:'pending',status:'pending'},
 {id:'confirmed',amount_due:100,amount_paid:100,contribution_status:'confirmed',status:'confirmed'},
 {id:'paid',amount_due:100,amount_paid:100,contribution_status:'paid',status:'paid'}];
 const actual = paymentSummaryRecords(rows,{collected:200,outstanding:70});
 assert.deepEqual(actual.collected.map(row=>row.id),['confirmed','paid']);
 assert.equal(actual.collectedMatches,true); assert.equal(actual.outstandingMatches,true);
 assert.equal(paymentRemaining(rows[0]),70);
});
test('missing or invalid amounts never render as zero', () => {
 for(const amount of [null,undefined,NaN,Infinity,-1])assert.equal(paymentMoney(amount),'Not available');
 assert.equal(paymentMoney(0),'R0.00');
 assert.equal(paymentRemaining({amount_due:null,amount_paid:0,status:'pending'}),null);
});
test('all approved financial states have distinct labels', () => {
 const expected = {awaiting_payment:'Awaiting Payment',awaiting_confirmation:'Awaiting Confirmation',proof_declined:'Proof Declined',confirmed:'Confirmed/Paid',excused:'Excused',missing_record:'Missing Record',invalid_amount:'Invalid Amount'};
 for(const [state,label] of Object.entries(expected))assert.equal(paymentStateLabel(state),label);
});
