import { randomBytes, createHash } from 'node:crypto';
import { backupDatabase } from './storage.js';
import { telegramCall, marketplaceFor, normalizeImportedProduct } from './integrations.js';
import { scheduleSlot } from './schedule.js';
import {searchShopee,shopeeLink,shopeeConversions} from './shopee.js';

const uid=()=>randomBytes(12).toString('hex');
const hash=(value)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();

export function createOperations({db,vault,directory,recordsFor,recordFor,preview,event,telegram=telegramCall}) {
  let busy=false,stopped=false;
  const polling=new Set();
  const readIntegration=(userId,provider)=>{
    const row=db.prepare('SELECT * FROM integrations WHERE user_id=? AND provider=?').get(userId,provider);
    return row?{...JSON.parse(row.data),token:vault.decrypt(row.secret)}:null;
  };
  const saveIntegration=(userId,provider,token,data)=>{const {token:discarded,...metadata}=data;return db.prepare('INSERT INTO integrations VALUES(?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET secret=excluded.secret,data=excluded.data').run(userId,provider,vault.encrypt(token),JSON.stringify(metadata));};
  function saveRecord(userId,kind,value,recordId=uid()) {
    value=structuredClone(value);delete value.id;delete value.createdAt;delete value.updatedAt;
    const existing=recordFor(userId,kind,recordId);
    db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(recordId,userId,kind,JSON.stringify(value),existing?.createdAt||now(),now());
    return recordFor(userId,kind,recordId);
  }
  function status(userId) {
    const telegram=readIntegration(userId,'telegram');
    const linked=db.prepare('SELECT chat_id FROM telegram_links WHERE user_id=?').get(userId);
    const shopee=readIntegration(userId,'shopee');const amazon=readIntegration(userId,'amazon');
    return {amazon:{tag:amazon?.tag||null},shopee:{configured:Boolean(shopee),lastSyncAt:shopee?.lastSyncAt||null,error:shopee?.error||null,report:shopee?.report||null},telegram:{configured:Boolean(telegram),username:telegram?.username||null,linked:Boolean(linked?.chat_id),lastPollAt:telegram?.lastPollAt||null,error:telegram?.error||null},database:{engine:'SQLite',journal:'WAL',backup:JSON.parse(db.prepare("SELECT value FROM runtime_state WHERE key='lastBackup'").get()?.value||'null')},scheduler:{running:!stopped,timezone:'America/Sao_Paulo'},whatsapp:{configured:false,reason:'Integração de grupos grandes depende de um provedor compatível. Nenhum serviço pago foi contratado.'},extension:{tokenCount:db.prepare("SELECT count(*) AS count FROM api_tokens WHERE user_id=? AND expires_at>?").get(userId,now()).count}};
  }
  async function configureShopee(userId,appId,secret){if(!/^\d{3,30}$/.test(appId)||secret.length<8)throw new Error('Informe App ID numérico e chave secreta.');await searchShopee({appId,token:secret},{limit:1});saveIntegration(userId,'shopee',secret,{appId});return {configured:true};}
  async function syncShopee(userId,{keyword='',shopId='',listId='',days=7,reports=false}={}){
    const integration=readIntegration(userId,'shopee');if(!integration)throw new Error('Configure a API Shopee primeiro.');
    if(reports){const report=await shopeeConversions(integration,days);const summary={start:report.start,end:report.end,partial:report.partial,conversions:report.conversions.length,items:report.conversions.reduce((n,c)=>n+(c.orders||[]).reduce((m,o)=>m+(o.items||[]).reduce((k,i)=>k+Number(i.qty||0),0),0),0),commission:report.conversions.reduce((n,c)=>n+Number(c.netCommission||0),0),fetchedAt:now()};integration.report=summary;saveIntegration(userId,'shopee',integration.token,integration);return summary;}
    const result=await searchShopee(integration,{keyword,shopId});
    if(listId&&!recordFor(userId,'lists',listId))throw new Error('Lista não encontrada.');
    for(const product of result.items){const existing=recordsFor(userId,'products').find(item=>item.marketplace==='shopee'&&item.sourceUrl===product.sourceUrl);saveRecord(userId,'products',{...existing,...product},existing?.id);}
    if(listId&&result.items.length)importProducts(userId,result.items.map(product=>({...product,url:product.sourceUrl,affiliateUrl:product.url})),listId);
    integration.lastSyncAt=now();integration.error=null;saveIntegration(userId,'shopee',integration.token,integration);event(userId,'shopee.synced',`${result.items.length} produto(s) atualizados da Shopee`);return {count:result.items.length,hasNextPage:Boolean(result.pageInfo?.hasNextPage)};
  }
  async function generateShopeeLink(userId,url){if(marketplaceFor(url)!=='shopee')throw new Error('Use um link Shopee válido.');const integration=readIntegration(userId,'shopee');if(!integration)throw new Error('Configure a API Shopee.');return {url:await shopeeLink(integration,url)};}
  async function refreshKeywords(userId){
    const integration=readIntegration(userId,'shopee');if(!integration)return;
    const key=`keywords:${userId}`;if(polling.has(key))return;polling.add(key);
    try {for(const keyword of recordsFor(userId,'keywords').filter(item=>item.active!==false)){
      if(keyword.lastSyncedAt&&Date.now()-Date.parse(keyword.lastSyncedAt)<86400000)continue;
      const cursor=Number(keyword.syncCursor||0),batch=(keyword.terms||[]).slice(cursor,cursor+10);
      for(const term of batch)await syncShopee(userId,{keyword:term,shopId:keyword.storeId||''});
      const complete=cursor+batch.length>=keyword.terms.length;
      saveRecord(userId,'keywords',{...keyword,syncCursor:complete?0:cursor+batch.length,lastSyncedAt:complete?now():keyword.lastSyncedAt},keyword.id);
    }}catch(error){integration.error=error.message;saveIntegration(userId,'shopee',integration.token,integration);}finally{polling.delete(key);}
  }
  async function configureTelegram(userId,token) {
    if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error('Token Telegram inválido.');
    const owner=db.prepare("SELECT user_id,secret FROM integrations WHERE provider='telegram'").all().find((row)=>vault.decrypt(row.secret)===token&&row.user_id!==userId);
    if(owner)throw new Error('Este bot já pertence a outra conta local.');
    const bot=await telegram(token,'getMe');
    const webhook=await telegram(token,'getWebhookInfo');
    if(webhook.url)throw new Error('Esse bot já usa um webhook. Crie um bot exclusivo para esta aplicação.');
    saveIntegration(userId,'telegram',token,{username:bot.username,offset:0});
    event(userId,'telegram.connected','Bot Telegram conectado');
    return {username:bot.username};
  }
  function linkTelegram(userId) {
    const integration=readIntegration(userId,'telegram'); if(!integration)throw new Error('Configure o token do bot primeiro.');
    const code=randomBytes(16).toString('hex');
    db.prepare('INSERT INTO telegram_links VALUES(?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at').run(userId,hash(code),new Date(Date.now()+10*60000).toISOString());
    return {url:`https://t.me/${integration.username}?start=${code}`,expiresInMinutes:10};
  }
  async function pollTelegram(userId) {
    if(polling.has(userId))return;
    const integration=readIntegration(userId,'telegram'); if(!integration)return;
    polling.add(userId);
    try {
      const updates=await telegram(integration.token,'getUpdates',{offset:integration.offset||0,timeout:0,limit:30,allowed_updates:['message']});
      for(const update of updates) {
        const message=update.message; if(!message) { integration.offset=update.update_id+1;continue; }
        const text=message.text||message.caption||'';
        const start=text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{32})$/);
        if(start&&message.chat?.type==='private') {
          const result=db.prepare('UPDATE telegram_links SET chat_id=?,code_hash=? WHERE user_id=? AND code_hash=? AND expires_at>?').run(String(message.chat.id),'used',userId,hash(start[1]),now());
          if(result.changes) { await telegram(integration.token,'sendMessage',{chat_id:message.chat.id,text:'Conta vinculada ao OfertaLab. Envie links de vídeos da Shopee para sua caixa de entrada.'});event(userId,'telegram.linked','Telegram vinculado'); }
        }
        const link=db.prepare('SELECT chat_id FROM telegram_links WHERE user_id=?').get(userId);
        if(link?.chat_id===String(message.chat.id)) {
          const urls=(text.match(/https:\/\/[^\s<>]+/g)||[]).filter((value)=>marketplaceFor(value)==='shopee');
          for(const url of new Set(urls)) {
            const sourceKey=`telegram:${message.chat.id}:${message.message_id}:${url}`;
            if(!recordsFor(userId,'videos').some((item)=>item.sourceKey===sourceKey)) {
              const hashtags=(text.match(/#[\p{L}\p{N}_]+/gu)||[]).join(' ');
              saveRecord(userId,'videos',{url,description:text.slice(0,1000),hashtags,groups:[],sourceKey,source:'telegram'});
              event(userId,'video.received','Link Shopee recebido pelo Telegram');
            }
          }
        }
        integration.offset=update.update_id+1;
      }
      integration.lastPollAt=now(); integration.error=null;
    }catch(error){integration.error=error.message;}
    finally { if(readIntegration(userId,'telegram')?.token===integration.token)saveIntegration(userId,'telegram',integration.token,integration);polling.delete(userId); }
  }
  function createRun(userId,automationId,slot=`manual:${uid()}`) {
    const automation=recordFor(userId,'automations',automationId); if(!automation)throw new Error('Automação não encontrada.');
    if(automation.executionMode==='telegram'&&!readIntegration(userId,'telegram'))throw new Error('Configure o bot Telegram antes do envio real.');
    const runId=uid();
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert=db.prepare('INSERT OR IGNORE INTO automation_runs VALUES(?,?,?,?,?,?)').run(runId,userId,automationId,slot,'queued',now());
      if(!insert.changes){db.exec('ROLLBACK');return {duplicate:true};}
      const cycle=db.prepare('SELECT count(*) AS count FROM automation_runs WHERE automation_id=?').get(automationId).count-1;
      const result=preview(userId,automationId,cycle,true);
      let delay=0,total=0;
      for(const group of result.groups) {
        let groupMessages=0;const selectedCounts={product:0,video:0};
        const contents=[...result.offers.map((offer)=>({id:`product:${hash(offer.product.sourceUrl||offer.product.url||offer.product.id)}`,text:offer.message,hours:automation.dedupeHours||24})),...result.videos.map((video)=>({id:`video:${hash(video.url||video.id)}`,text:`${video.description||'Vídeo Shopee'}\n${video.url}`,hours:automation.videoDedupeHours||24}))];
        for(const content of contents) {
          const kind=content.id.split(':')[0];const limit=kind==='product'?Math.max(1,Math.min(20,Number(automation.productsPerCycle)||3)):Math.max(1,Math.min(20,Number(automation.videosPerCycle)||1));
          if(selectedCounts[kind]>=limit)continue;
          const since=new Date(Date.now()-Number(content.hours)*3600000).toISOString();
          const channel=automation.executionMode==='telegram'?'telegram':'simulation';
          const duplicate=db.prepare("SELECT id FROM deliveries WHERE user_id=? AND automation_id=? AND destination_id=? AND content_id=? AND channel=? AND (status IN ('queued','sending','uncertain') OR (status IN ('sent','simulated') AND delivered_at>?)) LIMIT 1").get(userId,automationId,group.id,content.id,channel,since);
          if(duplicate)continue;
          if(groupMessages)delay+=Math.max(30,Number(automation.messageDelaySeconds)||60)*1000;
          const destination=channel==='telegram'?group.telegramChatId:null;
          if(channel==='telegram'&&!/^-?\d{5,20}$/.test(String(destination||'')))throw new Error(`Grupo ${group.name} precisa de um Chat ID Telegram válido.`);
          db.prepare('INSERT INTO deliveries(id,user_id,automation_id,run_id,destination_id,content_id,channel,payload,status,available_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),userId,automationId,runId,group.id,content.id,channel,JSON.stringify({text:content.text,chatId:destination,manual:slot.startsWith('manual:')}), 'queued',new Date(Date.now()+delay).toISOString());
          total++;groupMessages++;selectedCounts[kind]++;
        }
        if(groupMessages)delay+=Math.max(0,Number(automation.groupDelaySeconds)||0)*1000;
      }
      db.prepare('UPDATE automation_runs SET status=? WHERE id=?').run(total?'queued':'empty',runId);
      db.exec('COMMIT');
      event(userId,'automation.run',`Execução criada: ${total} mensagem(ns) ${automation.executionMode==='telegram'?'para Telegram':'em simulação'}`,{runId});
      return {id:runId,total};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  async function processDelivery() {
    const job=db.prepare("SELECT * FROM deliveries WHERE status='queued' AND available_at<=? ORDER BY available_at LIMIT 1").get(now());if(!job)return;
    const automation=recordFor(job.user_id,'automations',job.automation_id);
    if(!automation){db.prepare("UPDATE deliveries SET status='cancelled' WHERE id=?").run(job.id);return;}
    const payload=JSON.parse(job.payload);
    if(!payload.manual&&!scheduleSlot(automation)){db.prepare("UPDATE deliveries SET status='cancelled',error='Fora da janela da agenda ou automação pausada.' WHERE id=?").run(job.id);return;}
    if(!recordFor(job.user_id,'groups',job.destination_id)){db.prepare("UPDATE deliveries SET status='cancelled',error='Destino removido.' WHERE id=?").run(job.id);return;}
    db.prepare("UPDATE deliveries SET status='sending',attempts=attempts+1 WHERE id=? AND status='queued'").run(job.id);
    try {
      if(job.channel==='telegram') {
        const integration=readIntegration(job.user_id,'telegram'); if(!integration)throw Object.assign(new Error('Bot desconectado.'),{retryable:false});
        await telegram(integration.token,'sendMessage',{chat_id:payload.chatId,text:payload.text.slice(0,4096),link_preview_options:{is_disabled:false},allow_paid_broadcast:false});
      }
      db.prepare('UPDATE deliveries SET status=?,delivered_at=?,error=NULL WHERE id=?').run(job.channel==='simulation'?'simulated':'sent',now(),job.id);
    }catch(error){
      const retry=error.retryable&&job.attempts<4;
      // Erros de rede podem acontecer após aceitação: não reenviar sem confirmação.
      const uncertain=error.message.includes('indisponível');
      db.prepare('UPDATE deliveries SET status=?,error=?,available_at=? WHERE id=?').run(uncertain?'uncertain':retry?'queued':'failed',error.message,new Date(Date.now()+Math.max(error.retryAfter||0,2**(job.attempts+1)*30)*1000).toISOString(),job.id);
    }
    db.prepare("UPDATE automation_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM deliveries WHERE run_id=? AND status IN ('failed','uncertain')) THEN 'attention' ELSE 'completed' END WHERE id=? AND NOT EXISTS(SELECT 1 FROM deliveries WHERE run_id=? AND status IN ('queued','sending'))").run(job.run_id,job.run_id,job.run_id);
  }
  async function tick() {
    if(busy||stopped)return;busy=true;
    try {
      for(const row of db.prepare("SELECT id,user_id,data FROM records WHERE kind='automations'").all()) {
        const automation=JSON.parse(row.data); const slot=scheduleSlot(automation);
        if(slot)try{createRun(row.user_id,row.id,slot);}catch(error){event(row.user_id,'automation.error',error.message);saveRecord(row.user_id,'automations',{...automation,active:false},row.id);}
      }
      await processDelivery();
      db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now());db.prepare('DELETE FROM api_tokens WHERE expires_at<?').run(now());
    } finally {busy=false;}
  }
  async function makeBackup(){const result=await backupDatabase(db,directory);db.prepare("INSERT INTO runtime_state VALUES('lastBackup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(result));return result;}
  function mintToken(userId) {
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO api_tokens VALUES(?,?,?,?,?)').run(hash(token),userId,'import',now(),new Date(Date.now()+30*86400000).toISOString());
    return {token,expiresInDays:30};
  }
  function tokenUser(token) {return db.prepare("SELECT user_id FROM api_tokens WHERE hash=? AND scope='import' AND expires_at>?").get(hash(token),now())?.user_id;}
  function importProducts(userId,items,listId) {
    if(!Array.isArray(items)||!items.length||items.length>100)throw new Error('Importe de 1 a 100 produtos por lote.');
    const list=listId?recordFor(userId,'lists',listId):null; if(listId&&!list)throw new Error('Lista não encontrada.');
    const normalized=items.map(normalizeImportedProduct).map(product=>{const amazon=readIntegration(userId,'amazon');if(product.marketplace==='amazon'&&amazon?.tag&&!product.affiliateVerified&&new URL(product.url).hostname.endsWith('amazon.com.br')){const url=new URL(product.url);url.searchParams.set('tag',amazon.tag);product.url=url.href;product.affiliateTagConfigured=true;}return product;});
    db.exec('BEGIN IMMEDIATE');
    try {
      const saved=normalized.map((product)=>{
        const existing=recordsFor(userId,'products').find((item)=>(item.sourceUrl||item.url)===product.sourceUrl);
        return saveRecord(userId,'products',{...existing,...product},existing?.id);
      });
      if(list){const entries=new Map((list.entries||[]).map((entry)=>[entry.productId,entry]));for(const product of saved)entries.set(product.id,{productId:product.id,addedAt:now(),expiresAt:new Date(Date.now()+48*3600000).toISOString()});saveRecord(userId,'lists',{...list,entries:[...entries.values()]},list.id);}
      db.exec('COMMIT');event(userId,'products.imported',`${saved.length} produto(s) importado(s)`);return {count:saved.length};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  const timers=[];
  function start(){timers.push(setInterval(()=>tick().catch(()=>{}),2000));timers.push(setInterval(()=>{for(const row of db.prepare("SELECT user_id FROM integrations WHERE provider='telegram'").all())pollTelegram(row.user_id).catch(()=>{});},5000));timers.push(setInterval(()=>{for(const row of db.prepare("SELECT user_id FROM integrations WHERE provider='shopee'").all())refreshKeywords(row.user_id).catch(()=>{});},60000));timers.push(setInterval(()=>makeBackup().catch(()=>{}),24*3600000));for(const timer of timers)timer.unref();}
  function stop(){stopped=true;for(const timer of timers)clearInterval(timer);}
  return {status,configureShopee,syncShopee,generateShopeeLink,refreshKeywords,configureTelegram,linkTelegram,pollTelegram,createRun,tick,makeBackup,mintToken,tokenUser,importProducts,saveRecord,start,stop,disconnectTelegram(userId){db.prepare("DELETE FROM integrations WHERE user_id=? AND provider='telegram'").run(userId);db.prepare('DELETE FROM telegram_links WHERE user_id=?').run(userId);},history(userId){return {runs:db.prepare('SELECT * FROM automation_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(userId),deliveries:db.prepare('SELECT id,automation_id,destination_id,channel,status,attempts,available_at,delivered_at,error FROM deliveries WHERE user_id=? ORDER BY available_at DESC LIMIT 100').all(userId)};}};
}
