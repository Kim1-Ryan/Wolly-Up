import test from 'node:test';
import assert from 'node:assert/strict';
import { readNavigation,saveNavigation,clearNavigation,readOpenBooking,saveOpenBooking } from '../src/navigation.js';

const profileId='11111111-1111-4111-8111-111111111111';
const roomId='22222222-2222-4222-8222-222222222222';
const bookingId='33333333-3333-4333-8333-333333333333';
function storage(run) {
  const original=globalThis.sessionStorage;
  const values=new Map();
  globalThis.sessionStorage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try { run(values); } finally {globalThis.sessionStorage=original;}
}

test('refresh restores own profile, external profile and an open conversation',()=>storage(()=>{
  for(const navigation of [{view:'profileFeed'},{view:'profileFeed',profileId},{view:'messages',roomId}]) {
    saveNavigation('user',navigation);
    const restored=readNavigation('user');
    assert.equal(restored.view,navigation.view);
    assert.equal(restored.profileId,navigation.profileId ?? null);
    assert.equal(restored.roomId,navigation.roomId ?? null);
  }
}));

test('feed search, sorting and budget survive a reload without saving profile data',()=>storage(values=>{
  const navigation={view:'feed',searchTerm:'junior',searchType:'listings',sortBy:'price-low',maxBudget:1000};
  saveNavigation('user',{...navigation,profile:{email:'private@example.com'},sessionToken:'private-token'});
  const restored=readNavigation('user');
  for(const [key,value] of Object.entries(navigation))assert.equal(restored[key],value);
  assert.equal([...values.values()].some(value=>value.includes('private')),false);
}));

test('navigation is scoped per account and logout clears the saved page and booking',()=>storage(()=>{
  saveNavigation('first',{view:'messages',roomId});
  saveOpenBooking('first',bookingId);
  assert.equal(readNavigation('second').view,'feed');
  assert.equal(readOpenBooking('second'),null);
  assert.equal(readOpenBooking('first'),bookingId);
  clearNavigation('first');
  assert.equal(readNavigation('first').view,'feed');
  assert.equal(readOpenBooking('first'),null);
}));

test('invalid saved navigation and blocked storage fall back safely',()=>storage(values=>{
  values.set('wolly-up-navigation:user','invalid JSON');
  assert.equal(readNavigation('user').view,'feed');
  saveNavigation('user',{view:'invalid',profileId:'bad',roomId:'bad',sortBy:'bad',maxBudget:-10});
  assert.equal(readNavigation('user').view,'feed');
  assert.equal(readNavigation('user').maxBudget,null);
  globalThis.sessionStorage={getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');},removeItem(){throw new Error('Blocked');}};
  assert.doesNotThrow(()=>saveNavigation('user',{view:'messages'}));
  assert.doesNotThrow(()=>clearNavigation('user'));
  assert.equal(readNavigation('user').view,'feed');
}));
