import {Address, beginCell, Cell, loadMessage, storeMessage} from "@ton/core";

export const networks={
  mainnet:{id:"-239",base:"https://toncenter.com",explorer:"https://tonviewer.com",usdt:"EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"},
  testnet:{id:"-3",base:"https://testnet.toncenter.com",explorer:"https://testnet.tonviewer.com",usdt:null},
};
export const one=asset=>asset==="GRAM"?1000000000n:1000000n;
// Gram Grid keeps this margin for wallet fees when filling Max.
export const maxFeeReserve=20000000n;
export function maxSwap(balance,asset,quote){
  const attachment=BigInt(quote.message.amount)-(asset==="GRAM"?quote.units:0n);
  if(attachment<0n)throw Error("Invalid swap message amount.");
  const remaining=balance.GRAM-attachment-maxFeeReserve;
  if(remaining<0n)return 0n;
  return asset==="GRAM"?remaining:balance.USDT;
}
const jettonAttachment=50000000n;
export function maxTransfer(balance,asset){
  if(asset==="USDT")return balance.GRAM>=jettonAttachment+maxFeeReserve?balance.USDT:0n;
  return balance.GRAM>maxFeeReserve?balance.GRAM-maxFeeReserve:0n;
}
export function units(input,asset){
  const text=String(input).trim().replace(",",".");
  if(!/^\d{1,18}(\.\d+)?$/.test(text))throw Error("Enter a positive amount.");
  const [integer,frac=""]=text.split("."), digits=asset==="GRAM"?9:6;
  if(frac.length>digits)throw Error("Too many decimal places.");
  const n=BigInt(integer)*one(asset)+BigInt(frac.padEnd(digits,"0"));
  if(n<=0n)throw Error("Amount must be greater than zero.");
  return n;
}
export function friendly(value,network){
  if(!networks[network])throw Error("Unknown network.");
  const input=value.trim();
  const parsed=Address.isFriendly(input)?Address.parseFriendly(input):null;
  if(network==="mainnet"&&parsed?.isTestOnly)throw Error("This is a Testnet address. Switch to Testnet to use it.");
  const address=parsed?.address??Address.parse(input);
  return address.toString({testOnly:network==="testnet",bounceable:parsed?.isBounceable??false});
}
export const same=(a,b)=>Boolean(a&&b&&Address.parse(a).equals(Address.parse(b)));
// The public TON Center endpoint shares one request slot across reads and sends.
const nextSlot=new Map();
async function centerFetch(url,options={}){
  const origin=new URL(url).origin,time=Date.now();
  const start=Math.max(time,nextSlot.get(origin)??0);
  nextSlot.set(origin,start+1200);
  if(start>time)await new Promise(resolve=>setTimeout(resolve,start-time));
  return fetch(url,{...options,signal:AbortSignal.timeout(12000)});
}
async function get(net,route,params){
  const url=new URL(net.base+"/api/v3/"+route);
  for(const [key,val] of Object.entries(params)){
    for(const v of [].concat(val))url.searchParams.append(key,v);
  }
  for(let i=0;i<3;i++){
    const r=await centerFetch(url);
    if(r.ok)return r.json();
    if(r.status!==429||i===2)throw Error("TON Center HTTP "+r.status);
    await new Promise(resolve=>setTimeout(resolve,1200*(i+1)));
  }
}
export async function balances(network,address){
  const net=networks[network];
  const a=await get(net,"accountStates",{address,include_boc:false});
  if(!Array.isArray(a.accounts))throw Error("TON Center returned an invalid balance.");
  const account=a.accounts.find(x=>same(x.address,address));
  let wallet=null;
  if(net.usdt){
    const j=await get(net,"jetton/wallets",{owner_address:address,jetton_address:net.usdt,limit:2});
    if(!Array.isArray(j.jetton_wallets))throw Error("TON Center returned an invalid USDT balance.");
    wallet=j.jetton_wallets.find(x=>same(x.owner,address)&&same(x.jetton,net.usdt));
  }
  return {GRAM:BigInt(account?.balance??0),USDT:BigInt(wallet?.balance??0),jettonWallet:wallet?.address};
}
export async function signingState(network,address){
  const reply=await get(networks[network],"walletStates",{address});
  if(!Array.isArray(reply.wallets))throw Error("TON Center did not return the wallet state.");
  return reply.wallets.find(row=>same(row.address,address))??{status:"nonexist"};
}
export async function broadcast(network,boc){
  const response=await centerFetch(networks[network].base+"/api/v3/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({boc})});
  if(response.ok)return;
  const body=await response.json().catch(()=>null);
  const reason=String(body?.error||body?.result||response.statusText).slice(0,300);
  const error=Error("TON Center HTTP "+response.status+" · "+reason);
  error.rejected=[401,403,422,429].includes(response.status);
  throw error;
}
export async function expiredBeforeDeployment(network,owner,record){
  if(!record.expires||Date.now()/1000<=record.expires+30)return false;
  const url=new URL(networks[network].base+"/api/v2/getAddressInformation");
  url.searchParams.set("address",owner);
  const response=await centerFetch(url,{cache:"no-store"});
  if(!response.ok)throw Error("TON Center HTTP "+response.status);
  const data=await response.json();
  return data.ok===true&&data.result?.state==="uninitialized"&&data.result.sync_utime>record.expires+30;
}
export function transferRecord(a,net,owner){
  if(!a.success||a.finality!=="finalized")return null;
  const d=a.details;
  const native=a.type==="ton_transfer";
  if(!native && !(a.type==="jetton_transfer"&&same(d.asset,net.usdt)))return null;
  const from=native?d.source:d.sender, to=native?d.destination:d.receiver;
  if(!from||!to||(!same(to,owner)&&!same(from,owner)))return null;
  return {id:a.action_id,asset:native?"GRAM":"USDT",units:BigInt(native?d.value:d.amount),incoming:same(to,owner),
    from,to,comment:d.comment??"",time:a.end_utime,hash:a.trace_id};
}
export async function history(network,address){
  const net=networks[network];
  const j=await get(net,"actions",{account:address,action_type:["ton_transfer","jetton_transfer"],limit:32,sort:"desc"});
  return j.actions.map(a=>transferRecord(a,net,address)).filter(Boolean);
}
export async function rates(){
  const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,tether&vs_currencies=usd&include_last_updated_at=true",{signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error("The exchange rate is temporarily unavailable.");
  const j=await r.json(), gram=j["the-open-network"], usdt=j.tether;
  if(!(gram?.usd>0&&usdt?.usd>0&&Date.now()/1000-Math.min(gram.last_updated_at,usdt.last_updated_at)<300))throw Error("The exchange rate has expired.");
  return {GRAM:gram.usd,USDT:usdt.usd};
}
export function paymentLink(network,to,asset,n,memo=""){
  const addr=friendly(to,network), q=new URLSearchParams();
  if(asset==="USDT"){
    if(!networks[network].usdt)throw Error("USDT is available on Mainnet.");
    q.set("jetton",networks[network].usdt);
  }
  if(n)q.set("amount",n.toString());
  if(memo)q.set("text",memo);
  return "ton://transfer/"+addr+(q.size?"?"+q:"");
}
export function transferMessage(network,owner,tx,balance,memo){
  const net=networks[network], to=friendly(tx.address,network);
  const comment=beginCell().storeUint(0,32).storeStringTail(memo).endCell();
  if(tx.units<=0n||balance[tx.asset]<tx.units)throw Error("Insufficient balance.");
  if(tx.asset==="GRAM")return {address:to,amount:tx.units.toString(),payload:comment.toBoc().toString("base64")};
  if(!net.usdt||!balance.jettonWallet)throw Error("USDT is unavailable for this wallet.");
  const id=crypto.getRandomValues(new Uint32Array(2));
  const body=beginCell().storeUint(0x0f8a7ea5,32).storeUint((BigInt(id[0])<<32n)|BigInt(id[1]),64)
    .storeCoins(tx.units).storeAddress(Address.parse(to)).storeAddress(Address.parse(owner))
    .storeBit(false).storeCoins(1n).storeBit(true).storeRef(comment).endCell();
  return {address:Address.parse(balance.jettonWallet).toString({testOnly:network==="testnet"}),amount:jettonAttachment.toString(),payload:body.toBoc().toString("base64")};
}
export function messageHash(boc){
  const message=loadMessage(Cell.fromBase64(boc).beginParse());
  if(message.info.type!=="external-in")throw Error("Invalid wallet response.");
  return beginCell().store(storeMessage({...message,init:null,info:{...message.info,src:undefined,importFee:0n}},{forceRef:true})).endCell().hash().toString("base64");
}
export async function confirmed(network,owner,record){
  const net=networks[network];
  if(!record.hash)return null;
  const j=await get(net,"actions",{msg_hash:record.hash,limit:64});
  for(const a of j.actions){
    if(a.finality!=="finalized")continue;
    if(!a.success){
      const d=a.details;
      const failedSwap=record.other&&a.type==="jetton_swap"&&same(d.sender,owner);
      const failedTransfer=!record.other&&(a.type==="ton_transfer"?same(d.source,owner)&&same(d.destination,record.address):a.type==="jetton_transfer"&&same(d.sender,owner)&&same(d.receiver,record.address));
      if(failedSwap||failedTransfer)return {failed:true,hash:a.trace_id};
      continue;
    }
    if(record.other){
      if(!record.hash||a.type!=="jetton_swap")continue;
      const d=a.details, out=d.dex_outgoing_transfer, offered=d.dex_incoming_transfer;
      if(!same(d.sender,owner)||!a.success||!out||!offered||!same(out.destination,owner))continue;
      const matchesAsset=(coin,address)=>coin==="GRAM"?!address:same(address,net.usdt);
      if(matchesAsset(record.asset,offered.asset)&&matchesAsset(record.other,out.asset)&&BigInt(offered.amount)===BigInt(record.units)&&BigInt(out.amount)>=BigInt(record.minimum))return {hash:a.trace_id,output:out.amount};
    }else{
      const t=transferRecord(a,net,owner);
      if(t&&same(t.from,owner)&&same(t.to,record.address)&&t.asset===record.asset&&t.units===BigInt(record.units)&&t.comment===record.memo)return {hash:a.trace_id};
    }
  }
  return null;
}
