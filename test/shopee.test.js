import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {shopeeCall,searchShopee,shopeeLink,shopeeConversions} from '../shopee.js';

test('assinatura Shopee usa exatamente o corpo transmitido e não vaza segredo',async()=>{
  let captured;
  const result=await shopeeCall('12345','segredo','{test}',{},async(url,options)=>{captured={url,...options};return {ok:true,status:200,json:async()=>({data:{ok:true}})};},1000000);
  const expected=createHash('sha256').update(`123451000${captured.body}segredo`).digest('hex');
  assert.equal(captured.url,'https://open-api.affiliate.shopee.com.br/graphql');assert.match(captured.headers.authorization,new RegExp(`Signature=${expected}$`));assert.equal(captured.body.includes('segredo'),false);assert.equal(result.ok,true);
});

test('Shopee normaliza moeda e comissão, e preserva link afiliado da resposta',async()=>{
  const result=await searchShopee({appId:'12345',token:'secret'},{keyword:'fone bluetooth'},async()=>({ok:true,json:async()=>({data:{productOfferV2:{nodes:[{productName:'Fone',price:'99.90',commissionRate:'0.12',productLink:'https://shopee.com.br/fone',offerLink:'https://s.shopee.com.br/abc',shopId:10,itemId:20,sales:5}],pageInfo:{hasNextPage:false}}}})}));
  assert.equal(result.items[0].commission,12);assert.equal(result.items[0].price,99.9);assert.equal(result.items[0].shopId,'10');assert.equal(result.items[0].url,'https://s.shopee.com.br/abc');
});

test('paginação de conversões e geração de link usam operações oficiais',async()=>{
  let pages=0;
  const report=await shopeeConversions({appId:'1',token:'s'},7,async()=>({ok:true,json:async()=>({data:{conversionReport:{nodes:[{conversionId:++pages}],pageInfo:{hasNextPage:pages<2,scrollId:'next'}}}})}));
  assert.equal(report.conversions.length,2);assert.equal(report.partial,false);
  const link=await shopeeLink({appId:'1',token:'s'},'https://shopee.com.br/a',async()=>({ok:true,json:async()=>({data:{generateShortLink:{shortLink:'https://s.shopee.com.br/test'}}})}));assert.equal(link,'https://s.shopee.com.br/test');
});
