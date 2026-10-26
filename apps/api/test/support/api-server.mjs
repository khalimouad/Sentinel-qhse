import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access} from 'node:fs/promises';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
export const tenant='10000000-0000-4000-8000-000000000001';
export async function startTestApi(){
  if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL and migrate/seed a disposable test database first.');
  const entrypoint=new URL('../../dist/main.js',import.meta.url);await access(entrypoint);
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const jwk={...await exportJWK(publicKey),kid:'test-key',use:'sig',alg:'RS256'};
  const jwksServer=createServer((request,response)=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({keys:[jwk]}));});
  let child;
  async function close(){
    if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);try{await exited;}finally{clearTimeout(timer);}}
    if(jwksServer.listening)await new Promise(resolve=>jwksServer.close(resolve));
  }
  try{
    jwksServer.listen(0,'127.0.0.1');await once(jwksServer,'listening');
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const issuer='urn:sentinelle:development',baseUrl=`http://127.0.0.1:${port}/api/v1`;
    const env={...process.env,NODE_ENV:'development',DEV_AUTH_ENABLED:'false',API_HOST:'127.0.0.1',API_PORT:String(port),OIDC_ISSUER:issuer,OIDC_AUDIENCE:'sentinelle-test',OIDC_JWKS_URI:`http://127.0.0.1:${jwksServer.address().port}/jwks`};delete env.DATABASE_ADMIN_URL;
    child=spawn(process.execPath,[entrypoint.pathname],{env,stdio:'ignore'});
    const deadline=Date.now()+15000;let healthy=false;
    while(Date.now()<deadline){if(child.exitCode!==null)throw new Error('Test API failed to start. Verify the build and database role.');try{healthy=(await fetch(`${baseUrl}/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(healthy)break;await new Promise(resolve=>setTimeout(resolve,100));}
    if(!healthy)throw new Error('Test API startup timed out.');
    return {
      close,
      async token(subject='jean-dupont',overrides={}){return new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuedAt().setIssuer(issuer).setAudience(overrides.audience||'sentinelle-test').setSubject(subject).setExpirationTime(overrides.expiration||'5m').sign(privateKey);},
      async request(path,auth,options={}){return fetch(`${baseUrl}/${path}`,{...options,headers:{...(auth?{Authorization:`Bearer ${auth}`} : {}),'X-Tenant-Id':tenant,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});},
    };
  }catch(error){await close();throw error;}
}
