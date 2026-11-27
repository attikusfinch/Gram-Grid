import test from "node:test";
import assert from "node:assert/strict";
import {Blockchain} from "@ton/sandbox";
import {Cell,toNano} from "@ton/core";
import {keyPairFromSeed} from "@ton/crypto";
import {deriveSeed,walletContract,signedTransfer} from "./local-wallet.js";

// Published BIP-39 test vector. Only used in the in-process blockchain.
const fixture=Array(11).fill("abandon").concat("about").join(" ");
test("a restored V5 wallet deploys on first spend and reuses it on subsequent payments",async()=>{
  const seed=await deriveSeed(fixture),publicKey=keyPairFromSeed(seed).publicKey.toString("hex");
  const main=walletContract(publicKey,"mainnet"),wallet=walletContract(publicKey,"testnet");
  assert(!main.address.equals(wallet.address));
  const chain=await Blockchain.create(),source=await chain.treasury("funding"),receiver=await chain.treasury("receiver");
  const contract=chain.openContract(wallet),owner=wallet.address.toString({testOnly:true});
  await source.send({to:wallet.address,bounce:false,value:toNano("2")});
  const tx={message:{address:receiver.address.toString({testOnly:true}),amount:String(toNano("0.3"))},expires:Math.floor(Date.now()/1000)+120};
  for(const seqno of [0,1]){
    const state=seqno?{status:"active",seqno,code_hash:wallet.init.code.hash().toString("base64"),is_signature_allowed:true}:{status:"uninit"};
    const boc=signedTransfer(seed,"testnet",owner,tx,state);
    const result=await chain.sendMessage(Cell.fromBase64(boc));
    assert.equal(await contract.getSeqno(),seqno+1);
    const delivered=result.transactions.find(t=>t.inMessage?.info.type==="internal"&&t.inMessage.info.dest.equals(receiver.address));
    assert.equal(delivered?.inMessage.info.value.coins,toNano("0.3"));
  }
  assert.throws(()=>signedTransfer(seed,"mainnet",owner,tx,{status:"uninit"}));
  assert.throws(()=>signedTransfer(seed,"testnet",owner,{...tx,expires:0},{status:"uninit"}));
  await assert.rejects(deriveSeed(Array(12).fill("abandon").join(" ")));
  seed.fill(0);
});
