import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleSlot,contentAvailable,listHasProduct} from '../schedule.js';
import {normalizeImportedProduct,telegramCall} from '../integrations.js';

test('agenda respeita Brasília, dias, datas e janela por dia',()=>{
  const automation={active:true,days:[5],startDate:'2026-10-16',endDate:'2026-10-16',intervalMinutes:30,daySchedules:{5:{allDay:false,startsAt:'08:00',endsAt:'09:00'}}};
  assert.equal(scheduleSlot(automation,new Date('2026-10-16T11:00:00Z')),'2026-10-16:0');
  assert.equal(scheduleSlot(automation,new Date('2026-10-16T11:29:00Z')),'2026-10-16:0');
  assert.equal(scheduleSlot(automation,new Date('2026-10-16T11:30:00Z')),'2026-10-16:1');
  assert.equal(scheduleSlot(automation,new Date('2026-10-16T12:01:00Z')),null);
  assert.equal(scheduleSlot(automation,new Date('2026-10-17T11:00:00Z')),null);
});

test('itens de listas expiram sem apagar os produtos do catálogo',()=>{
  const at=new Date('2026-10-16T12:00:00Z'),product={id:'p',importedAt:'2026-10-10T12:00:00Z'};
  assert.equal(contentAvailable(product,[],at),true);
  assert.equal(listHasProduct({entries:[{productId:'p',expiresAt:'2026-10-15T12:00:00Z'}]},product,at),false);
  assert.equal(contentAvailable({...product,importedAt:'2026-09-01T12:00:00Z'},[],at),false);
});

test('importação rejeita domínio enganoso, preço inválido e link de outro marketplace',()=>{
  for(const input of [{url:'https://amazon.com.br.evil.test/a',title:'x',price:1},{url:'http://amazon.com.br/a',title:'x',price:1},{url:'https://amazon.com.br/a',title:'x',price:'NaN'},{url:'https://amazon.com.br/a',title:'x',price:1,affiliateUrl:'https://shopee.com.br/a'}])assert.throws(()=>normalizeImportedProduct(input));
  const product=normalizeImportedProduct({url:'https://www.amazon.com.br/dp/test',title:'Produto',price:10,affiliateUrl:'https://amzn.to/test'});
  assert.equal(product.marketplace,'amazon');assert.equal(product.url,'https://amzn.to/test');
});

test('Telegram informa limite de requisições sem revelar token',async()=>{
  await assert.rejects(()=>telegramCall('SECRET','sendMessage',{},async()=>({ok:false,status:429,json:async()=>({ok:false,error_code:429,parameters:{retry_after:12}})})),error=>error.retryable&&error.retryAfter===12&&!error.message.includes('SECRET'));
});
