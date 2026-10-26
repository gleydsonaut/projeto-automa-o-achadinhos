import {createHash} from 'node:crypto';
import {normalizeImportedProduct} from './integrations.js';

// Contrato e assinatura conferidos no explorador oficial brasileiro, 16/10/2026.
export async function shopeeCall(appId,secret,query,variables={},fetcher=fetch,at=Date.now()) {
  const timestamp=Math.ceil(at/1000),payload=JSON.stringify({query,variables});
  const signature=createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`).digest('hex');
  let response,data;
  try {response=await fetcher('https://open-api.affiliate.shopee.com.br/graphql',{method:'POST',headers:{'content-type':'application/json',authorization:`SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`},body:payload,signal:AbortSignal.timeout(20000)});data=await response.json();}
  catch {throw new Error('Não foi possível consultar a Shopee. Confira a conexão.');}
  if(!response.ok||data.errors?.length||!data.data)throw new Error(`Shopee recusou a consulta (${data.errors?.[0]?.extensions?.code||response.status}). Confira credenciais e permissão Open API.`);
  return data.data;
}
export async function searchShopee(credentials,{keyword='',shopId='',page=1,limit=50}={},fetcher=fetch) {
  const numericShop=shopId?Number(shopId):null;
  if(numericShop!==null&&(!Number.isSafeInteger(numericShop)||numericShop<=0))throw new Error('Use o ID numérico da loja Shopee.');
  const query='query($keyword:String,$shopId:Int64,$page:Int,$limit:Int){productOfferV2(keyword:$keyword,shopId:$shopId,page:$page,limit:$limit,sortType:2){nodes{productName price sales imageUrl productLink offerLink commissionRate itemId shopId productCatIds periodEndTime} pageInfo{hasNextPage page limit}}}';
  const result=await shopeeCall(credentials.appId,credentials.token,query,{keyword:String(keyword).slice(0,120),shopId:numericShop,page:Math.max(1,Math.min(100,Number(page)||1)),limit:Math.max(1,Math.min(50,Number(limit)||50))},fetcher);
  return {items:(result.productOfferV2?.nodes||[]).map(item=>({...normalizeImportedProduct({title:item.productName,price:item.price,url:item.productLink,affiliateUrl:item.offerLink,commission:Number(item.commissionRate)*100,sales:item.sales,imageUrl:item.imageUrl}),shopId:String(item.shopId),itemId:String(item.itemId),categoryIds:item.productCatIds||[],expiresAt:Number(item.periodEndTime)>0?new Date(Number(item.periodEndTime)*1000).toISOString():null,source:'shopee-api'})),pageInfo:result.productOfferV2?.pageInfo};
}
export async function shopeeLink(credentials,url,fetcher=fetch) {
  const result=await shopeeCall(credentials.appId,credentials.token,'mutation($input:ShortLinkInput!){generateShortLink(input:$input){shortLink}}',{input:{originUrl:url,subIds:['ofertalab']}},fetcher);
  return result.generateShortLink.shortLink;
}
export async function shopeeConversions(credentials,days=7,fetcher=fetch) {
  const end=Math.floor(Date.now()/1000),start=end-Math.max(1,Math.min(30,Number(days)||7))*86400;
  const query='query($start:Int64,$end:Int64,$scroll:String){conversionReport(purchaseTimeStart:$start,purchaseTimeEnd:$end,limit:50,scrollId:$scroll){nodes{conversionId purchaseTime totalCommission netCommission orders{orderId orderStatus items{itemId qty actualAmount itemTotalCommission}}} pageInfo{hasNextPage scrollId}}}';
  let scroll=null,hasNextPage=true,pages=0;const conversions=[];
  while(hasNextPage&&pages<20){const result=await shopeeCall(credentials.appId,credentials.token,query,{start,end,scroll},fetcher);const report=result.conversionReport;conversions.push(...(report?.nodes||[]));hasNextPage=Boolean(report?.pageInfo?.hasNextPage);scroll=report?.pageInfo?.scrollId;if(hasNextPage&&!scroll)throw new Error('Paginação de relatório Shopee incompleta.');pages++;}
  return {start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString(),partial:hasNextPage,conversions};
}
