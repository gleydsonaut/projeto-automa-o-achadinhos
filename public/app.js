import {operationPage,integrationPage,extraFields,collectExtra,bindOperations} from './operations-ui.js';
import {mountAuth,authMessages} from './auth-ui.js';
import {shellMarkup,overviewMarkup,bindNavigation} from './dashboard-ui.js';
import {bindDialogs} from './dialog-ui.js';
import {icon} from './icons.js';
const sections = [
  ['overview', 'Visão geral', '▦'],
  ['automations', 'Automações', '◫'],
  ['products', 'Produtos', '◇'],
  ['keywords', 'Palavras-chave', '⌕'],
  ['coupons', 'Cupons', '％'],
  ['lists', 'Listas', '☷'],
  ['videos', 'Vídeos', '▷'],
  ['videoGroups','Grupos de vídeos','▻'],
  ['groups', 'Grupos', '◎'],
  ['whatsapp', 'WhatsApp', '◉'],
  ['operations', 'Operação', '◷'],
  ['settings', 'Configurações', '⚙'],
];
const titles = {
  overview: ['Visão geral', 'O que está acontecendo na sua operação'],
  automations: ['Automações', 'Monte o fluxo de ofertas de cada nicho'],
  products: ['Produtos', 'Seu catálogo de ofertas selecionadas'],
  keywords: ['Palavras-chave', 'Buscas para alimentar a seleção de produtos'],
  coupons: ['Cupons', 'Regras de desconto antes da publicação'],
  lists: ['Listas', 'Coleções curadas para suas automações'],
  videos: ['Vídeos', 'Links e grupos de vídeos da Shopee'],
  videoGroups:['Grupos de vídeos','Organize automaticamente os vídeos por hashtags'],
  groups: ['Grupos', 'Destinos e conjuntos para o Link Inteligente'],
  whatsapp: ['WhatsApp', 'Números disponíveis para envio'],
  settings: ['Configurações', 'Conexões e integrações da operação'],
  operations: ['Operação', 'Agenda, fila de mensagens e histórico de execuções'],
};
const marketplaceLabel = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon', lists: 'Listas' };
const state = { user: null, page: 'overview', items: {}, summary: null, editing: null, authMode: 'login',authProviders:{google:{enabled:false}},authNotice:'' };
const app = document.querySelector('#app');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast ${error ? 'error' : ''}`;
  node.setAttribute('role',error?'alert':'status');node.setAttribute('aria-atomic','true');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 4300);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}
async function refresh() {
  if (!state.user) return;
  const [summary, ...resources] = await Promise.all([
    api('summary'),
    ...['automations', 'products', 'keywords', 'coupons', 'lists', 'videos','videoGroups', 'groups', 'whatsapp'].map((section) => api(section)),
  ]);
  state.summary = summary;
  const [operations,metrics,authStatus]=await Promise.all([api('operations'),api('metrics'),api('auth/status')]);state.operations=operations;state.metrics=metrics;state.authStatus=authStatus;
  ['automations', 'products', 'keywords', 'coupons', 'lists', 'videos','videoGroups', 'groups', 'whatsapp'].forEach((section, i) => { state.items[section] = resources[i].items; });
  render();
}
function authScreen() {
  mountAuth({app,state,api,onSuccess:refresh});
}
function shell(content) { return shellMarkup(state,sections,titles,content); }
function overview() { return overviewMarkup(state); }
function table(kind) {
  const items = state.items[kind] || [];
  const config = {
    videoGroups:{cols:['Grupo','Hashtags'],row:x=>[x.name,(x.hashtags||[]).join(' ')]},
    automations: { cols: ['Automação', 'Fontes', 'Grupos', 'Status'], row: (x) => [x.name, (x.sources || []).map((s) => marketplaceLabel[s] || s).join(', '), String(x.groupIds?.length || 0), x.active ? 'Ativa' : 'Pausada'] },
    products: { cols: ['Produto', 'Marketplace', 'Preço', 'Categoria'], row: (x) => [x.title, marketplaceLabel[x.marketplace] || x.marketplace, money(x.price), x.category || '—'] },
    keywords: { cols: ['Busca', 'Palavras-chave', 'Loja', 'Status'], row: (x) => [x.name, String(x.terms?.length || 0), x.storeId || 'Todas', x.active ? 'Ativa' : 'Pausada'] },
    coupons: { cols: ['Código', 'Marketplace', 'Desconto', 'Validade'], row: (x) => [x.code, marketplaceLabel[x.marketplace] || 'Todos', x.type === 'percent' ? `${x.value}%` : money(x.value), date(x.expiresAt)] },
    lists: { cols: ['Lista', 'Descrição', 'Criada em'], row: (x) => [x.name, x.description || '—', date(x.createdAt)] },
    videos: { cols: ['Vídeo', 'Grupo', 'Hashtags', 'Status'], row: (x) => [x.url, x.group || 'Caixa de entrada', x.hashtags || '—', x.createdAt && Date.now() - Date.parse(x.createdAt) >= 60 * 60 * 1000 ? 'Elegível para prévia' : 'Em maturação (60 min)'] },
    groups: { cols: ['Grupo / conjunto', 'Link Inteligente', 'Instância', 'Link convite'], row: (x) => [x.name, x.slug, x.instanceId ? (state.items.whatsapp || []).find((i) => i.id === x.instanceId)?.name || '—' : '—', x.inviteLink || '—'] },
    whatsapp: { cols: ['Número', 'Telefone', 'Conexão'], row: (x) => [x.name, x.phone, x.status === 'not_connected' ? 'Não conectado' : x.status] },
  }[kind];
  const messages = { automations: 'Crie uma automação para combinar produtos, horários e grupos.', products: 'Adicione o primeiro produto à sua seleção.', keywords: 'Cadastre palavras para organizar as buscas da Shopee.', coupons: 'Cadastre as regras de desconto antes de montar ofertas.', lists: 'Crie uma coleção de produtos por tema ou nicho.', videos: 'Adicione links de vídeos e organize-os por tema.', groups: 'Cadastre o primeiro conjunto de grupos.', whatsapp: 'Cadastre o número que será conectado ao provedor.' };
  if (!items.length) return `<section class="panel empty-large"><span class="empty-icon">${icon(kind)}</span><h2>Nada por aqui ainda</h2><p>${messages[kind]||"Cadastre o primeiro registro para organizar sua operação."}</p><button class="button primary" data-new="${kind}">+ Adicionar</button></section>`;
  return `<section class="panel table-panel"><div class="panel-head"><div><h2>${items.length} ${items.length === 1 ? 'registro' : 'registros'}</h2><p>Dados salvos localmente nesta conta</p></div></div><div class="table-wrap"><table><thead><tr>${config.cols.map((x) => `<th>${x}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${items.map((x) => `<tr>${config.row(x).map((v, index) => `<td ${index === 0 ? 'class="first-cell"' : ''}>${esc(v)}</td>`).join('')}<td class="row-actions">${kind === 'automations' ? `<button data-preview="${x.id}" title="Prévia">Prévia</button>` : ''}<button data-edit="${kind}:${x.id}" title="Editar">Editar</button><button data-delete="${kind}:${x.id}" title="Excluir">Excluir</button></td></tr>`).join('')}</tbody></table></div></section>${kind === 'whatsapp' ? '<p class="notice">A conexão por QR Code depende de um provedor WhatsApp. Nesta versão, os números são apenas cadastrados e não enviam mensagens.</p>' : ''}`;
}
function render() {
  if (!state.user) return authScreen();
  app.innerHTML = shell(state.page === 'overview' ? overview() : state.page === 'settings' ? integrationPage(state) : state.page==='operations'?operationPage(state):table(state.page));
  if(state.page==='operations')document.querySelector('[data-new="operations"]')?.remove();
  bindOperations({api,refresh,toast});
  bindNavigation();bindDialogs(document.querySelector('#modal-root'));
  document.querySelectorAll('[data-nav]').forEach((node) => node.onclick = event => {if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();state.page=node.dataset.nav;history.pushState(null,'',`?page=${state.page}`);render();document.querySelector('#main-content')?.focus({preventScroll:true});window.scrollTo(0,0);});
  document.querySelectorAll('[data-new]').forEach((node) => node.onclick = () => openForm(node.dataset.new));
  document.querySelectorAll('[data-edit]').forEach((node) => node.onclick = () => { const [kind, recordId] = node.dataset.edit.split(':'); openForm(kind, recordId); });
  document.querySelectorAll('[data-preview]').forEach((node) => node.onclick = () => showPreview(node.dataset.preview));
  document.querySelectorAll('[data-delete]').forEach((node) => node.onclick = () => removeRecord(...node.dataset.delete.split(':')));
  document.querySelector('#logout').onclick = async () => { await api('logout', { method: 'POST' }); state.user=null;state.authMode='login';state.authNotice='';state.page='overview';history.replaceState(null,'',location.pathname);authScreen(); };
}
function input(label, name, value = '', options = {}) {
  const type = options.type || 'text';
  const required = options.required ? 'required' : '';
  const min = options.min !== undefined ? `min="${options.min}"` : '';
  const step = options.step !== undefined ? `step="${options.step}"` : '';
  return `<label>${label}${options.optional ? ' <span class="optional">opcional</span>' : ''}<input name="${name}" type="${type}" value="${esc(value)}" ${required} ${min} ${step} placeholder="${esc(options.placeholder || '')}"></label>`;
}
function select(label, name, choices, value = '') {
  return `<label>${label}<select name="${name}">${choices.map(([key, title]) => `<option value="${esc(key)}" ${String(value) === String(key) ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
}
const markets = [['shopee', 'Shopee'], ['mercadolivre', 'Mercado Livre'], ['amazon', 'Amazon']];
function fields(kind, x = {}) {
  switch (kind) {
    case 'videoGroups':return `${input('Nome do grupo','name',x.name,{required:true})}${input('Hashtags (até 10, separadas por espaço)','hashtags',(x.hashtags||[]).join(' '),{required:true,placeholder:'#casa #cozinha'})}<p class="form-hint">Um vídeo com uma dessas hashtags entra automaticamente neste grupo e pode pertencer a vários grupos.</p>`;
    case 'whatsapp': return `<div class="form-grid">${input('Nome do número', 'name', x.name, { required: true, placeholder: 'Atendimento principal' })}${input('Número do WhatsApp', 'phone', x.phone, { required: true, placeholder: '(11) 98765-4321' })}</div><p class="form-hint">Para conectar por QR ou código, será necessário configurar um provedor compatível.</p>`;
    case 'groups': return `<div class="form-grid">${input('Nome do grupo/conjunto', 'name', x.name, { required: true, placeholder: 'Ofertas do Dia' })}${input('Identificador da URL', 'slug', x.slug, { required: true, placeholder: 'ofertas-do-dia' })}${select('Número WhatsApp', 'instanceId', [['', 'Selecione'], ...(state.items.whatsapp || []).map((i) => [i.id, i.name])], x.instanceId)}${input('Link convite do grupo', 'inviteLink', x.inviteLink, { optional: true, type: 'url', placeholder: 'https://chat.whatsapp.com/...' })}${input('Horário de abertura', 'opensAt', x.opensAt, { type: 'time', optional: true })}${input('Horário de fechamento', 'closesAt', x.closesAt, { type: 'time', optional: true })}</div>`;
    case 'keywords': return `${input('Nome da busca', 'name', x.name, { required: true, placeholder: 'Produtos para Casa' })}<label>Palavras-chave <span class="optional">uma por linha</span><textarea name="terms" required placeholder="secador de cabelo profissional 1500w\nprancha alisadora de cabelo">${esc((x.terms || []).join('\n'))}</textarea></label><p class="form-hint">Cada termo deve ter 2 a 5 palavras e até 120 caracteres. Você também pode separar termos por ponto e vírgula.</p><div class="form-grid">${input('Loja Shopee', 'storeId', x.storeId, { optional: true, placeholder: 'ID numérico da loja' })}${input('Descrição', 'description', x.description, { optional: true })}</div><label>Palavras negativas <span class="optional">opcional, uma por linha</span><textarea name="negativeTerms" placeholder="shampoo\nbala">${esc((x.negativeTerms || []).join('\n'))}</textarea></label><p class="form-hint">Até 200 palavras negativas. Na ferramenta de referência elas excluem produtos pelo título; a API Shopee pode atualizar as buscas diariamente após configuração.</p><label class="check"><input name="active" type="checkbox" ${x.active !== false ? 'checked' : ''}> Busca ativa</label>`;
    case 'products': return `<div class="form-grid">${input('Nome do produto', 'title', x.title, { required: true, placeholder: 'Fone Bluetooth TWS' })}${select('Marketplace', 'marketplace', markets, x.marketplace)}${input('Preço atual (R$)', 'price', x.price, { required: true, type: 'number', min: 0.01, step: 0.01 })}${input('Preço original (R$)', 'originalPrice', x.originalPrice, { optional: true, type: 'number', min: 0, step: 0.01 })}${input('Categoria', 'category', x.category, { optional: true })}${input('Vendas registradas', 'sales', x.sales, { optional: true, type: 'number', min: 0, step: 1 })}${input('Comissão (%)', 'commission', x.commission, { optional: true, type: 'number', min: 0, step: 0.01 })}${input('Link de afiliado', 'url', x.url, { optional: true, type: 'url', placeholder: 'https://...' })}${input('Imagem', 'imageUrl', x.imageUrl, { optional: true, type: 'url', placeholder: 'https://...' })}</div>`;
    case 'coupons': return `<div class="form-grid">${input('Código do cupom', 'code', x.code, { required: true, placeholder: 'OFERTA20' })}${select('Marketplace', 'marketplace', [['', 'Todos'], ...markets], x.marketplace)}${select('Tipo', 'type', [['percent', 'Percentual'], ['fixed', 'Valor fixo']], x.type)}${input('Valor', 'value', x.value, { required: true, type: 'number', min: 0.01, step: 0.01 })}${input('Compra mínima (R$)', 'minimum', x.minimum, { optional: true, type: 'number', min: 0, step: 0.01 })}${input('Desconto máximo (R$)', 'maximum', x.maximum, { optional: true, type: 'number', min: 0, step: 0.01 })}${input('Categoria elegível', 'category', x.category, { optional: true })}${input('Válido até', 'expiresAt', x.expiresAt, { optional: true, type: 'date' })}</div>`;
    case 'lists': return `${input('Nome da lista', 'name', x.name, { required: true, placeholder: 'Ofertas de cozinha' })}${input('Descrição', 'description', x.description, { optional: true })}`;
    case 'videos': return `<div class="form-grid">${input('Link do vídeo', 'url', x.url, { required: true, type: 'url', placeholder: 'https://...' })}${input('Grupo de vídeos', 'group', x.group, { optional: true, placeholder: 'Cozinha' })}${input('Hashtags', 'hashtags', x.hashtags, { optional: true, placeholder: '#casa #cozinha' })}${input('Descrição', 'description', x.description, { optional: true })}</div>`;
    case 'automations': return `<div class="wizard-intro">Crie uma automação e confira quantas mensagens ela geraria. Nenhuma mensagem será enviada nesta etapa.</div><div class="form-grid">${input('Nome da automação', 'name', x.name, { required: true, placeholder: 'Achadinhos da manhã' })}${input('Produtos por ciclo', 'productsPerCycle', x.productsPerCycle || 3, { type: 'number', min: 1 })}${input('Intervalo entre ciclos (min)', 'intervalMinutes', x.intervalMinutes || 30, { type: 'number', min: 1 })}${input('Não repetir produto (horas)', 'dedupeHours', x.dedupeHours || 24, { type: 'number', min: 1 })}${input('Horário inicial', 'startsAt', x.startsAt || '08:00', { type: 'time' })}${input('Horário final', 'endsAt', x.endsAt || '22:00', { type: 'time' })}</div><div class="choice-group"><strong>Fontes de produtos</strong><div class="choice-row">${[...markets, ['lists', 'Listas']].map(([key, label]) => `<label class="check"><input type="checkbox" name="source" value="${key}" ${(x.sources || ['shopee']).includes(key) ? 'checked' : ''}> ${label}</label>`).join('')}</div></div><div class="choice-group"><strong>Grupos de destino</strong><div class="choice-row">${(state.items.groups || []).length ? state.items.groups.map((group) => `<label class="check"><input type="checkbox" name="groupId" value="${group.id}" ${(x.groupIds || []).includes(group.id) ? 'checked' : ''}> ${esc(group.name)}</label>`).join('') : '<p class="form-hint">Cadastre um grupo antes de criar a automação.</p>'}</div></div><div class="choice-group"><strong>Dias da semana</strong><div class="choice-row">${[['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']].map(([key, label]) => `<label class="check"><input type="checkbox" name="day" value="${key}" ${(x.days || ['1','2','3','4','5']).includes(key) ? 'checked' : ''}> ${label}</label>`).join('')}</div></div><label class="check"><input name="active" type="checkbox" ${x.active ? 'checked' : ''}> Automação ativa</label>`;
  }
}
function openAutomationWizard(existing=null) {
  if(existing?.active)return toast('Pause a automação na tela Operação antes de editar.',true);
  const root = document.querySelector('#modal-root');
  const steps = ['Identidade', 'Agenda', 'Grupos', 'Conteúdo', 'Shopee Vídeos', 'Regras'];
  const draft = {
    name: '', description: '', days: [0, 1, 2, 3, 4, 5, 6], allDay: true,
    daySchedules: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [day, { allDay: true, startsAt: '08:00', endsAt: '22:00' }])),
    intervalMinutes: 30, startDate: new Date().toISOString().slice(0, 10), endDate: '',
    groupIds: [], sources: ['shopee'], productsPerCycle: 3, messageTemplate: '',
    minPrice: '', maxPrice: '', minCommission: '', enableVideos: false,
    videosPerCycle: 1, videoCycleInterval: 1, dedupeHours: 24,
    sortBy: 'sales', contentMode: 'categories', categoryTerms: '', keywordIds: [],
    videoGroups: [], videoDedupeHours: 24, messageDelaySeconds: 60, groupDelaySeconds: 20, crossPromotion: false,
  };
  if(existing)Object.assign(draft,existing,{daySchedules:{...draft.daySchedules,...(existing.daySchedules||{})},days:(existing.days||draft.days).map(Number)});
  let step = 0;
  const days = [['0', 'Domingo'], ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado']];
  const check = (name, value, label, checked) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`;
  const content = () => {
    if (step === 0) return `${input('Nome da automação *', 'name', draft.name, { required: true, placeholder: 'Ofertas da manhã' })}<label>Descrição <span class="optional">opcional</span><textarea name="description" placeholder="Para que serve esta automação?">${esc(draft.description)}</textarea></label><p class="form-hint">Automações criadas neste ambiente ficam pausadas. Editar depois não envia mensagens.</p>`;
    if (step === 1) return `<div class="choice-group"><strong>Dias e horários</strong><p class="form-hint">Cada dia pode rodar o dia todo ou em uma faixa própria.</p><div class="day-schedules">${days.map(([key, label]) => { const schedule = draft.daySchedules[key]; return `<div class="day-schedule">${check('day', key, label, draft.days.includes(Number(key)))}<label class="check"><input type="checkbox" name="allDay-${key}" ${schedule.allDay ? 'checked' : ''}> Dia todo</label>${input('Início', `startsAt-${key}`, schedule.startsAt, { type: 'time' })}${input('Fim', `endsAt-${key}`, schedule.endsAt, { type: 'time' })}</div>`; }).join('')}</div></div><div class="form-grid">${select('Intervalo entre execuções', 'intervalMinutes', [['5', 'A cada 5 minutos'], ['10', 'A cada 10 minutos'], ['15', 'A cada 15 minutos'], ['30', 'A cada 30 minutos'], ['60', 'A cada 1 hora'], ['120', 'A cada 2 horas'], ['240', 'A cada 4 horas']], draft.intervalMinutes)}${input('Data de início *', 'startDate', draft.startDate, { type: 'date', required: true })}${input('Data de término', 'endDate', draft.endDate, { type: 'date', optional: true })}</div>`;
    if (step === 2) return `<div class="choice-group"><strong>Grupos de destino</strong><p class="form-hint">No produto original, esta etapa exige um número WhatsApp conectado. O modo de execução escolhido ao final define simulação ou envio pelo Telegram.</p><div class="choice-row">${(state.items.groups || []).length ? state.items.groups.map((group) => check('groupId', group.id, group.name, draft.groupIds.includes(group.id))).join('') : '<p class="form-hint">Ainda não há grupos. Cadastre um grupo no menu lateral antes de concluir a automação.</p>'}</div></div>`;
    if (step === 3) return `<div class="choice-group"><strong>Fontes de produtos</strong><div class="choice-row">${[...markets, ['lists', 'Listas']].map(([key, label]) => check('source', key, label, draft.sources.includes(key))).join('')}</div></div><div class="form-grid">${input('Produtos por execução', 'productsPerCycle', draft.productsPerCycle, { type: 'number', min: 1, required: true })}${select('Ordenar por', 'sortBy', [['sales', 'Mais vendidos'], ['commissionPercent', 'Maior comissão (%)'], ['commissionValueHigh', 'Maior valor de comissão'], ['commissionValueLow', 'Menor valor de comissão']], draft.sortBy)}${input('Preço mínimo (R$)', 'minPrice', draft.minPrice, { type: 'number', min: 0, step: 0.01, optional: true })}${input('Preço máximo (R$)', 'maxPrice', draft.maxPrice, { type: 'number', min: 0, step: 0.01, optional: true })}${input('Comissão mínima (%)', 'minCommission', draft.minCommission, { type: 'number', min: 0, step: 0.01, optional: true })}${input('Não repetir produto no grupo (horas)', 'dedupeHours', draft.dedupeHours, { type: 'number', min: 1 })}</div><div class="choice-group"><strong>Seleção Shopee</strong><p class="form-hint">No tutorial, categorias e buscas por palavra-chave são modos alternativos.</p><div class="choice-row"><label class="check"><input type="radio" name="contentMode" value="categories" ${draft.contentMode === 'categories' ? 'checked' : ''}> Categorias</label><label class="check"><input type="radio" name="contentMode" value="keywords" ${draft.contentMode === 'keywords' ? 'checked' : ''}> Palavras-chave</label></div><label>Categorias locais <span class="optional">separadas por vírgula</span><input name="categoryTerms" value="${esc(draft.categoryTerms)}" placeholder="Casa, Beleza, Eletrônicos"></label><div class="choice-row">${(state.items.keywords || []).length ? state.items.keywords.map((item) => check('keywordId', item.id, item.name, draft.keywordIds.includes(item.id))).join('') : '<p class="form-hint">Nenhuma busca por palavra-chave cadastrada.</p>'}</div></div><p class="form-hint">A prévia usa seu catálogo, alimentado por importação ou API Shopee. Selecione as listas abaixo quando usar essa fonte.</p>`;
    if (step === 4) return `<label class="check wizard-toggle"><input type="checkbox" name="enableVideos" ${draft.enableVideos ? 'checked' : ''}> Incluir vídeos da Shopee</label><div class="choice-group"><strong>Grupos de vídeos</strong><div class="choice-row">${[...new Set([...(state.items.videoGroups||[]).map(rule=>rule.name),...(state.items.videos||[]).flatMap(item=>[item.group,...(item.groups||[])])].filter(Boolean))].map((group) => check('videoGroup', group, group, draft.videoGroups.includes(group))).join('') || '<p class="form-hint">Nenhum grupo de vídeos local. Configure o bot na tela Configurações para receber links.</p>'}</div></div><div class="form-grid">${input('Vídeos por execução', 'videosPerCycle', draft.videosPerCycle, { type: 'number', min: 1 })}${input('Intervalo em ciclos', 'videoCycleInterval', draft.videoCycleInterval, { type: 'number', min: 0 })}${input('Não repetir vídeo (horas)', 'videoDedupeHours', draft.videoDedupeHours, { type: 'number', min: 1 })}</div><p class="form-hint">0 inclui vídeos em todos os ciclos; 1 ignora um ciclo entre envios. Links recebidos pelo bot entram após 60 minutos.</p>`;
    return `<div class="form-grid">${input('Delay entre mensagens (segundos)', 'messageDelaySeconds', draft.messageDelaySeconds, { type: 'number', min: 30 })}${input('Delay entre grupos (segundos)', 'groupDelaySeconds', draft.groupDelaySeconds, { type: 'number', min: 0 })}</div><label class="check wizard-toggle"><input type="checkbox" name="crossPromotion" ${draft.crossPromotion ? 'checked' : ''}> Promover outros grupos na descrição</label><p class="form-hint">No produto observado, esta opção altera a descrição dos grupos. Aqui ela é apenas registrada e nunca faz alterações no WhatsApp.</p><label>Modelo da mensagem <span class="optional">opcional</span><textarea name="messageTemplate" placeholder="Confira esta oferta: {produto} — {preco}&#10;{link}">${esc(draft.messageTemplate)}</textarea></label><p class="form-hint">Variáveis disponíveis nesta simulação: {produto}, {preco} e {link}.</p><div class="wizard-intro">Mini CTA por IA, frases em rodízio, marca na imagem e envio leve ainda não estão conectados. A agenda e a fila estão disponíveis na tela Operação, com simulação e envio pelo Telegram.</div><div class="wizard-summary"><strong>Revisão</strong><span>${esc(draft.name || 'Sem nome')}</span><span>${draft.days.length} dias selecionados · intervalo de ${draft.intervalMinutes} min</span><span>${draft.groupIds.length} grupos · ${draft.sources.length} fontes</span><span>Ao criar, a automação ficará pausada.</span></div>`;
  };
  const collect = () => {
    const form = root.querySelector('#wizard-form');
    if (!form) return;
    const value = Object.fromEntries(new FormData(form));
    if (step === 0) { draft.name = String(value.name || '').trim(); draft.description = String(value.description || '').trim(); }
    if (step === 1) { draft.days = [...form.querySelectorAll('[name="day"]:checked')].map((node) => Number(node.value)); for (const [key] of days) draft.daySchedules[key] = { allDay: Boolean(value[`allDay-${key}`]), startsAt: value[`startsAt-${key}`], endsAt: value[`endsAt-${key}`] }; draft.intervalMinutes = Number(value.intervalMinutes); draft.startDate = value.startDate; draft.endDate = value.endDate; }
    if (step === 2) draft.groupIds = [...form.querySelectorAll('[name="groupId"]:checked')].map((node) => node.value);
    if (step === 3) { draft.sources = [...form.querySelectorAll('[name="source"]:checked')].map((node) => node.value); draft.productsPerCycle = Number(value.productsPerCycle); draft.sortBy = value.sortBy; draft.minPrice = value.minPrice; draft.maxPrice = value.maxPrice; draft.minCommission = value.minCommission; draft.dedupeHours = Number(value.dedupeHours); draft.contentMode = value.contentMode; draft.categoryTerms = value.categoryTerms; draft.keywordIds = [...form.querySelectorAll('[name="keywordId"]:checked')].map((node) => node.value);draft.listIds=[...form.querySelectorAll('[name="listId"]:checked')].map(node=>node.value); }
    if (step === 4) { draft.enableVideos = Boolean(value.enableVideos); draft.videoGroups = [...form.querySelectorAll('[name="videoGroup"]:checked')].map((node) => node.value); draft.videosPerCycle = Number(value.videosPerCycle); draft.videoCycleInterval = Number(value.videoCycleInterval); draft.videoDedupeHours = Number(value.videoDedupeHours); }
    if (step === 5) { draft.messageTemplate = value.messageTemplate; draft.messageDelaySeconds = Number(value.messageDelaySeconds); draft.groupDelaySeconds = Number(value.groupDelaySeconds); draft.crossPromotion = Boolean(value.crossPromotion);draft.executionMode=value.executionMode||'simulation'; }
  };
  const validation = () => {
    if (step === 0 && !draft.name) return 'Informe um nome para a automação.';
    if (step === 1 && (!draft.days.length || !draft.startDate)) return 'Selecione ao menos um dia e a data inicial.';
    if (step === 1 && draft.days.some((day) => { const schedule = draft.daySchedules[day]; return !schedule.allDay && (!schedule.startsAt || !schedule.endsAt || schedule.startsAt >= schedule.endsAt); })) return 'Confira os horários dos dias selecionados.';
    if (step === 1 && draft.endDate && draft.endDate < draft.startDate) return 'A data final não pode vir antes da inicial.';
    if (step === 3 && (!draft.sources.length || draft.productsPerCycle < 1)) return 'Selecione uma fonte e uma quantidade de produtos.';
    if (step === 3 && draft.sources.includes('shopee') && draft.contentMode === 'keywords' && !draft.keywordIds.length) return 'Selecione ao menos uma busca por palavra-chave.';
    if (step === 3 && draft.minPrice !== '' && draft.maxPrice !== '' && Number(draft.minPrice) > Number(draft.maxPrice)) return 'O preço mínimo não pode exceder o máximo.';
    if (step === 4 && draft.enableVideos && (draft.videosPerCycle < 1 || draft.videoDedupeHours < 1)) return 'Confira a quantidade e o intervalo dos vídeos.';
    if (step === 5 && draft.messageDelaySeconds < 30) return 'Use pelo menos 30 segundos entre mensagens.';
    if (step === 5 && (!draft.groupIds.length || !draft.sources.length)) return 'Cadastre e selecione um grupo e uma fonte antes de criar.';
    return null;
  };
  const paint = () => {
    root.innerHTML = `<div class="modal-backdrop"><section class="modal wizard-modal" role="dialog" aria-modal="true" aria-label="Nova automação"><div class="modal-head"><div><div class="eyebrow">ETAPA ${step + 1} DE 6</div><h2>Nova automação</h2></div><button class="icon-button" id="close-modal" aria-label="Fechar">×</button></div><div class="wizard-progress">${steps.map((label, index) => `<span class="${index === step ? 'current' : index < step ? 'done' : ''}"><b>${index + 1}</b>${label}</span>`).join('')}</div><form id="wizard-form"><div class="modal-body"><div class="wizard-step-heading"><h3>${steps[step]}</h3><p>${['Dê uma identidade a este fluxo.', 'Escolha quando ele poderá executar.', 'Selecione os destinos da simulação.', 'Defina produtos e formato da oferta.', 'Configure o uso de vídeos, se desejar.', 'Confira as regras antes de criar pausada.'][step]}</p></div>${content()}</div><div class="modal-footer"><button type="button" class="button ghost" id="wizard-back">${step ? 'Voltar' : 'Cancelar'}</button><button class="button primary" type="submit">${step === 5 ? 'Criar pausada' : 'Próximo'}</button></div></form></section></div>`;
    if(step===3)root.querySelector('.modal-body').insertAdjacentHTML('beforeend',`<div class="choice-group"><strong>Listas selecionadas</strong><div class="choice-row">${(state.items.lists||[]).map(list=>check('listId',list.id,list.name,(draft.listIds||[]).includes(list.id))).join('')||'<p>Nenhuma lista cadastrada.</p>'}</div></div>`);
    if(step===5)root.querySelector('.modal-body').insertAdjacentHTML('beforeend',extraFields('automations',draft,state));
    const close = () => root.replaceChildren();
    root.querySelector('#close-modal').onclick = close;
    root.querySelector('.modal-backdrop').onclick = (event) => { if (event.target.classList.contains('modal-backdrop')) close(); };
    root.querySelector('#wizard-back').onclick = () => { if (step === 0) return close(); collect(); step--; paint(); };
    if (step === 3) root.querySelectorAll('[name="contentMode"]').forEach((node) => { node.onchange = () => { collect(); if (draft.contentMode === 'categories') draft.keywordIds = []; else draft.categoryTerms = ''; paint(); }; });
    root.querySelector('#wizard-form').onsubmit = async (event) => {
      event.preventDefault();
      collect();
      const error = validation();
      if (error) return toast(error, true);
      if (step < 5) { step++; paint(); return; }
      try {
        await api(`automations${existing?`/${existing.id}`:''}`, { method: existing?'PUT':'POST', body: JSON.stringify({ ...draft, active: false }) });
        close(); toast(existing?'Automação atualizada e pausada.':'Automação criada pausada.'); await refresh();
      } catch (cause) { toast(cause.message, true); }
    };
  };
  paint();
}
function openForm(kind, recordId = null) {
  if (kind === 'automations') return openAutomationWizard(recordId?(state.items.automations||[]).find(item=>item.id===recordId):null);
  const existing = recordId ? (state.items[kind] || []).find((x) => x.id === recordId) : null;
  const heading = existing ? 'Editar' : 'Adicionar';
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${heading}"><div class="modal-head"><div><div class="eyebrow">${heading.toUpperCase()}</div><h2>${titles[kind][0]}</h2></div><button class="icon-button" id="close-modal" aria-label="Fechar">×</button></div><form id="record-form"><div class="modal-body">${fields(kind, existing || {})}</div><div class="modal-footer"><button class="button ghost" type="button" id="cancel-modal">Cancelar</button><button class="button primary">${existing ? 'Salvar alterações' : 'Adicionar'}</button></div></form></section></div>`;
  const close = () => document.querySelector('#modal-root').replaceChildren();
  document.querySelector('#close-modal').onclick = close;
  document.querySelector('#cancel-modal').onclick = close;
  document.querySelector('.modal-backdrop').onclick = (event) => { if (event.target.classList.contains('modal-backdrop')) close(); };
  document.querySelector('#record-form .modal-body').insertAdjacentHTML('beforeend',extraFields(kind,existing||{},state));
  document.querySelector('#record-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    collectExtra(kind,data,form);
    if(kind==='videoGroups')data.hashtags=String(data.hashtags||'').split(/[\s,]+/).filter(Boolean);
    if (kind === 'automations') { data.sources = [...form.querySelectorAll('[name="source"]:checked')].map((n) => n.value); data.groupIds = [...form.querySelectorAll('[name="groupId"]:checked')].map((n) => n.value); data.days = [...form.querySelectorAll('[name="day"]:checked')].map((n) => Number(n.value)); data.active = form.querySelector('[name="active"]').checked; }
    if (kind === 'keywords') { data.terms = data.terms.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean); data.negativeTerms = data.negativeTerms.split('\n').map((s) => s.trim()).filter(Boolean); data.active = form.querySelector('[name="active"]').checked; }
    if (kind === 'products' || kind === 'coupons') for (const key of ['price', 'originalPrice', 'commission', 'minimum', 'maximum', 'value']) if (data[key] !== undefined) data[key] = data[key] === '' ? null : Number(data[key]);
    try { await api(`${kind}${recordId ? `/${recordId}` : ''}`, { method: recordId ? 'PUT' : 'POST', body: JSON.stringify(data) }); close(); toast(existing ? 'Alterações salvas.' : 'Registro adicionado.'); await refresh(); }
    catch (error) { toast(error.message, true); }
  };
}
async function showPreview(recordId) {
  try {
    const result = await api(`automations/${recordId}/preview`);
    document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Prévia da automação"><div class="modal-head"><div><div class="eyebrow">SIMULAÇÃO</div><h2>${esc(result.automation.name)}</h2></div><button class="icon-button" id="close-modal" aria-label="Fechar">×</button></div><div class="modal-body"><div class="preview-metrics"><div><strong>${result.groups.length}</strong><span>grupos</span></div><div><strong>${result.offers.length + (result.videos?.length || 0)}</strong><span>ofertas e vídeos</span></div><div><strong>${result.estimatedMessages}</strong><span>mensagens</span></div></div>${result.offers.length ? result.offers.map(({ product, coupon, message }) => `<div class="offer-preview"><strong>${esc(product.title)}</strong><span>${esc(marketplaceLabel[product.marketplace] || product.marketplace)} · ${money(product.price)}</span>${coupon.code ? `<small>Cupom ${esc(coupon.code)} → ${money(coupon.finalPrice)}</small>` : '<small>Sem cupom aplicável</small>'}<small class="preview-message">${esc(message)}</small></div>`).join('') : '<div class="empty compact">Nenhum produto elegível. Cadastre produtos das fontes selecionadas.</div>'}${result.videos?.length ? `<div class="offer-preview"><strong>${result.videos.length} vídeo(s) selecionado(s)</strong><small>Vídeos elegíveis para os ciclos da automação. Configure o Telegram para envio real.</small></div>` : ''}<p class="notice">${result.notes.map(esc).join(' ')}</p></div><div class="modal-footer"><button class="button primary" id="close-preview">Fechar</button></div></section></div>`;
    const close = () => document.querySelector('#modal-root').replaceChildren();
    document.querySelector('#close-modal').onclick = close;
    document.querySelector('#close-preview').onclick = close;
  } catch (error) { toast(error.message, true); }
}
async function removeRecord(kind, recordId) {
  if (!window.confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
  try { await api(`${kind}/${recordId}`, { method: 'DELETE' }); toast('Registro excluído.'); await refresh(); }
  catch (error) { toast(error.message, true); }
}
const authParams=new URLSearchParams(location.search);
if(titles[authParams.get('page')])state.page=authParams.get('page');
window.addEventListener('popstate',()=>{const page=new URLSearchParams(location.search).get('page');state.page=titles[page]?page:'overview';if(state.user)render();});
state.authNotice=authMessages[authParams.get('auth_error')]||'';
if(authParams.has('auth_error')||authParams.has('auth_linked'))history.replaceState(null,'',location.pathname);
try {state.authProviders=await api('auth/providers');}catch{ /* O acesso por senha continua disponível quando o provedor social não responder. */ }
try { state.user = (await api('auth/session')).user;if(state.user)await refresh();else authScreen();if(state.user&&state.authNotice)toast(state.authNotice,true);if(state.user&&authParams.get('auth_linked')==='google')toast('Sua conta Google foi vinculada.'); }
catch { authScreen(); }
