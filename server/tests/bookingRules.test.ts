import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleError,MAX_BOOKING_MINUTES} from '../src/booking';
import {bookingDurations,MAX_BOOKING_MINUTES as clientMax} from '../../client/src/lib/bookingDates';
test('rental duration is limited to five hours in client and server with thirty-minute steps',()=>{
 const now=new Date('2026-11-12T12:00:00Z'),date='2026-11-13';
 assert.equal(MAX_BOOKING_MINUTES,300);assert.equal(clientMax,300);
 assert.deepEqual(bookingDurations,[60,90,120,150,180,210,240,270,300]);
 for(const minutes of bookingDurations)assert.equal(scheduleError(date,minutes,now),null);
 for(const minutes of [0,30,61,299,301,330,900])assert.ok(scheduleError(date,minutes,now));
});
