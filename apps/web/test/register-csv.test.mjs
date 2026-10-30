import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCsv} from '../lib/register-csv.mjs';
test('register CSV escapes text and blocks spreadsheet formulas',()=>{
 for(const kind of ['risks','obligations']){
  const csv=registerCsv(kind,[{title:'=1+1',siteName:'Site; "Nord"',description:'\n@cmd',excerpt:'\n@cmd'}]);
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"Site; ""Nord"""'));assert.ok(csv.includes('"\'\n@cmd"'));
 }
 assert.throws(()=>registerCsv('unknown',[]));
});
