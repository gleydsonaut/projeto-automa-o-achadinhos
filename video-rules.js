// Regras de prévia local baseadas no tutorial; não representam envio ao Telegram.
export function videoEligible(video, at = new Date(), moderationMinutes = 60) {
  const created = Date.parse(video.createdAt || '');
  return Number.isFinite(created) && at.getTime() - created >= moderationMinutes * 60_000;
}

export function groupsForVideo(video,rules=[]) {
  const normalize=value=>String(value||'').replace(/^#/,'').toLocaleLowerCase('pt-BR');
  const tags=new Set(String(video.hashtags||'').split(/[\s,]+/).map(normalize).filter(Boolean));
  const automatic=rules.filter(rule=>(rule.hashtags||[]).some(tag=>tags.has(normalize(tag)))).map(rule=>rule.name);
  return [...new Set([video.group,...(video.groups||[]),...automatic].filter(Boolean))];
}

export function videosForCycle(automation, videos, cycleIndex = 0, at = new Date(), rules=[], allCandidates=false) {
  if (!automation.enableVideos) return [];
  const skippedCycles = Math.max(0, Number(automation.videoCycleInterval) || 0);
  if (cycleIndex % (skippedCycles + 1) !== 0) return [];
  const selectedGroups = automation.videoGroups || [];
  const limit = allCandidates?5000:Math.max(1, Math.min(20, Number(automation.videosPerCycle) || 1));
  return videos.filter((video) => videoEligible(video, at)
    && (!selectedGroups.length || groupsForVideo(video,rules).some(group=>selectedGroups.includes(group)))).slice(0, limit);
}
