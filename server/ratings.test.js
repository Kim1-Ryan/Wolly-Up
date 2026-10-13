import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileRatings, rankProfiles } from './ratings.js';

test('profiles rank by rating then review count, with unrated profiles last',()=>{
  const profiles=[
    {id:'unrated',name:'A',rating:null,reviewCount:0},
    {id:'popular',name:'B',rating:4.5,reviewCount:100},
    {id:'new',name:'C',rating:5,reviewCount:1},
    {id:'top',name:'D',rating:5,reviewCount:10}
  ];
  assert.deepEqual(rankProfiles(profiles).map(profile=>profile.id),['top','new','popular','unrated']);
  assert.equal(profiles[0].id,'unrated');
});

test('profile ratings average reviews received from the other booking participant', async () => {
  const reviews = [{ rating: 5, comment: 'Great lesson' }, { rating: 4, comment: '' }];
  const pool = { async query(sql, values) {
    assert.deepEqual(values, ['recipient']);
    assert.match(sql, /b.learner_id=\$1 AND f.user_id=b.coach_id/);
    assert.match(sql, /b.coach_id=\$1 AND f.user_id=b.learner_id/);
    return { rows: reviews };
  } };
  assert.deepEqual(await profileRatings(pool, 'recipient'), { reviews, reviewCount: 2, rating: 4.5 });
});

test('unreviewed profiles have no rating rather than a zero-star rating', async () => {
  assert.deepEqual(await profileRatings({ query: async () => ({ rows: [] }) }, 'new-profile'),
    { reviews: [], reviewCount: 0, rating: null });
});
