export const packageLabel = pack => ({ single: '1 lesson', pack_5: '5 lessons', pack_10: '10 lessons' }[pack] || pack);
export const lessonCount = pack => ({ single: 1, pack_5: 5, pack_10: 10 }[pack] || 0);
export const validityOptions = pack => lessonCount(pack) >= 10 ? [1, 3, 6, 12] : [1, 3, 6];
export const validityMonths = offer => offer?.validityMonths ?? 3;
export const validPackageWindow = offer => lessonCount(offer.packSize) > 0 && validityOptions(offer.packSize).includes(validityMonths(offer));
export const validityLabel = months => months === 12 ? '1 year' : `${months} ${months === 1 ? 'month' : 'months'}`;
export const packageValidity = (pack, forLearner = false, months = 3) => pack === 'single' ? '' : `Valid for ${validityLabel(months)}${forLearner ? '. Schedule all lessons within this window.' : ''}`;

export function packageWindow(start, months) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || ![1,3,6,12].includes(months)) return null;
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== start) return null;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return { start, end: end.toISOString().slice(0,10) };
}
export const dateInWindow = (date, window) => Boolean(window && packageWindow(date, 1) && date >= window.start && date <= window.end);
export function windowMessage(window) {
  const format = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-ZA', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  return `Choose a date from ${format(window.start)} to ${format(window.end)}. All lessons must fit within your package’s validity period.`;
}
export function sortOffers(offers) {
  const categories = { junior_individual: 0, adult_individual: 1, adult_group: 2 };
  const packs = { single: 0, pack_5: 1, pack_10: 2 };
  return [...offers].sort((a, b) => (categories[a.category] ?? 3) - (categories[b.category] ?? 3) || (packs[a.packSize] ?? 3) - (packs[b.packSize] ?? 3));
}
export const readablePackage = text => (text || '').replace(/pack[_ ]5/gi, '5 lessons').replace(/pack[_ ]10/gi, '10 lessons').replace(/\bsingle\b/gi, '1 lesson');
