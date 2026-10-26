import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDurationMinutes, orderProducts, productEligibleForAutomation, productMatchesSelection, renderOfferMessage } from '../preview-rules.js';

const product = { title: 'Fone Teste', marketplace: 'shopee', price: 100, commission: 8, url: 'https://example.test/item' };

test('filtra marketplace, preço e comissão', () => {
  assert.equal(productEligibleForAutomation({ sources: ['shopee'], minPrice: 80, maxPrice: 120, minCommission: 5 }, product), true);
  assert.equal(productEligibleForAutomation({ sources: ['amazon'] }, product), false);
  assert.equal(productEligibleForAutomation({ sources: ['shopee'], minPrice: 110 }, product), false);
  assert.equal(productEligibleForAutomation({ sources: ['shopee'], maxPrice: 90 }, product), false);
  assert.equal(productEligibleForAutomation({ sources: ['shopee'], minCommission: 10 }, product), false);
});

test('monta mensagem de prévia sem enviar', () => {
  assert.equal(renderOfferMessage('{produto} | {preco} | {link}', product, 80), 'Fone Teste | R$ 80,00 | https://example.test/item');
});

test('filtra categoria local sem diferenciar acentos', () => {
  assert.equal(productMatchesSelection({ contentMode: 'categories', categoryTerms: 'Eletrônicos, Beleza' }, { ...product, category: 'Eletronicos' }), true);
  assert.equal(productMatchesSelection({ contentMode: 'categories', categoryTerms: 'Casa' }, { ...product, category: 'Eletronicos' }), false);
});

test('buscas selecionadas filtram títulos no modo palavra-chave', () => {
  const automation = { contentMode: 'keywords', keywordIds: ['busca-1'] };
  const keywords = [{ id: 'busca-1', terms: ['fone teste'] }, { id: 'busca-2', terms: ['panela elétrica'] }];
  assert.equal(productMatchesSelection(automation, product, keywords), true);
  assert.equal(productMatchesSelection({ ...automation, keywordIds: ['busca-2'] }, product, keywords), false);
});

test('ordena pelo valor de comissão sem alterar a entrada', () => {
  const products = [{ id: 'menor', price: 50, commission: 5 }, { id: 'maior', price: 100, commission: 10 }];
  assert.deepEqual(orderProducts(products, 'commissionValueHigh').map((item) => item.id), ['maior', 'menor']);
  assert.deepEqual(products.map((item) => item.id), ['menor', 'maior']);
});

test('estima tempo com delays distintos para mensagens e grupos', () => {
  assert.equal(estimateDurationMinutes(2, 3, 60, 20), 5);
  assert.equal(estimateDurationMinutes(0, 3, 60, 20), 0);
});
