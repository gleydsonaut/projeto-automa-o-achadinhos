export function productEligibleForAutomation(automation, product) {
  if (!automation.sources?.includes(product.marketplace)) return false;
  if (automation.minPrice !== '' && automation.minPrice != null && Number(product.price) < Number(automation.minPrice)) return false;
  if (automation.maxPrice !== '' && automation.maxPrice != null && Number(product.price) > Number(automation.maxPrice)) return false;
  if (automation.minCommission !== '' && automation.minCommission != null && Number(product.commission || 0) < Number(automation.minCommission)) return false;
  return true;
}

export function productMatchesSelection(automation, product, keywords = []) {
  if (product.marketplace !== 'shopee') return true;
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (automation.contentMode === 'keywords') {
    return keywords.filter((item)=>item.active!==false&&automation.keywordIds?.includes(item.id)).some((item)=>{
      if(item.storeId&&String(product.shopId||'')!==String(item.storeId))return false;
      if((item.negativeTerms||[]).some(term=>normalize(product.title).includes(normalize(term))))return false;
      return (item.terms||[]).some(term=>normalize(product.title).includes(normalize(term)));
    });
  }
  const categories = String(automation.categoryTerms || '').split(',').map((item) => normalize(item.trim())).filter(Boolean);
  return !categories.length || categories.some((category) => normalize(product.category).includes(category));
}

export function orderProducts(products, sortBy = 'sales') {
  const commissionValue = (item) => Number(item.price || 0) * Number(item.commission || 0) / 100;
  const score = (item) => sortBy === 'commissionPercent' ? Number(item.commission || 0)
    : sortBy === 'commissionValueHigh' || sortBy === 'commissionValueLow' ? commissionValue(item)
      : Number(item.sales || 0);
  return [...products].sort((a, b) => sortBy === 'commissionValueLow' ? score(a) - score(b) : score(b) - score(a));
}

export function estimateDurationMinutes(groupCount, messagesPerGroup, messageDelaySeconds = 60, groupDelaySeconds = 20) {
  const groups = Math.max(0, Number(groupCount) || 0);
  const messages = Math.max(0, Number(messagesPerGroup) || 0);
  if (!groups || !messages) return 0;
  const betweenMessages = groups * Math.max(0, messages - 1) * Math.max(30, Number(messageDelaySeconds) || 60);
  const betweenGroups = Math.max(0, groups - 1) * Math.max(0, Number(groupDelaySeconds) || 0);
  return Math.ceil((betweenMessages + betweenGroups) / 60);
}

export function renderOfferMessage(template, product, finalPrice) {
  return String(template || '{produto} — {preco}\n{link}')
    .replaceAll('{produto}', product.title)
    .replaceAll('{preco}', Number(finalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
    .replaceAll('{link}', product.url || '[link de afiliado pendente]');
}
