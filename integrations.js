export async function telegramCall(token, method, payload = {}, fetcher = fetch) {
  // API fixa: o usuário não fornece uma URL de destino.
  let response;
  try { response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)}); }
  catch { throw Object.assign(new Error('Telegram indisponível. Confira a conexão.'),{retryable:true}); }
  let data;
  try { data=await response.json(); } catch { throw Object.assign(new Error('Resposta inválida do Telegram.'),{retryable:true}); }
  if (!response.ok || !data.ok) throw Object.assign(new Error(`Telegram: falha ${data.error_code||response.status}.`),{retryable:response.status===429||response.status>=500,retryAfter:data.parameters?.retry_after});
  return data.result;
}

export function marketplaceFor(value) {
  let url; try { url=new URL(value); } catch { return null; }
  if (url.protocol!=='https:') return null;
  const host=url.hostname.toLowerCase();
  if (host==='shopee.com.br'||host.endsWith('.shopee.com.br')||host==='shope.ee'||host==='s.shopee.com.br') return 'shopee';
  if (host==='mercadolivre.com.br'||host.endsWith('.mercadolivre.com.br')||host==='mercadolibre.com'||host.endsWith('.mercadolibre.com')||host==='meli.la') return 'mercadolivre';
  if (host==='amazon.com.br'||host.endsWith('.amazon.com.br')||host==='amzn.to') return 'amazon';
  return null;
}

export function normalizeImportedProduct(input) {
  const marketplace=marketplaceFor(input.url);
  const price=Number(input.price);
  if (!marketplace || !String(input.title||'').trim() || !Number.isFinite(price) || price<=0) throw new Error('Produto precisa de nome, preço positivo e URL HTTPS de marketplace permitido.');
  if (input.affiliateUrl && marketplaceFor(input.affiliateUrl)!==marketplace) throw new Error('Link de afiliado deve pertencer ao mesmo marketplace.');
  return {title:String(input.title).trim().slice(0,300),price,marketplace,url:String(input.affiliateUrl||input.url),sourceUrl:String(input.url),imageUrl:input.imageUrl&&/^https:\/\//.test(input.imageUrl)?String(input.imageUrl).slice(0,2000):'',category:String(input.category||'').slice(0,120),commission:Math.max(0,Math.min(100,Number(input.commission)||0)),sales:Math.max(0,Number(input.sales)||0),importedAt:new Date().toISOString(),affiliateVerified:Boolean(input.affiliateUrl)};
}
