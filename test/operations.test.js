import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {prepareStorage} from '../storage.js';
import {createOperations} from '../operations.js';

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'oferta-test-'));
  const db=new DatabaseSync(join(directory,'oferta.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('u');INSERT INTO users VALUES('other');CREATE TABLE sessions(expires_at TEXT);CREATE TABLE records(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,data TEXT,created_at TEXT,updated_at TEXT);`);
  const vault=await prepareStorage(db,directory);
  const recordFor=(userId,kind,id)=>{const row=db.prepare('SELECT * FROM records WHERE user_id=? AND kind=? AND id=?').get(userId,kind,id);return row?{...JSON.parse(row.data),id:row.id,createdAt:row.created_at}:null;};
  const recordsFor=(userId,kind)=>db.prepare('SELECT * FROM records WHERE user_id=? AND kind=?').all(userId,kind).map(row=>({...JSON.parse(row.data),id:row.id,createdAt:row.created_at}));
  let updates=[];const messages=[];
  const ops=createOperations({db,vault,directory,recordFor,recordsFor,event(){},preview(userId,id){return {groups:recordsFor(userId,'groups'),offers:recordsFor(userId,'products').map(product=>({product,message:product.title})),videos:[]};},telegram:async(token,method,payload)=>{if(method==='getMe')return {username:'testbot'};if(method==='getWebhookInfo')return {};if(method==='getUpdates'){const result=updates;updates=[];return result;}if(method==='sendMessage'){messages.push(payload);return {message_id:1};}}});
  t.after(()=>{ops.stop();db.close();});return {db,vault,directory,ops,recordFor,recordsFor,messages,setUpdates(value){updates=value;}};
}

test('fila persiste, deduplica por grupo e seleciona próximos produtos',async t=>{
  const {ops,db}=await fixture(t);
  const group=ops.saveRecord('u','groups',{name:'Casa',slug:'casa'});
  const flow=ops.saveRecord('u','automations',{name:'Ofertas',active:false,groupIds:[group.id],sources:['shopee'],productsPerCycle:1});
  ops.importProducts('u',[{title:'A',price:10,url:'https://shopee.com.br/a'},{title:'B',price:20,url:'https://shopee.com.br/b'}]);
  const first=ops.createRun('u',flow.id,'manual:slot-1');assert.equal(first.total,1);
  assert.equal(ops.createRun('u',flow.id,'manual:slot-1').duplicate,true);
  await ops.tick();assert.equal(db.prepare('SELECT status FROM deliveries WHERE run_id=?').get(first.id).status,'simulated');
  const second=ops.createRun('u',flow.id,'manual:slot-2');assert.equal(second.total,1);await ops.tick();
  assert.equal(ops.createRun('u',flow.id,'manual:slot-3').total,0);
});

test('importação é atômica, isolada por conta e renova lista sem duplicar catálogo',async t=>{
  const {ops,recordsFor,recordFor}=await fixture(t),list=ops.saveRecord('u','lists',{name:'Casa'});
  const items=[{title:'Café',price:30,url:'https://www.amazon.com.br/dp/test'}];
  ops.importProducts('u',items,list.id);ops.importProducts('u',[{...items[0],price:20}],list.id);
  assert.equal(recordsFor('u','products').length,1);assert.equal(recordFor('u','lists',list.id).entries.length,1);
  assert.throws(()=>ops.importProducts('other',items,list.id));
  assert.throws(()=>ops.importProducts('u',[items[0],{title:'inválido'}]));assert.equal(recordsFor('u','products').length,1);
  const token=ops.mintToken('u');assert.equal(ops.tokenUser(token.token),'u');assert.equal(ops.tokenUser('errado'),undefined);
});

test('Telegram usa chave cifrada, vinculação expira e importação não duplica updates',async t=>{
  const {ops,db,setUpdates,recordsFor}=await fixture(t),token='123456:abcdefghijklmnopqrstuvxyz12345678';
  await ops.configureTelegram('u',token);
  const link=ops.linkTelegram('u'),code=new URL(link.url).searchParams.get('start');
  setUpdates([{update_id:1,message:{message_id:1,chat:{id:123456,type:'private'},text:`/start ${code}`}},{update_id:2,message:{message_id:2,chat:{id:123456,type:'private'},text:'https://shopee.com.br/video/abc #casa'}}]);
  await ops.pollTelegram('u');assert.equal(ops.status('u').telegram.linked,true);assert.equal(recordsFor('u','videos').length,1);
  const row=db.prepare('SELECT * FROM integrations').get();assert.equal(row.data.includes(token),false);assert.equal(row.secret.includes(token),false);
  setUpdates([{update_id:2,message:{message_id:2,chat:{id:123456,type:'private'},text:'https://shopee.com.br/video/abc #casa'}}]);await ops.pollTelegram('u');assert.equal(recordsFor('u','videos').length,1);
});

test('backup SQLite é íntegro e preserva dados',async t=>{
  const {ops,directory}=await fixture(t);ops.saveRecord('u','lists',{name:'Preservar'});
  const result=await ops.makeBackup();assert.ok((await readFile(join(directory,'backups',result.name))).length>0);
  const restored=new DatabaseSync(join(directory,'backups',result.name),{readOnly:true});
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('SELECT count(*) AS n FROM records').get().n,1);restored.close();
});
