import assert from "node:assert/strict";
import test from "node:test";
import {setImmediate as flush} from "node:timers/promises";
import {broadcast} from "./chain.js";

test("rate-limited submissions wait and reuse the same signed message",async t=>{
  const start=1800000000000;
  t.mock.timers.enable({apis:["Date","setTimeout"],now:start});
  const requests=[],responses=[
    new Response(null,{status:429,headers:{"Retry-After":"5"}}),
    new Response(null,{status:429}),
    new Response(null,{status:200}),
  ];
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    requests.push({url,body:options.body,time:Date.now()});
    return responses.shift();
  });
  let retries=0;
  const submitted=broadcast("mainnet","signed-message",start/1000+60,()=>retries++);
  await flush();
  t.mock.timers.tick(4999);await flush();
  assert.equal(requests.length,1);
  t.mock.timers.tick(1);await flush();
  t.mock.timers.tick(4000);await submitted;
  assert.equal(retries,2);
  assert.deepEqual(requests.map(r=>r.time-start),[0,5000,9000]);
  for(const req of requests){
    assert.equal(req.url,"https://toncenter.com/api/v3/message");
    assert.deepEqual(JSON.parse(req.body),{boc:"signed-message"});
  }
});

test("a request expiring during Retry-After is never posted again",async t=>{
  const start=1800000200000;
  t.mock.timers.enable({apis:["Date","setTimeout"],now:start});
  const post=t.mock.method(globalThis,"fetch",async()=>new Response(null,{
    status:429,headers:{"Retry-After":new Date(start+60000).toUTCString()},
  }));
  const expired=assert.rejects(broadcast("mainnet","signed-message",start/1000+8),
    e=>e.rejected&&e.message.includes("expired"));
  await flush();
  t.mock.timers.tick(8000);await expired;
  assert.equal(post.mock.callCount(),1);
});

test("a lost response after a 429 leaves delivery unconfirmed",async t=>{
  const start=1800000400000;
  t.mock.timers.enable({apis:["Date","setTimeout"],now:start});
  let attempts=0;
  t.mock.method(globalThis,"fetch",async()=>{
    if(++attempts===1)return new Response(null,{status:429});
    throw new TypeError("Network connection lost");
  });
  const unknown=assert.rejects(broadcast("mainnet","signed-message",start/1000+60),
    e=>!e.rejected&&e.message==="Network connection lost");
  await flush();
  t.mock.timers.tick(2000);await unknown;
  assert.equal(attempts,2);
});
