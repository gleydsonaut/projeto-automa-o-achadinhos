export function keywordValidationError(value) {
  if (!Array.isArray(value.terms) || !value.terms.length) return 'Informe ao menos uma palavra-chave.';
  if(value.terms.length>200)return 'Use até 200 termos por busca.';
  if (value.terms.some((term) => typeof term !== 'string' || term.length > 120 || term.trim().split(/\s+/u).length < 2 || term.trim().split(/\s+/u).length > 5)) return 'Cada palavra-chave deve ter 2 a 5 palavras e até 120 caracteres.';
  if (value.negativeTerms && (!Array.isArray(value.negativeTerms) || value.negativeTerms.length > 200 || value.negativeTerms.some((term) => typeof term !== 'string' || !term.trim()))) return 'Informe até 200 palavras negativas válidas.';
  return null;
}
