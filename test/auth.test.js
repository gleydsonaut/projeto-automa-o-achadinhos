import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, scryptSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { OAuth2Client } from 'google-auth-library';
import { createAuthentication, googleConfiguration, registrationError, passwordHash, passwordValid } from '../auth.js';
import { prepareStorage } from '../storage.js';
import { authMarkup } from '../public/auth-ui.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const config = googleConfiguration({ GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-only-secret',OFERTA_ORIGIN:'http://127.0.0.1:3138' });

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'oferta-auth-'));
  const db=new DatabaseSync(join(directory,'oferta.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,password_hash TEXT,created_at TEXT);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at TEXT);
  `);
  const vault=await prepareStorage(db,directory);
  const state={nonce:'',challenge:'',claims:{},badSignature:false,providerError:false,verificationCalls:0,clock:Date.now()};
  const clientFactory=()=>{
    const client=new OAuth2Client({clientId:config.clientId,clientSecret:config.clientSecret,redirectUri:config.redirectUri});
    client.getToken=async options=>{
      if(state.providerError)throw new Error('provider trace containing test-only-secret');
      assert.equal(options.redirect_uri,config.redirectUri);
      assert.equal(createHash('sha256').update(options.codeVerifier).digest('base64url'),state.challenge);
      const now=Math.floor(Date.now()/1000);
      const body={iss:'https://accounts.google.com',aud:config.clientId,sub:'google-user-123',email:'google@example.test',email_verified:true,name:'Nome Google',iat:now-10,exp:now+3600,nonce:state.nonce,...state.claims};
      const input=`${encode({alg:'RS256',kid:'test-key'})}.${encode(body)}`;
      const signature=state.badSignature?Buffer.alloc(256):sign('RSA-SHA256',Buffer.from(input),keys.privateKey);
      return {tokens:{id_token:`${input}.${signature.toString('base64url')}`}};
    };
    client.getFederatedSignonCertsAsync=async()=>({certs:{'test-key':publicKey},format:'PEM'});
    const verify=client.verifyIdToken.bind(client);
    client.verifyIdToken=async options=>{state.verificationCalls++;return verify(options);};
    return client;
  };
  const auth=createAuthentication({db,vault,config,clientFactory,clock:()=>state.clock});
  t.after(()=>db.close());
  async function begin(intent='register',userId=null){const start=await auth.begin(intent,userId),url=new URL(start.url);state.nonce=url.searchParams.get('nonce');state.challenge=url.searchParams.get('code_challenge');return {state:url.searchParams.get('state'),browser:start.cookie.split(';')[0].split('=')[1],code:'test-authorization-code'};}
  return {db,auth,state,begin};
}

test('login e cadastro renderizam campos distintos, sem depender de hidden',()=>{
  const login=authMarkup({mode:'login'}),register=authMarkup({mode:'register'});
  assert.match(login,/name="email"/);assert.match(login,/name="password"/);
  assert.doesNotMatch(login,/name="name"|name="phone"|name="passwordConfirmation"/);
  assert.match(login,/autocomplete="current-password"/);
  assert.match(register,/name="name"/);assert.match(register,/name="passwordConfirmation"/);assert.match(register,/autocomplete="new-password"/);
  assert.doesNotMatch(login,/auth\/google\/start/);
  assert.match(authMarkup({mode:'register',googleEnabled:true}),/intent=register/);
  assert.match(authMarkup({mode:'login',googleEnabled:true}),/intent=login/);
});

test('cadastro exige confirmação e senha forte; hashes antigos continuam válidos',async()=>{
  const data={name:'Pessoa',email:'p@example.test',password:'Uma-senha-longa-123',passwordConfirmation:'Uma-senha-longa-123'};
  assert.equal(registrationError(data),null);
  assert.match(registrationError({...data,passwordConfirmation:'outra'}),/confirmação/);
  assert.match(registrationError({...data,password:'curta'}),/12/);
  const stored=await passwordHash(data.password);
  assert.equal(await passwordValid(data.password,stored),true);assert.equal(await passwordValid('errada',stored),false);
  const salt='abcdef0123456789abcdef0123456789';
  assert.equal(await passwordValid('antiga12345',`${salt}:${scryptSync('antiga12345',salt,64).toString('hex')}`),true);
  assert.equal(await passwordValid('x','!google-only'),false);
});

test('Google verifica JWT assinado e PKCE, cria identidade e consome state uma única vez',async t=>{
  const {db,auth,state,begin}=await fixture(t);
  const attempt=await begin();const result=await auth.complete(attempt);
  assert.equal(result.created,true);assert.equal(result.user.email,'google@example.test');assert.equal(state.verificationCalls,1);
  assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash,'!google-only');
  assert.equal(auth.linked(result.user.id),true);
  await assert.rejects(()=>auth.complete(attempt),error=>error.code==='invalid_state');
  const returning=await auth.complete(await begin('login'));assert.equal(returning.user.id,result.user.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,1);
  assert.equal(JSON.stringify(auth.providers()).includes(config.clientSecret),false);
});

test('Google rejeita assinatura, issuer, audience, nonce, e-mail e expiração inválidos',async t=>{
  const {auth,state,begin}=await fixture(t);
  for(const claims of [{iss:'https://evil.test'},{aud:'wrong-client'},{nonce:'wrong'},{email_verified:false},{exp:1}]){
    state.claims=claims;await assert.rejects(()=>begin().then(attempt=>auth.complete(attempt)),error=>error.code==='google_failed');
  }
  state.claims={};state.badSignature=true;await assert.rejects(()=>begin().then(attempt=>auth.complete(attempt)),error=>error.code==='google_failed');
});

test('state pertence ao navegador, expira e erros do provedor não revelam segredo',async t=>{
  const {auth,state,begin}=await fixture(t);const first=await begin();
  await assert.rejects(()=>auth.complete({...first,browser:'outro-navegador'}),error=>error.code==='invalid_state');
  state.clock+=11*60000;await assert.rejects(()=>auth.complete(first),error=>error.code==='invalid_state');
  state.providerError=true;await assert.rejects(()=>begin().then(attempt=>auth.complete(attempt)),error=>error.code==='google_failed'&&!error.message.includes(config.clientSecret));
});

test('e-mail igual não toma uma conta local; vínculo exige sessão e escolha explícita',async t=>{
  const {db,auth,begin}=await fixture(t);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('local','Pessoa','google@example.test','','hash-local',new Date().toISOString());
  await assert.rejects(()=>begin().then(attempt=>auth.complete(attempt)),error=>error.code==='account_exists');
  const link=await begin('link','local');await assert.rejects(()=>auth.complete({...link,currentUserId:'outra'}),error=>error.code==='invalid_state');
  const linked=await auth.complete({...await begin('link','local'),currentUserId:'local'});assert.equal(linked.linked,true);
  assert.equal((await auth.complete(await begin('login'))).user.id,'local');
});

test('sessão é opaca, rotacionada e não contém segredo nem hash de senha',async t=>{
  const {auth,db}=await fixture(t);db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('u','Pessoa','p@example.test','','hash-secret',new Date().toISOString());
  const user=db.prepare('SELECT * FROM users').get(),first=auth.session(user),oldToken=first.cookie.split(';')[0].split('=')[1];
  const second=auth.session(user,oldToken);
  assert.notEqual(first.cookie,second.cookie);assert.match(second.cookie,/HttpOnly; SameSite=Lax/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
  assert.equal(JSON.stringify(second).includes('hash-secret'),false);
  assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash.includes(oldToken),false);
});

test('origem de produção exige HTTPS e adiciona Secure aos cookies',async t=>{
  assert.throws(()=>googleConfiguration({OFERTA_ORIGIN:'http://app.example.com'}));
  const {db}=await fixture(t);const secure=createAuthentication({db,vault:{},config:googleConfiguration({OFERTA_ORIGIN:'https://app.example.com'})});
  assert.match(secure.cookie('oferta_session','x',10),/; Secure$/);
});
