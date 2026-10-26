const $=selector=>document.querySelector(selector);
const extensionApi=globalThis.browser||globalThis.chrome;
const status=message=>$('#status').textContent=message;
let products=[];
const saved=await extensionApi.storage.local.get(['server','token']);
if(saved.server)$('#server').value=saved.server;if(saved.token)$('#token').value=saved.token;
$('#scan').onclick=async()=>{
  try {
    const [tab]=await extensionApi.tabs.query({active:true,currentWindow:true});
    const host=new URL(tab.url).hostname;
    if(!['shopee.com.br','mercadolivre.com.br','amazon.com.br'].some(domain=>host===domain||host.endsWith(`.${domain}`)))throw new Error('Abra uma página de um dos três marketplaces.');
    const [result]=await extensionApi.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      const found=[];
      function visit(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}if([value['@type']].flat().includes('Product')){const offer=[value.offers].flat()[0]||{};const price=Number(offer.price||offer.lowPrice);if(value.name&&price>0)found.push({title:value.name,price,url:new URL(value.url||offer.url||location.href,location.href).href,imageUrl:[value.image].flat()[0]||''});}for(const [key,child]of Object.entries(value))if(child&&typeof child==='object')visit(child);}
      for(const script of document.querySelectorAll('script[type="application/ld+json"]'))try{visit(JSON.parse(script.textContent));}catch{}
      if(!found.length){
        const cards=document.querySelectorAll('[data-component-type="s-search-result"],.ui-search-layout__item,.poly-card,.shopee-search-item-result');
        for(const card of cards){const a=card.querySelector('a[href*="/dp/"],a[href*="/p/"],a[href*="-i."],a.poly-component__title,a.ui-search-link');const title=card.querySelector('h2,h3,.poly-component__title,.ui-search-item__title')?.textContent?.trim()||a?.textContent?.trim();const raw=card.querySelector('.a-price .a-offscreen,.andes-money-amount__fraction')?.textContent||'';const fraction=card.querySelector('.andes-money-amount__cents')?.textContent||'00';const price=raw.includes('R$')?Number(raw.replace(/[^\d,]/g,'').replace(',','.')):Number(raw.replace(/\D/g,''))+Number(fraction)/100;if(a&&title&&price>0)found.push({title,price,url:a.href,imageUrl:card.querySelector('img')?.src||''});}
      }
      return [...new Map(found.map(product=>[product.url,product])).values()].slice(0,100);
    }});
    products=result.result||[];$('#products').replaceChildren();
    products.forEach((product,index)=>{const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;label.append(checkbox,document.createTextNode(` ${product.title} — R$ ${product.price.toFixed(2)}`));$('#products').append(label);});
    $('#send').disabled=!products.length;status(products.length?`${products.length} produto(s). Confira os preços antes de importar.`:'Nenhum produto legível nesta página. Abra uma página individual ou importe um arquivo JSON.');
  }catch(error){status(error.message);}
};
$('#all').onchange=()=>document.querySelectorAll('#products input').forEach(input=>input.checked=$('#all').checked);
$('#send').onclick=async()=>{
  try {
    const server=new URL($('#server').value);if(server.protocol!=='http:'||!['127.0.0.1','localhost'].includes(server.hostname))throw new Error('Use apenas um servidor local HTTP.');
    const token=$('#token').value.trim();if(!token)throw new Error('Informe a chave de importação.');
    const selected=[...document.querySelectorAll('#products input:checked')].map(input=>({...products[Number(input.value)],category:$('#category').value}));
    if(!selected.length)throw new Error('Selecione um produto.');
    if($('#affiliateUrl').value){if(selected.length!==1)throw new Error('Link afiliado manual exige selecionar apenas um produto.');selected[0].affiliateUrl=$('#affiliateUrl').value;}
    await extensionApi.storage.local.set({server:server.origin,token});
    const response=await fetch(`${server.origin}/api/import/products`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({items:selected,listId:$('#listId').value.trim()||null})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);status(`${result.count} produto(s) importado(s).`);
  }catch(error){status(error.message);}
};
