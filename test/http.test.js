import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('HTTP: conta, importação restrita, catálogo, listas, cupons, links e execução',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'oferta-http-'));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',OFERTA_DATA_DIR:directory,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',OFERTA_ORIGIN:''},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));
  const origin=await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error(`Servidor não iniciou: ${output}`)),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127.0.0.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});child.stderr.on('data',chunk=>output+=chunk);child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Servidor encerrou ${code}: ${output}`));});});
  let cookie='';
  async function call(path,{method='GET',data,headers={}}={}){
    const response=await fetch(`${origin}${path}`,{method,headers:{cookie,'content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data),redirect:'manual'});
    const jar=new Map(cookie.split('; ').filter(Boolean).map(pair=>{const index=pair.indexOf('=');return [pair.slice(0,index),pair.slice(index+1)];}));
    for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),index=pair.indexOf('=');if(/Max-Age=0(?:;|$)/i.test(value))jar.delete(pair.slice(0,index));else jar.set(pair.slice(0,index),pair.slice(index+1));}
    cookie=[...jar].map(([key,value])=>`${key}=${value}`).join('; ');
    return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};
  }
  assert.equal((await call('/api/health')).data.ok,true);
  assert.equal((await call('/api/operations')).response.status,401);
  assert.deepEqual((await call('/api/auth/providers')).data,{google:{enabled:false}});
  assert.equal((await call('/api/register',{method:'POST',data:{name:'Teste',email:'teste@example.test',password:'Test-password-1234',passwordConfirmation:'diferente'}})).response.status,400);
  const registered=await call('/api/register',{method:'POST',data:{name:'Teste',email:'teste@example.test',password:'Test-password-1234',passwordConfirmation:'Test-password-1234'}});assert.equal(registered.response.status,200);const firstCookie=cookie;
  assert.equal((await call('/api/auth/status')).data.google.linked,false);
  assert.equal((await call('/api/operations')).data.database.engine,'SQLite');
  assert.equal((await call('/api/lists',{method:'POST',data:{name:'bloqueado'},headers:{origin:'https://evil.example'}})).response.status,403);
  const group=(await call('/api/groups',{method:'POST',data:{name:'Casa',slug:'casa-test',inviteLink:'https://chat.whatsapp.com/one',capacity:100,members:95,destinations:[{url:'https://chat.whatsapp.com/two',capacity:100,members:10}]}})).data.item;
  const redirect=await call('/g/casa-test');assert.equal(redirect.response.status,302);assert.equal(redirect.response.headers.get('location'),'https://chat.whatsapp.com/two');
  const token=(await call('/api/extension/token',{method:'POST',data:{}})).data.token;
  const imported=await call('/api/import/products',{method:'POST',headers:{authorization:`Bearer ${token}`,origin:'chrome-extension://test'},data:{items:[{title:'Fone Bluetooth',price:100,url:'https://shopee.com.br/test',category:'Casa'}]}});assert.equal(imported.data.count,1);
  for(const browserOrigin of ['moz-extension://12345678-test','safari-web-extension://12345678-test']){
    const preflight=await call('/api/import/products',{method:'OPTIONS',headers:{origin:browserOrigin}});assert.equal(preflight.response.status,204);assert.equal(preflight.response.headers.get('access-control-allow-origin'),browserOrigin);
    const result=await call('/api/import/products',{method:'POST',headers:{origin:browserOrigin,authorization:`Bearer ${token}`},data:{items:[{title:'Fone Bluetooth',price:100,url:'https://shopee.com.br/test',category:'Casa'}]}});assert.equal(result.data.count,1);assert.equal(result.response.headers.get('access-control-allow-origin'),browserOrigin);
  }
  assert.equal((await call('/api/import/products',{method:'POST',headers:{authorization:'Bearer wrong'},data:{items:[]}})).response.status,401);
  const product=(await call('/api/products')).data.items[0];
  const list=(await call('/api/lists',{method:'POST',data:{name:'Ofertas',entries:[{productId:product.id,expiresAt:new Date(Date.now()+86400000).toISOString()}]}})).data.item;
  await call('/api/coupons',{method:'POST',data:{code:'DEZ',marketplace:'shopee',type:'fixed',value:10,productIds:[product.id]}});
  const flow=(await call('/api/automations',{method:'POST',data:{name:'Fluxo',sources:['lists'],listIds:[list.id],groupIds:[group.id],days:[0,1,2,3,4,5,6],intervalMinutes:30,active:true}})).data.item;assert.equal(flow.active,false);
  const preview=(await call(`/api/automations/${flow.id}/preview`)).data;assert.equal(preview.offers.length,1);assert.equal(preview.offers[0].coupon.finalPrice,90);assert.match(preview.offers[0].message,/DEZ/);
  assert.equal((await call(`/api/automations/${flow.id}/run`,{method:'POST',data:{}})).data.total,1);
  await new Promise(resolve=>setTimeout(resolve,2300));
  assert.equal((await call('/api/operations')).data.deliveries[0].status,'simulated');
  await call('/api/automations/'+flow.id+'/toggle',{method:'POST',data:{}});
  assert.equal((await call('/api/automations/'+flow.id,{method:'PUT',data:{name:'Outro'}})).response.status,400);
  await call('/api/automations/'+flow.id+'/toggle',{method:'POST',data:{}});
  assert.equal((await call('/api/export')).data.records.products.length,1);
  cookie='';await call('/api/register',{method:'POST',data:{name:'Outra',email:'outra@example.test',password:'Test-password-1234',passwordConfirmation:'Test-password-1234'}});
  assert.equal((await call('/api/products/'+product.id)).response.status,404);
  assert.equal((await call('/api/lists',{method:'POST',data:{name:'Invasão',entries:[{productId:product.id}]}})).response.status,400);
  assert.equal((await call('/api/products')).data.items.length,0);
  cookie=firstCookie;await call('/api/extension/token',{method:'DELETE'});
  assert.equal((await call('/api/import/products',{method:'POST',headers:{authorization:`Bearer ${token}`},data:{items:[{title:'x',price:1,url:'https://shopee.com.br/x'}]}})).response.status,401);
  for(const path of ['/','/app.js','/auth-ui.js','/auth.css','/operations-ui.js','/operation.css'])assert.equal((await call(path)).response.status,200);
  const html=await call('/');assert.match(html.response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(html.response.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await call('/.env')).response.status,404);
  assert.match((await call('/auth/google/start')).response.headers.get('location'),/google_unavailable/);
  assert.match((await call('/auth/google/callback?state=invalid&code=test')).response.headers.get('location'),/invalid_state/);
  await call('/api/logout',{method:'POST',data:{}});assert.equal((await call('/api/me')).response.status,401);
  assert.equal((await call('/api/login',{method:'POST',data:{email:'teste@example.test',password:'errada'}})).response.status,401);
  const loggedIn=await call('/api/login',{method:'POST',data:{email:'teste@example.test',password:'Test-password-1234'}});assert.equal(loggedIn.response.status,200);assert.equal(loggedIn.data.user.name,'Teste');
  assert.equal(JSON.stringify(loggedIn.data).includes('password_hash'),false);
  assert.equal((await call('/api/login',{method:'POST',data:null})).response.status,400);
});
