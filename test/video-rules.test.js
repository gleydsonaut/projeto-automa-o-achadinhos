import test from 'node:test';
import assert from 'node:assert/strict';
import { videoEligible, videosForCycle,groupsForVideo } from '../video-rules.js';

const at = new Date('2026-10-16T12:00:00Z');
const videos = [
  { id: 'a', group: 'Casa', createdAt: '2026-10-16T10:00:00Z' },
  { id: 'b', group: 'Casa', createdAt: '2026-10-16T11:30:00Z' },
  { id: 'c', group: 'Moda', createdAt: '2026-10-16T10:00:00Z' },
];
test('hashtags associam um vídeo a vários grupos sem duplicar associações',()=>{
  assert.deepEqual(groupsForVideo({group:'Casa',hashtags:'#CASA #cozinha'},[{name:'Casa',hashtags:['#casa']},{name:'Cozinha',hashtags:['cozinha']}]),['Casa','Cozinha']);
});

test('vídeo aguarda maturação aproximada de 60 minutos', () => {
  assert.equal(videoEligible(videos[0], at), true);
  assert.equal(videoEligible(videos[1], at), false);
  assert.equal(videoEligible({ createdAt: 'inválido' }, at), false);
});

test('prévia respeita grupos e ciclos ignorados', () => {
  const automation = { enableVideos: true, videoGroups: ['Casa'], videosPerCycle: 2, videoCycleInterval: 1 };
  assert.deepEqual(videosForCycle(automation, videos, 0, at).map((item) => item.id), ['a']);
  assert.deepEqual(videosForCycle(automation, videos, 1, at), []);
  assert.deepEqual(videosForCycle(automation, videos, 2, at).map((item) => item.id), ['a']);
});
