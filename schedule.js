export function scheduleSlot(automation, at = new Date()) {
  if (!automation.active) return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:automation.timezone||'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map((part)=>[part.type,part.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  if (automation.startDate && date<automation.startDate || automation.endDate && date>automation.endDate) return null;
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  if (automation.days?.length && !automation.days.map(Number).includes(day)) return null;
  const window=automation.daySchedules?.[day] || {allDay:automation.allDay!==false,startsAt:automation.startsAt,endsAt:automation.endsAt};
  const time=`${parts.hour}:${parts.minute}`;
  if (!window.allDay && (time<(window.startsAt||'00:00') || time>(window.endsAt||'23:59'))) return null;
  const minutes=Number(parts.hour)*60+Number(parts.minute);
  const start=window.allDay?0:Number((window.startsAt||'00:00').slice(0,2))*60+Number((window.startsAt||'00:00').slice(3));
  const interval=Math.max(1,Number(automation.intervalMinutes)||30);
  return `${date}:${Math.floor((minutes-start)/interval)}`;
}

export function contentAvailable(product, lists = [], at = new Date()) {
  if (product.expiresAt && Date.parse(product.expiresAt)<=at.getTime()) return false;
  if (product.importedAt && Date.parse(product.importedAt)+30*86400000<=at.getTime()) return false;
  return true;
}

export function listHasProduct(list, product, at = new Date()) {
  return (list.entries||[]).some((entry)=>entry.productId===product.id && (!entry.expiresAt || Date.parse(entry.expiresAt)>at.getTime()));
}
