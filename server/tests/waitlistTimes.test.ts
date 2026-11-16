import test from 'node:test';
import assert from 'node:assert/strict';
import {isFutureWaitlistStart} from '../../client/src/lib/waitlist';
test('waitlist hides starts that are past, ongoing or exactly now using Moscow time',()=>{
 const now=new Date('2026-11-14T07:45:00Z').getTime();
 assert.equal(isFutureWaitlistStart('2026-11-14','09:00',now),false);
 assert.equal(isFutureWaitlistStart('2026-11-14','10:30',now),false);
 assert.equal(isFutureWaitlistStart('2026-11-14','11:00',now),true);
 const boundary=new Date('2026-11-14T08:00:00Z').getTime();
 assert.equal(isFutureWaitlistStart('2026-11-14','11:00',boundary),false);
 assert.equal(isFutureWaitlistStart('2026-11-14','11:30',boundary),true);
 assert.equal(isFutureWaitlistStart('2026-11-13','23:30',now),false);
 assert.equal(isFutureWaitlistStart('2026-11-15','00:00',now),true);
 assert.equal(isFutureWaitlistStart('invalid','10:00',now),false);
});
