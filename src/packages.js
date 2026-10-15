export const packageLabel = pack => ({ single: '1 lesson', pack_5: '5 lessons', pack_10: '10 lessons' }[pack] || pack);
export const packageValidity = pack => pack === 'single' ? '' : 'Valid for 3 months · schedule all lessons within this window.';
export function sortOffers(offers) {
  const categories = { junior_individual: 0, adult_individual: 1, adult_group: 2 };
  const packs = { single: 0, pack_5: 1, pack_10: 2 };
  return [...offers].sort((a, b) => (categories[a.category] ?? 3) - (categories[b.category] ?? 3) || (packs[a.packSize] ?? 3) - (packs[b.packSize] ?? 3));
}
export const readablePackage = text => (text || '').replace(/pack[_ ]5/gi, '5 lessons').replace(/pack[_ ]10/gi, '10 lessons').replace(/\bsingle\b/gi, '1 lesson');
