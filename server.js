import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { keywordValidationError } from './keyword-rules.js';
import { estimateDurationMinutes, orderProducts, productEligibleForAutomation, productMatchesSelection, renderOfferMessage } from './preview-rules.js';
import { videosForCycle } from './video-rules.js';
import { prepareStorage } from './storage.js';
import { createOperations } from './operations.js';
import { contentAvailable, listHasProduct } from './schedule.js';
import { createAuthentication, googleConfiguration, registrationError, passwordHash, passwordValid, AuthFlowError } from './auth.js';

const ROOT = resolve(import.meta.dirname);
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.OFERTA_DATA_DIR || join(ROOT, 'data');
await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'oferta.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS records_user_kind ON records(user_id, kind, updated_at DESC);
  CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, message TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS events_user_created ON events(user_id, created_at DESC);
`);
const vault=await prepareStorage(db,DATA_DIR);
const authConfig=googleConfiguration();
const authentication=createAuthentication({db,vault,config:authConfig});

const ALLOWED_KINDS = new Set(['whatsapp', 'groups', 'keywords', 'products', 'coupons', 'automations', 'videos', 'lists','videoGroups']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8' };
const now = () => new Date().toISOString();
const id = () => randomBytes(12).toString('hex');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const extensionOrigin=value=>/^(?:chrome|moz|safari-web)-extension:\/\/[a-zA-Z0-9-]+$/.test(String(value||''));
function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options':'nosniff', ...extra });
  res.end(JSON.stringify(body));
}
function cookie(req, name) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  try{return item ? decodeURIComponent(item.slice(name.length + 1)) : null;}catch{return null;}
}
function userFor(req) {
  const token = cookie(req, 'oferta_session');
  if (!token) return null;
  return db.prepare(`SELECT users.id, users.name, users.email, users.phone FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(sha(token), now()) || null;
}
function login(req,res,user) {
  const result=authentication.session(user,cookie(req,'oferta_session'));
  json(res,200,{user:result.user},{'set-cookie':result.cookie});
}
function redirect(res,location,cookies=[]){res.writeHead(302,{location,'cache-control':'no-store',...(cookies.length?{'set-cookie':cookies}:{})});res.end();}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error('Corpo grande demais'), { status: 413 });
    chunks.push(chunk);
  }
  try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Objeto esperado');return value; }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
function recordFor(userId, kind, recordId) {
  const row = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ? AND kind = ?').get(recordId, userId, kind);
  return row ? { id: row.id, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
function recordsFor(userId, kind) {
  return db.prepare('SELECT * FROM records WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC').all(userId, kind)
    .map((row) => ({ id: row.id, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at }));
}
function event(userId, type, message, data = {}) {
  db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(id(), userId, type, message, JSON.stringify(data), now());
}
function validate(kind, value) {
  const required = { whatsapp: ['name', 'phone'], groups: ['name', 'slug'], keywords: ['name', 'terms'], products: ['title', 'marketplace', 'price'], coupons: ['code', 'type', 'value'], automations: ['name', 'sources', 'groupIds'], videos: ['url'], lists: ['name'],videoGroups:['name','hashtags'] }[kind];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados inválidos');
  for (const key of required) if (value[key] === undefined || value[key] === null || value[key] === '' || (Array.isArray(value[key]) && !value[key].length)) throw new Error(`Campo obrigatório: ${key}`);
  if (kind === 'groups' && !/^[a-z0-9-]{3,80}$/.test(value.slug)) throw new Error('O identificador deve ter 3 a 80 caracteres: letras minúsculas, números ou hífen.');
  if (kind === 'keywords') {
    const issue = keywordValidationError(value);
    if (issue) throw new Error(issue);
  }
  if (kind === 'products' && (!Number.isFinite(Number(value.price))||!(Number(value.price) > 0))) throw new Error('Preço deve ser maior que zero.');
  if(kind==='videoGroups'&&(!Array.isArray(value.hashtags)||value.hashtags.length>10||value.hashtags.some(tag=>typeof tag!=='string'||!/^#?[\p{L}\p{N}_]{1,80}$/u.test(tag))))throw new Error('Informe de 1 a 10 hashtags válidas.');
  if (kind === 'coupons' && (!(Number(value.value) > 0) || !['percent', 'fixed'].includes(value.type))) throw new Error('Cupom inválido.');
  if (kind === 'automations' && (!Array.isArray(value.sources) || !Array.isArray(value.groupIds))) throw new Error('Selecione fontes e grupos.');
  if (kind==='automations') {
    if(value.sources.some(source=>!['shopee','amazon','mercadolivre','lists'].includes(source)))throw new Error('Fonte inválida.');
    if(!['simulation','telegram',undefined].includes(value.executionMode))throw new Error('Modo de execução inválido.');
    if(!Number.isFinite(Number(value.intervalMinutes))||Number(value.intervalMinutes)<1)throw new Error('Intervalo mínimo: um minuto.');
    if(!Array.isArray(value.days)||!value.days.length||value.days.some((day)=>!Number.isInteger(Number(day))||Number(day)<0||Number(day)>6))throw new Error('Selecione dias válidos.');
    try {new Intl.DateTimeFormat('pt-BR',{timeZone:value.timezone||'America/Sao_Paulo'});}catch{throw new Error('Fuso horário inválido.');}
    if(value.productsPerCycle!=null&&(!Number.isFinite(Number(value.productsPerCycle))||Number(value.productsPerCycle)<1||Number(value.productsPerCycle)>20))throw new Error('Selecione entre 1 e 20 produtos por ciclo.');
    if(value.messageDelaySeconds!=null&&Number(value.messageDelaySeconds)<30)throw new Error('Use ao menos 30 segundos entre mensagens.');
    for(const key of ['messageDelaySeconds','groupDelaySeconds','dedupeHours','videoDedupeHours','videoCycleInterval'])if(value[key]!=null&&(!Number.isFinite(Number(value[key]))||Number(value[key])<0))throw new Error(`Valor inválido: ${key}`);
    for(const schedule of Object.values(value.daySchedules||{})){if(!schedule||typeof schedule!=='object'||typeof schedule.allDay!=='boolean')throw new Error('Agenda diária inválida.');if(!schedule.allDay&&(!/^\d{2}:\d{2}$/.test(schedule.startsAt)||!/^\d{2}:\d{2}$/.test(schedule.endsAt)||schedule.startsAt>=schedule.endsAt||schedule.endsAt>'23:59'))throw new Error('Confira a faixa de horário diária.');}
  }
  for(const key of ['url','inviteLink','imageUrl'])if(value[key]){let url;try{url=new URL(value[key]);}catch{throw new Error(`URL inválida: ${key}`);}if(url.protocol!=='https:')throw new Error(`Use HTTPS: ${key}`);}
  const output = structuredClone(value);
  delete output.id;
  delete output.createdAt;
  delete output.updatedAt;
  if (kind === 'whatsapp') output.status = 'not_connected';
  return output;
}
function couponPrice(product, coupons, date = new Date()) {
  const price = Number(product.price);
  const candidate = coupons.filter((coupon) => {
    if (coupon.marketplace && coupon.marketplace !== product.marketplace) return false;
    if (coupon.expiresAt && new Date(coupon.expiresAt.length===10?`${coupon.expiresAt}T23:59:59.999-03:00`:coupon.expiresAt) < date) return false;
    if(coupon.active===false)return false;
    if (price < Number(coupon.minimum || 0)) return false;
    if (coupon.category && coupon.category !== product.category) return false;
    if (coupon.productIds?.length && !coupon.productIds.includes(product.id)) return false;
    return true;
  }).map((coupon) => {
    const raw = coupon.type === 'percent' ? price * Number(coupon.value) / 100 : Number(coupon.value);
    const discount = Math.min(price, raw, Number(coupon.maximum || price));
    return { code: coupon.code, discount, finalPrice: Math.max(0, price - discount) };
  }).sort((a, b) => b.discount - a.discount)[0];
  return candidate || { code: null, discount: 0, finalPrice: price };
}
function preview(userId, automationId, cycleIndex=0, allCandidates=false) {
  const automation = recordFor(userId, 'automations', automationId);
  if (!automation) return null;
  const groups = recordsFor(userId, 'groups').filter((item) => automation.groupIds.includes(item.id));
  const keywords = recordsFor(userId, 'keywords');
  const lists=recordsFor(userId,'lists').filter((list)=>(automation.listIds||[]).includes(list.id));
  const products = orderProducts(recordsFor(userId, 'products').filter((item) => contentAvailable(item)&&(productEligibleForAutomation({...automation,sources:[item.marketplace]},item)&&((automation.sources.includes(item.marketplace)&&productMatchesSelection(automation,item,keywords))||(automation.sources.includes('lists')&&lists.some((list)=>listHasProduct(list,item)))))), automation.sortBy);
  const coupons = recordsFor(userId, 'coupons');
  const limit = Math.max(1, Math.min(20, Number(automation.productsPerCycle || 3)));
  const offers = products.slice(0, allCandidates?5000:limit).map((product) => {
    const coupon = couponPrice(product, coupons);
    const message = renderOfferMessage(automation.messageTemplate, product, coupon.finalPrice)+(coupon.code?`\nCupom: ${coupon.code}`:'');
    return { product, coupon, message };
  });
  const videos = videosForCycle(automation, recordsFor(userId, 'videos'),cycleIndex,new Date(),recordsFor(userId,'videoGroups'),allCandidates);
  const estimatedMessages = groups.length * (offers.length + videos.length);
  const earliestMinutes = estimateDurationMinutes(groups.length, offers.length + videos.length, automation.messageDelaySeconds, automation.groupDelaySeconds);
  return { automation, groups, offers, videos, estimatedMessages, earliestMinutes, notes: ['Simulação local: nenhum WhatsApp ou marketplace foi acessado.', 'Vídeos cadastrados há menos de 60 minutos ficam fora da prévia, conforme o tutorial.', 'Filtros, seleção de conteúdo e ordenação foram aplicados ao catálogo local.', 'O tempo considera os delays configurados; o envio real requer integração.'] };
}
const operations=createOperations({db,vault,directory:DATA_DIR,recordsFor,recordFor,preview,event});
await operations.makeBackup();

const authAttempts=new Map();
function limited(key,limit=30){const at=Date.now();let entry=authAttempts.get(key);if(!entry||entry.until<at){entry={count:0,until:at+60000};authAttempts.set(key,entry);}if(authAttempts.size>10000)for(const [k,v]of authAttempts)if(v.until<at)authAttempts.delete(k);return ++entry.count>limit;}
function validateOwnership(userId,kind,value){
  if(kind==='automations'){
    for(const [field,target]of [['groupIds','groups'],['keywordIds','keywords'],['listIds','lists']])for(const recordId of value[field]||[])if(!recordFor(userId,target,recordId))throw new Error(`Registro indisponível em ${field}.`);
  }
  if(kind==='lists')for(const entry of value.entries||[]){if(!recordFor(userId,'products',entry.productId))throw new Error('Produto da lista não encontrado.');if(entry.expiresAt&&!Number.isFinite(Date.parse(entry.expiresAt)))throw new Error('Validade inválida na lista.');}
  if(kind==='coupons')for(const productId of value.productIds||[])if(!recordFor(userId,'products',productId))throw new Error('Produto do cupom não encontrado.');
  if(kind==='groups'&&recordsFor(userId,'groups').some((group)=>group.slug===value.slug&&group.id!==value.id))throw new Error('Identificador já utilizado por outro grupo.');
  if(kind==='groups'){
    const taken=db.prepare("SELECT id FROM records WHERE kind='groups' AND json_extract(data,'$.slug')=? AND id!=?").get(value.slug,value.id||'');if(taken)throw new Error('Este identificador de Link Inteligente já está em uso.');
    if(value.destinations&&!Array.isArray(value.destinations))throw new Error('Destinos inválidos.');
    for(const destination of value.destinations||[]){let url;try{url=new URL(destination.url);}catch{throw new Error('Convite adicional inválido.');}if(url.protocol!=='https:'||!['chat.whatsapp.com','t.me'].includes(url.hostname))throw new Error('Use um convite HTTPS do WhatsApp ou Telegram.');if(Number(destination.capacity)<=0||Number(destination.members)<0)throw new Error('Capacidade e membros inválidos.');}
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const allowedHosts=new Set(['localhost','127.0.0.1','[::1]',new URL(authConfig.origin).hostname]);
  if(!allowedHosts.has(url.hostname))return json(res,403,{error:'Host não permitido.'});
  if(authConfig.enabled&&req.headers.host!==new URL(authConfig.origin).host&&req.method==='GET'&&['/','/auth/google/start'].includes(path))return redirect(res,`${authConfig.origin}${path}${path==='/auth/google/start'?url.search:''}`);
  if(req.headers.origin && ![url.origin,authConfig.origin].includes(req.headers.origin) && !(path==='/api/import/products'&&extensionOrigin(req.headers.origin)))return json(res,403,{error:'Origem não permitida.'});
  if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,database:db.prepare('PRAGMA quick_check').get().quick_check==='ok'});
  if(path.startsWith('/g/')&&req.method==='GET'){
    const slug=path.slice(3);const row=db.prepare("SELECT id,user_id,data FROM records WHERE kind='groups' AND json_extract(data,'$.slug')=? ORDER BY created_at LIMIT 1").get(slug);
    if(!row)return json(res,404,{error:'Link não encontrado.'});
    const group=JSON.parse(row.data);const destinations=[{url:group.inviteLink,capacity:group.capacity,members:group.members},...(group.destinations||[])].filter((item)=>item.url&&(!item.capacity||Number(item.members||0)<Number(item.capacity)*0.9));
    const destination=destinations[0];if(!destination)return json(res,409,{error:'Nenhum grupo com vagas. O administrador precisa adicionar um destino.'});
    let target;try{target=new URL(destination.url);}catch{return json(res,400,{error:'Destino inválido.'});}
    if(target.protocol!=='https:'||!['chat.whatsapp.com','t.me'].includes(target.hostname))return json(res,400,{error:'Convite inválido.'});
    if(!limited(`click:${req.socket.remoteAddress}:${row.id}`,60))db.prepare('INSERT INTO smart_clicks(user_id,group_id,created_at) VALUES(?,?,?)').run(row.user_id,row.id,now());
    res.writeHead(302,{location:target.href,'cache-control':'no-store','referrer-policy':'no-referrer'});return res.end();
  }
  if(path==='/api/import/products'){
    if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':req.headers.origin||'null','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS','access-control-allow-private-network':'true','vary':'Origin'});return res.end();}
    const userId=operations.tokenUser((req.headers.authorization||'').replace(/^Bearer /,''));
    const cors=extensionOrigin(req.headers.origin)?{'access-control-allow-origin':req.headers.origin,'vary':'Origin'}:{};
    if(!userId)return json(res,401,{error:'Chave de importação inválida ou expirada.'},cors);
    if(req.method!=='POST')return json(res,405,{error:'Use POST.'},cors);
    try{const data=await body(req);return json(res,200,operations.importProducts(userId,data.items,data.listId),cors);}catch(error){return json(res,400,{error:error.message},cors);}
  }
  if(['/api/register','/api/login','/auth/google/start','/auth/google/callback'].includes(path)&&limited(`auth:${req.socket.remoteAddress}`))return json(res,429,{error:'Muitas tentativas. Aguarde um minuto.'});
  if(path==='/api/auth/providers'&&req.method==='GET')return json(res,200,authentication.providers());
  if(path==='/api/auth/session'&&req.method==='GET')return json(res,200,{user:userFor(req)});
  if(path==='/auth/google/start'&&req.method==='GET'){
    try{const intent=url.searchParams.get('intent')||'login';if(!['login','register'].includes(intent))throw new AuthFlowError('invalid_request');const result=await authentication.begin(intent);return redirect(res,result.url,[result.cookie]);}
    catch(error){return redirect(res,`/?auth_error=${error instanceof AuthFlowError?error.code:'google_failed'}`);}
  }
  if(path==='/auth/google/callback'&&req.method==='GET'){
    const clear=authentication.cookie('oferta_oauth','',0);
    try{
      const result=await authentication.complete({state:url.searchParams.get('state'),browser:cookie(req,'oferta_oauth'),code:url.searchParams.get('code'),error:url.searchParams.get('error'),currentUserId:userFor(req)?.id});
      const session=authentication.session(result.user,cookie(req,'oferta_session'));
      event(result.user.id,result.linked?'auth.google.linked':'auth.google.login',result.linked?'Google vinculado à conta':'Acesso com Google');
      return redirect(res,result.linked?'/?auth_linked=google':'/',[session.cookie,clear]);
    }catch(error){return redirect(res,`/?auth_error=${error instanceof AuthFlowError?error.code:'google_failed'}`,[clear]);}
  }
  if (path === '/api/register' && req.method === 'POST') {
    const data = await body(req);
    const email = String(data.email || '').trim().toLowerCase();
    const issue=registrationError(data);if(issue)return json(res,400,{error:issue});
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return json(res, 409, { error: 'E-mail já cadastrado.' });
    const user = { id: id(), name: String(data.name).trim(), email, phone: String(data.phone || '').trim() };
    const hashed=await passwordHash(data.password);
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return json(res,409,{error:'E-mail já cadastrado.'});
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(user.id, user.name, user.email, user.phone, hashed, now());
    event(user.id, 'account.created', 'Conta criada');
    return login(req,res,user);
  }
  if (path === '/api/login' && req.method === 'POST') {
    const data = await body(req);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(data.email || '').trim().toLowerCase());
    const valid=await passwordValid(data.password,user?.password_hash);
    if (!user || !valid) return json(res, 401, { error: 'Credenciais inválidas.' });
    return login(req,res,user);
  }
  if (path === '/api/logout' && req.method === 'POST') {
    const token = cookie(req, 'oferta_session');
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    return json(res, 200, { ok: true }, { 'set-cookie': authentication.cookie('oferta_session','',0) });
  }
  if (path.startsWith('/api/')) {
    const user = userFor(req);
    if (!user) return json(res, 401, { error: 'Faça login para continuar.' });
    if (path === '/api/me' && req.method === 'GET') return json(res, 200, { user });
    if(path==='/api/auth/status'&&req.method==='GET')return json(res,200,{google:{enabled:authConfig.enabled,linked:authentication.linked(user.id)}});
    if(path==='/api/auth/google/link'&&req.method==='POST'){try{const result=await authentication.begin('link',user.id);return json(res,200,{url:result.url},{'set-cookie':result.cookie});}catch(error){return json(res,400,{error:'O acesso com Google está indisponível no momento.'});}}
    if(path==='/api/operations'&&req.method==='GET')return json(res,200,{...operations.status(user.id),...operations.history(user.id)});
    if(path==='/api/integrations/shopee'&&req.method==='POST'){try{const data=await body(req);return json(res,200,await operations.configureShopee(user.id,String(data.appId||''),String(data.secret||'')));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/integrations/shopee/sync'&&req.method==='POST'){try{return json(res,200,await operations.syncShopee(user.id,await body(req)));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/integrations/shopee/link'&&req.method==='POST'){try{const data=await body(req);return json(res,200,await operations.generateShopeeLink(user.id,data.url));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/integrations/amazon'&&req.method==='POST'){const data=await body(req),tag=String(data.tag||'').trim();if(!/^[a-zA-Z0-9-]{3,80}$/.test(tag))return json(res,400,{error:'Tag inválida.'});db.prepare('INSERT INTO integrations VALUES(?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET secret=excluded.secret,data=excluded.data').run(user.id,'amazon',vault.encrypt('no-api-secret'),JSON.stringify({tag}));return json(res,200,{ok:true});}
    if(path==='/api/integrations/telegram'&&req.method==='POST'){try{const data=await body(req);return json(res,200,await operations.configureTelegram(user.id,String(data.token||'')));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/integrations/telegram'&&req.method==='DELETE'){operations.disconnectTelegram(user.id);return json(res,200,{ok:true});}
    if(path==='/api/integrations/telegram/link'&&req.method==='POST'){try{return json(res,200,operations.linkTelegram(user.id));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/extension/token'&&req.method==='POST')return json(res,201,operations.mintToken(user.id));
    if(path==='/api/extension/token'&&req.method==='DELETE'){db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(user.id);return json(res,200,{ok:true});}
    const extensionDownload=path.match(/^\/api\/extension\/download\/(chromium|firefox|safari)$/);
    if(extensionDownload&&req.method==='GET'){let content;try{content=await readFile(join(ROOT,'extension-builds',`ofertalab-${extensionDownload[1]}.zip`));}catch{return json(res,404,{error:'Gere os pacotes com npm run extension:build.'});}res.writeHead(200,{'content-type':'application/zip','content-disposition':`attachment; filename="ofertalab-${extensionDownload[1]}.zip"`,'cache-control':'no-store'});return res.end(content);}
    if(path==='/api/export'&&req.method==='GET')return json(res,200,{version:1,exportedAt:now(),records:Object.fromEntries([...ALLOWED_KINDS].map((kind)=>[kind,recordsFor(user.id,kind)]))},{'content-disposition':'attachment; filename="ofertalab-export.json"'});
    if(path==='/api/import'&&req.method==='POST'){try{const data=await body(req);return json(res,200,operations.importProducts(user.id,data.items,data.listId));}catch(error){return json(res,400,{error:error.message});}}
    if(path==='/api/metrics'&&req.method==='GET')return json(res,200,{clicks:db.prepare('SELECT group_id,count(*) AS clicks FROM smart_clicks WHERE user_id=? GROUP BY group_id').all(user.id),messages:db.prepare('SELECT status,channel,count(*) AS count FROM deliveries WHERE user_id=? GROUP BY status,channel').all(user.id)});
    const runMatch=path.match(/^\/api\/automations\/([a-f0-9]+)\/run$/);
    if(runMatch&&req.method==='POST'){try{return json(res,201,operations.createRun(user.id,runMatch[1]));}catch(error){return json(res,400,{error:error.message});}}
    const stopMatch=path.match(/^\/api\/automations\/([a-f0-9]+)\/stop$/);
    if(stopMatch&&req.method==='POST'){const existing=recordFor(user.id,'automations',stopMatch[1]);if(!existing)return json(res,404,{error:'Automação não encontrada.'});operations.saveRecord(user.id,'automations',{...existing,active:false},existing.id);db.prepare("UPDATE deliveries SET status='cancelled' WHERE automation_id=? AND user_id=? AND status='queued'").run(existing.id,user.id);return json(res,200,{ok:true});}
    const toggleMatch=path.match(/^\/api\/automations\/([a-f0-9]+)\/toggle$/);
    if(toggleMatch&&req.method==='POST'){
      const existing=recordFor(user.id,'automations',toggleMatch[1]);if(!existing)return json(res,404,{error:'Automação não encontrada.'});
      if(existing.active)db.prepare("UPDATE deliveries SET status='cancelled' WHERE automation_id=? AND user_id=? AND status='queued'").run(existing.id,user.id);
      const item=operations.saveRecord(user.id,'automations',{...existing,active:!existing.active},existing.id);return json(res,200,{item});
    }
    if (path === '/api/summary' && req.method === 'GET') {
      const counts = Object.fromEntries([...ALLOWED_KINDS].map((kind) => [kind, db.prepare('SELECT COUNT(*) AS count FROM records WHERE user_id = ? AND kind = ?').get(user.id, kind).count]));
      const activity = db.prepare('SELECT type, message, created_at FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 12').all(user.id);
      return json(res, 200, { counts, activity });
    }
    const previewMatch = path.match(/^\/api\/automations\/([a-f0-9]+)\/preview$/);
    const offerMatch=path.match(/^\/api\/products\/([a-f0-9]+)\/message$/);
    if(offerMatch&&req.method==='GET'){const product=recordFor(user.id,'products',offerMatch[1]);if(!product)return json(res,404,{error:'Produto não encontrado.'});const coupon=couponPrice(product,recordsFor(user.id,'coupons'));return json(res,200,{message:renderOfferMessage(null,product,coupon.finalPrice)+(coupon.code?`\nCupom: ${coupon.code}`:''),coupon});}
    if (previewMatch && req.method === 'GET') {
      const result = preview(user.id, previewMatch[1]);
      return result ? json(res, 200, result) : json(res, 404, { error: 'Automação não encontrada.' });
    }
    const match = path.match(/^\/api\/(whatsapp|groups|keywords|products|coupons|automations|videos|lists|videoGroups)(?:\/([a-f0-9]+))?$/);
    if (!match) return json(res, 404, { error: 'Rota não encontrada.' });
    const [, kind, recordId] = match;
    if (req.method === 'GET' && !recordId) return json(res, 200, { items: recordsFor(user.id, kind) });
    if (req.method === 'GET' && recordId) {
      const item = recordFor(user.id, kind, recordId);
      return item ? json(res, 200, { item }) : json(res, 404, { error: 'Registro não encontrado.' });
    }
    if (req.method === 'POST' && !recordId) {
      let value;
      try { const input=await body(req);validateOwnership(user.id,kind,input);value = validate(kind, input);if(kind==='automations')value.active=false; } catch (error) { return json(res, 400, { error: error.message }); }
      const createdAt = now();
      const newId = id();
      db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)').run(newId, user.id, kind, JSON.stringify(value), createdAt, createdAt);
      event(user.id, `${kind}.created`, `Novo registro em ${kind}`, { id: newId });
      return json(res, 201, { item: recordFor(user.id, kind, newId) });
    }
    if (req.method === 'PUT' && recordId) {
      const existing = recordFor(user.id, kind, recordId);
      if (!existing) return json(res, 404, { error: 'Registro não encontrado.' });
      let value;
      try { const input={ ...existing, ...await body(req),id:recordId };validateOwnership(user.id,kind,input);if(kind==='automations'&&existing.active)throw new Error('Pause a automação antes de editar.');value = validate(kind, input);if(kind==='automations')value.active=false; } catch (error) { return json(res, 400, { error: error.message }); }
      if (kind === 'whatsapp') value.status = existing.status;
      db.prepare('UPDATE records SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(value), now(), recordId, user.id);
      event(user.id, `${kind}.updated`, `Registro atualizado em ${kind}`, { id: recordId });
      return json(res, 200, { item: recordFor(user.id, kind, recordId) });
    }
    if (req.method === 'DELETE' && recordId) {
      if(kind==='groups')db.prepare("UPDATE deliveries SET status='cancelled' WHERE user_id=? AND destination_id=? AND status='queued'").run(user.id,recordId);
      if(kind==='automations')db.prepare("UPDATE deliveries SET status='cancelled' WHERE user_id=? AND automation_id=? AND status='queued'").run(user.id,recordId);
      const result = db.prepare('DELETE FROM records WHERE id = ? AND user_id = ? AND kind = ?').run(recordId, user.id, kind);
      if (!result.changes) return json(res, 404, { error: 'Registro não encontrado.' });
      event(user.id, `${kind}.deleted`, `Registro excluído em ${kind}`, { id: recordId });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Método não permitido.' });
  }
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!['index.html', 'app.js','auth-ui.js','auth.css','icons.js','dashboard-ui.js','dialog-ui.js','assets/favicon.svg','assets/manrope-variable.ttf','assets/OFL-Manrope.txt', 'operations-ui.js', 'style.css', 'wizard.css','operation.css'].includes(file)) return json(res, 404, { error: 'Página não encontrada.' });
  const content = await readFile(join(PUBLIC, file));
  res.writeHead(200, { 'content-type': MIME[extname(file)], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(content);
}

const server = createServer((req, res) => {
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Erro interno.' });
    else res.end();
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Oferta Clone em http://127.0.0.1:${server.address().port}`));
operations.start();
function shutdown(){operations.stop();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

export { couponPrice, preview, server };
