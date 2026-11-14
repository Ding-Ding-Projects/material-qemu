import test from 'node:test';
import assert from 'node:assert/strict';
import { frameDimensions,recordingMime,RECORDING_LIMITS } from '../public/console-media.js';
test('console media rejects empty or oversized frame dimensions',()=>{assert.deepEqual(frameDimensions({width:720,height:400}),{width:720,height:400});for(const frame of [null,{width:0,height:10},{width:1.5,height:10},{width:10000,height:10000}])assert.throws(()=>frameDimensions(frame));});
test('recording selects only an advertised codec and keeps explicit limits',()=>{assert.equal(recordingMime(type=>type==='video/webm;codecs=vp8'),'video/webm;codecs=vp8');assert.equal(recordingMime(()=>false),null);assert.equal(RECORDING_LIMITS.milliseconds,30000);assert.equal(RECORDING_LIMITS.bytes,16777216);});
