import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertManualPrivacy} from './privacy.mjs';

test('warnings must not introduce hidden business concepts to operational roles', () => {
  for (const role of ['worker','chief','manager','supplier-coordinator','external-technician']) {
    for (const sentence of [
      'Keep client prices, internal cost and margins out of screenshots.',
      'This view does not expose another worker’s compensation.',
    ]) assert.throws(() => assertManualPrivacy(role,[{recovery:[sentence]}]), /Owner-only disclosure/);
  }
});
test('Owner-only economics are also rejected in Finance and Auditor guides', () => {
  for (const role of ['finance','auditor'])
    assert.throws(() => assertManualPrivacy(role,[{figures:[{caption:'Contribution margin uses loaded labor cost.'}]}]), /Owner-only disclosure/);
});
test('personal pay and expense instructions remain available', () => {
  assert.doesNotThrow(() => assertManualPrivacy('worker',[{steps:['Open My Pay and verify your own statement.','Attach the receipt for your expense.']}]))
});
test('cross-domain warnings cannot reintroduce private business distinctions', () => {
  for (const role of ['finance', 'auditor', 'worker']) {
    for (const sentence of [
      'Customer expense recovery is a different invoice amount.',
      'Choose the agreed worker period independently of the customer invoice cadence.',
      'A billing stream does not set worker pay.',
      'Keep economic data away from this audience.',
    ]) assert.throws(() => assertManualPrivacy(role, [{ paragraphs: [sentence] }]), /Owner-only disclosure/);
  }
});
test('a previously reviewed leaking screenshot cannot be reintroduced', () => {
  assert.throws(() => assertManualPrivacy('manager',[{figures:[{src:'evidence/pm06-actual-sensitivity-upload-form.png',caption:'Upload form.'}]}]), /Owner-only screenshot/);
});
test('Owner retains business economics and their original evidence', () => {
  assert.doesNotThrow(() => assertManualPrivacy('owner',[{paragraphs:['Client prices, internal cost and margin.'],figures:[{src:'evidence/29-finance-current-project-economics.png'}]}]));
});

test('operational preparation and recovery do not introduce commercial processing', () => {
  for (const role of ['worker','chief','manager','supplier-coordinator','external-technician']) {
    for (const sentence of ['Billability — Pending','Commercial treatment is handled separately.','Worker reimbursement and customer billing are separate.','Request a payment reversal.'])
      assert.throws(() => assertManualPrivacy(role,[{paragraphs:[sentence]}]), /Owner-only disclosure/);
  }
});
test('Finance retains its authorized input label without receiving costing guidance', () => {
  assert.doesNotThrow(() => assertManualPrivacy('finance',[{steps:['Enter the Owner-approved value in Internal hourly cost (USD).']}]))
  assert.throws(() => assertManualPrivacy('finance',[{paragraphs:['Internal hourly cost determines contribution margin.']}]), /Owner-only disclosure/);
});
