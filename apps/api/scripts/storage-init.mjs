import { S3Client,CreateBucketCommand,HeadBucketCommand,DeleteBucketPolicyCommand,PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { readConfig } from '../src/config.mjs';
const {storage}=readConfig();
if(process.env.NODE_ENV!=='development'||!storage?.endpoint||!['127.0.0.1','localhost','[::1]'].includes(new URL(storage.endpoint).hostname))throw new Error('Storage initialization is restricted to explicit local development endpoints.');
const client=new S3Client({region:storage.region,endpoint:storage.endpoint,forcePathStyle:storage.forcePathStyle,maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED'});
try{
  const deadline=Date.now()+30000;let healthy=false;
  while(Date.now()<deadline){try{healthy=(await fetch(new URL('/minio/health/ready',storage.endpoint),{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(healthy)break;await new Promise(resolve=>setTimeout(resolve,500));}
  if(!healthy)throw new Error('Local MinIO is not ready. Start docker compose --profile storage up -d minio.');
  try{await client.send(new HeadBucketCommand({Bucket:storage.bucket}));}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;await client.send(new CreateBucketCommand({Bucket:storage.bucket,...(storage.region==='us-east-1'?{}:{CreateBucketConfiguration:{LocationConstraint:storage.region}})}));}
  try{await client.send(new DeleteBucketPolicyCommand({Bucket:storage.bucket}));}catch(e){if(e.$metadata?.httpStatusCode!==404)throw e;}
  await client.send(new PutBucketLifecycleConfigurationCommand({Bucket:storage.bucket,LifecycleConfiguration:{Rules:[{ID:'expire-staging',Status:'Enabled',Filter:{Prefix:'staging/'},Expiration:{Days:1}}]}}));
  console.log('Local private bucket and staging expiry configured. Browser origins are restricted by the Compose MinIO service.');
}finally{client.destroy();}
