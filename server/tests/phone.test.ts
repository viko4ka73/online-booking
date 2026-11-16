import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRussianPhone} from '../../client/src/lib/phone';
test('Russian phone mask handles typing, pasting, country prefixes and partial values',()=>{
 for(const value of ['9991234567','79991234567','89991234567','+7 (999) 123-45-67'])assert.equal(formatRussianPhone(value),'+7 (999)(123)(45)(67)');
 assert.equal(formatRussianPhone(''),'');
 assert.equal(formatRussianPhone('7'),'+7');
 assert.equal(formatRussianPhone('+7 (99'),'+7 (99');
 assert.equal(formatRussianPhone('+7 (999)(123)(45)(6'),'+7 (999)(123)(45)(6');
 assert.equal(formatRussianPhone('+7 (999)(123)(45)(67)999'),'+7 (999)(123)(45)(67)');
});
