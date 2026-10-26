import test from 'node:test';
import assert from 'node:assert/strict';
import { keywordValidationError } from '../keyword-rules.js';

test('aceita termos longos e lista negativa opcional', () => {
  assert.equal(keywordValidationError({ terms: ['secador de cabelo profissional', 'fone bluetooth'], negativeTerms: ['shampoo', 'bala'] }), null);
});

test('exige de duas a cinco palavras por termo', () => {
  assert.match(keywordValidationError({ terms: ['secador'] }), /2 a 5/);
  assert.match(keywordValidationError({ terms: ['um dois tres quatro cinco seis'] }), /2 a 5/);
});

test('limita palavras negativas a duzentas', () => {
  assert.equal(keywordValidationError({ terms: ['fone bluetooth'], negativeTerms: Array(200).fill('usado') }), null);
  assert.match(keywordValidationError({ terms: ['fone bluetooth'], negativeTerms: Array(201).fill('usado') }), /200/);
});
