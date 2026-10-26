import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { downloadDisposition,finalKey,MAX_FILE_BYTES,stagingKey,validateFileMetadata,verifyFileStream } from '../src/attachments/rules.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const metadata={filename:'preuve.txt',mimeType:'text/plain',size:6,sha256:digest('preuve')};
const tenant='10000000-0000-4000-8000-000000000001',id='50000000-0000-4000-8000-000000000001',attempt='60000000-0000-4000-8000-000000000001';
test('supported file metadata preserves filename and declared content identity',()=>{
  validateFileMetadata(metadata);validateFileMetadata({...metadata,filename:'CONTRÔLE.PDF',mimeType:'application/pdf'});
  validateFileMetadata({...metadata,filename:'photo.heic',mimeType:'image/heic'});
});
test('unsafe names, unsupported types and extension mismatches are rejected',()=>{
  for(const filename of ['../preuve.txt','a/b.txt','a\\b.txt','preuve\r\n.txt','preuve\0.txt',' preuve.txt','preuve.txt '])assert.throws(()=>validateFileMetadata({...metadata,filename}),{status:400});
  for(const change of [{filename:'page.html',mimeType:'text/html'},{filename:'photo.svg',mimeType:'image/svg+xml'},{filename:'preuve.pdf',mimeType:'text/plain'},{mimeType:'__proto__'}])assert.throws(()=>validateFileMetadata({...metadata,...change}),{status:400});
});
test('size and SHA metadata cannot bypass the upload boundary',()=>{
  for(const size of [0,-1,1.5,MAX_FILE_BYTES+1])assert.throws(()=>validateFileMetadata({...metadata,size}),{status:400});
  for(const sha256 of ['', 'a'.repeat(63),'G'.repeat(64)])assert.throws(()=>validateFileMetadata({...metadata,sha256}),{status:400});
});
test('storage names separate staging from immutable final attempts and enforce tenant UUIDs',()=>{
  assert.equal(stagingKey(tenant,id),`staging/${tenant}/${id}`);
  assert.equal(finalKey(tenant,id,attempt),`tenants/${tenant}/objects/${id}/${attempt}`);
  assert.notEqual(finalKey(tenant,id,attempt),stagingKey(tenant,id));
  assert.throws(()=>stagingKey('../other',id));assert.throws(()=>finalKey(tenant,id,'../replace'));
});
test('download headers force attachment and encode Unicode without raw control characters',()=>{
  const header=downloadDisposition('procédure "qualité"\r\n.txt');
  assert.ok(header.startsWith('attachment; filename="'));assert.ok(header.includes("filename*=UTF-8''"));assert.ok(header.includes('%C3%A9'));assert.doesNotMatch(header,/[\r\n]/);
});
test('streamed UTF-8 verification works across multibyte chunk boundaries',async()=>{
  const bytes=Buffer.from('épreuve');
  await verifyFileStream(Readable.from([bytes.subarray(0,1),bytes.subarray(1)]),{size:bytes.length,sha256:digest(bytes),mimeType:'text/plain'});
});
test('streamed verification rejects checksum and length mismatches',async()=>{
  const bytes=Buffer.from('preuve');
  for(const expected of [{size:bytes.length,sha256:'0'.repeat(64),mimeType:'text/plain'},{size:bytes.length-1,sha256:digest(bytes),mimeType:'text/plain'},{size:bytes.length+1,sha256:digest(bytes),mimeType:'text/plain'}])await assert.rejects(verifyFileStream(Readable.from([bytes]),expected),{status:422});
});
test('streamed verification stops oversized data before accepting its integrity claim',async()=>{
  await assert.rejects(verifyFileStream(Readable.from([Buffer.alloc(MAX_FILE_BYTES+1)]),{size:MAX_FILE_BYTES,sha256:'0'.repeat(64),mimeType:'application/pdf'}),{status:422});
});
test('content signatures distinguish advertised documents and photographs',async()=>{
  const pdf=Buffer.from('%PDF-1.7\nfixture');await verifyFileStream(Readable.from([pdf]),{size:pdf.length,sha256:digest(pdf),mimeType:'application/pdf'});
  const png=Buffer.from('89504e470d0a1a0a00000000','hex');await verifyFileStream(Readable.from([png]),{size:png.length,sha256:digest(png),mimeType:'image/png'});
  const fake=Buffer.from('not a PDF');await assert.rejects(verifyFileStream(Readable.from([fake]),{size:fake.length,sha256:digest(fake),mimeType:'application/pdf'}),{status:422});
});
test('binary, invalid and incomplete encodings cannot be accepted as plain UTF-8 text',async()=>{
  for(const bytes of [Buffer.from([0,65]),Buffer.from([0xc3,0x28]),Buffer.from([0xc3])])await assert.rejects(verifyFileStream(Readable.from([bytes]),{size:bytes.length,sha256:digest(bytes),mimeType:'text/plain'}),{status:422});
});
