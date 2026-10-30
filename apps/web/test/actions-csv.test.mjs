import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsCsv } from '../lib/actions-csv.mjs';
test('CSV quotes delimiters, line breaks and spreadsheet formulas',()=>{
  const csv=actionsCsv([{id:'1',title:'=SUM(1;2)',origin:'A "quote"\nline',siteName:'Site',ownerName:'\t+1',priority:'normal',status:'open'}]);
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=SUM(1;2)"'));
  assert.ok(csv.includes('"A ""quote""\nline"'));assert.ok(csv.includes('"\'\t+1"'));
});
