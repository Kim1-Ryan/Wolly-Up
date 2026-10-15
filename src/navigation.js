const prefix = 'wolly-up-navigation:';
const defaults = { view:'feed',profileId:null,roomId:null,searchTerm:'',searchType:'all',sortBy:'newest',maxBudget:null };
const id = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : null;
export function cleanNavigation(value) {
  if (!value || typeof value!=='object') return {...defaults};
  const view=['feed','profileFeed','messages'].includes(value.view)?value.view:'feed';
  return {
    view,profileId:view==='profileFeed'?id(value.profileId):null,roomId:view==='messages'?id(value.roomId):null,
    searchTerm:typeof value.searchTerm==='string'?value.searchTerm.slice(0,200):'',
    searchType:['all','profiles','listings'].includes(value.searchType)?value.searchType:'all',
    sortBy:['newest','oldest','title','price-low','price-high'].includes(value.sortBy)?value.sortBy:'newest',
    maxBudget:typeof value.maxBudget==='number' && Number.isFinite(value.maxBudget) && value.maxBudget>=0?value.maxBudget:null
  };
}
export function readNavigation(userId) {
  try { return cleanNavigation(JSON.parse(sessionStorage.getItem(prefix+userId))); }
  catch { return {...defaults}; }
}
export function saveNavigation(userId, value) {
  try { sessionStorage.setItem(prefix+userId,JSON.stringify(cleanNavigation(value))); } catch { /* Storage may be blocked. */ }
}
export function clearNavigation(userId) {
  try { sessionStorage.removeItem(prefix+userId);sessionStorage.removeItem(`${prefix}${userId}:booking`); } catch { /* Storage may be blocked. */ }
}
export function readOpenBooking(userId) {
  try { return id(sessionStorage.getItem(`${prefix}${userId}:booking`)); } catch { return null; }
}
export function saveOpenBooking(userId, bookingId) {
  try {
    if (id(bookingId)) sessionStorage.setItem(`${prefix}${userId}:booking`,bookingId);
    else sessionStorage.removeItem(`${prefix}${userId}:booking`);
  } catch { /* Storage may be blocked. */ }
}
