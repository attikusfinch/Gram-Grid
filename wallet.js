import "./wallet-ui.js";
import {phoneWallet} from "./onboarding.js";
import {signedTransfer,walletContract} from "./local-wallet.js";
import QRCode from "qrcode";
import {paymentQR} from "./payment-qr.js";
import {display} from "./display.js";
import {browserDisplay} from "./browser-emulator.js";
import {el,menu,phone} from "./phone.js";
import {balances,broadcast,signingState,confirmed,expiredBeforeDeployment,friendly,history,maxFeeReserve,maxSwap,maxTransfer,messageHash,networks,one,rates,same,transferMessage,units} from "./chain.js";
import {readQR} from "./scan.js";

const ui=globalThis.GramGrid,s=ui.create();
s.needsPhone=true;
s.network=localStorage.getItem("gg.network")==="testnet"?"testnet":"mainnet";
let pending=null,receipt="",busy=false,epoch=0,reading=-1,seen=null,quoteTask=0;
const previousPages=[];
let amountEdit=0;
const local=phoneWallet(()=>{
  const address=local.pub?walletContract(local.pub,s.network).address.toString({bounceable:false,testOnly:s.network==="testnet"}):"";
  if(address!==s.address)account(address);
  else render();
});
const localEmulator=location.hostname==="127.0.0.1"&&new URLSearchParams(location.search).get("emulator")==="1";
const glasses=(localEmulator?browserDisplay:display)(s,gesture,e=>{console.warn("G2",e.message);});
const now=()=>Math.floor(Date.now()/1000);
const key=(name)=>"gg."+name+"."+s.network+"."+s.address;
const stored=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
function render(){
  s.sendMenu=["send","sendAmount","recipient"].includes(s.screen)||s.screen==="phone"&&s.form==="recipient"||
    s.screen==="contacts"&&["recipient","phone"].includes(previousPages.at(-1)?.screen)||s.screen==="review"&&Boolean(s.invoice)||s.screen==="swap"&&s.network==="mainnet";
  s.locked=Boolean(local.pub)&&!local.unlocked();
  if(s.screen==="home"){el("transfer").reset();s.usedMax=false;}
  phone(s,{pending,receipt,busy,chooseContact,walletExplorer:s.address?networks[s.network].explorer+"/"+s.address:"",unlocked:local.unlocked(),hasVault:Boolean(local.pub)});
  el("resume").hidden=!pending||s.screen==="pending";
  glasses.paint();
}
function remember(screen,option,next){
  if(["home","pending","done"].includes(next))previousPages.length=0;
  else if(next!==screen&&!["home","review","sign","pending","done","error"].includes(screen))previousPages.push({screen,option});
}
function page(id,{option=0,back=false}={}){
  if(!s.address&&id!=="home"&&id!=="error")id="home";
  if(!back)remember(s.screen,s.option,id);
  quoteTask++;s.message="";ui.enter(s,id);
  s.option=option;
  const index=ui.actions.indexOf(id);if(index>=0)s.focus=index;
  if(!["review","sign"].includes(id))s.invoice=null;
  render();
}
function err(e){s.error=e.message||String(e);page("error");}
function notify(msg){s.message=msg;render();}
function account(address){
  epoch++;quoteTask++;seen=null;pending=null;receipt="";busy=false;
  el("transfer").reset();el("save").reset();
  Object.assign(s,{address,holdings:null,history:[],notice:null,usd:null,qr:null,receiveAsset:"GRAM",invoice:null,contacts:stored("gg.contacts."+s.network,[])});
  pending=address?stored(key("pending"),null):null;
  page(pending?"pending":"home");
  if(!address)return;
  updateQr();
  void refresh();
}
function updateQr(){
  try{
    const link=s.address;
    s.qr=paymentQR(QRCode.create(link).modules).toDataURL("image/png");
    render();
  }catch(e){s.qr=null;err(e);}
}
function requireWallet(){
  if(!s.address)throw Error("Create or restore a wallet on your phone.");
  if(!local.unlocked())throw Error("Unlock your wallet on your phone.");
}
async function refresh(){
  if(!s.address||reading===epoch)return;
  const generation=epoch,owner=s.address,network=s.network,record=pending;
  reading=generation;
  try{
    if(record?.hash){
      const match=await confirmed(network,owner,record);
      const expired=!match&&await expiredBeforeDeployment(network,owner,record);
      if(generation!==epoch)return;
      if(expired&&pending?.id===record.id){
        if(stored(key("pending"),null)?.id===record.id)localStorage.removeItem(key("pending"));
        pending=null;
        const message="The request expired before the wallet was activated. No funds were sent.";
        if(s.screen==="pending")err(Error(message));else notify(message);
      }
      if(match&&pending?.id===record.id){
        localStorage.removeItem(key("pending"));pending=null;
        const hex=/^[a-f0-9]{64}$/i.test(match.hash)?match.hash:Array.from(atob(match.hash),c=>c.charCodeAt(0).toString(16).padStart(2,"0")).join("");
        receipt=networks[network].explorer+"/transaction/"+hex;
        if(match.failed)err(Error("The transaction failed on-chain."));
        else{
          s.successLabel=record.other?"Swap successful":"Transfer successful";
          page("done");
        }
      }
    }
    const funds=await balances(network,owner);
    if(generation!==epoch)return;
    s.holdings=funds;render();
    const rows=await history(network,owner);
    if(generation!==epoch)return;
    if(seen)s.notice=rows.find(t=>t.incoming&&!seen.has(t.id))??s.notice;
    seen=new Set(rows.map(t=>t.id));s.history=rows;
    if(s.screen==="history")s.option=Math.min(s.option,Math.max(0,rows.length-1));
    const prices=network==="mainnet"?await rates().catch(()=>null):null;
    if(generation!==epoch)return;
    s.usd=prices?["GRAM","USDT"].reduce((total,a)=>total+Number(funds[a])/Number(one(a))*prices[a],0):null;
    if(s.message?.startsWith("TON Center"))s.message="";
    render();
  }catch(e){if(generation===epoch)notify("TON Center · "+e.message);}
  finally{if(reading===generation)reading=-1;}
}
function setForm(name){
  s.form=name;page("phone");
}
function chooseContact(c){
  if(!c)return;
  el("to").setCustomValidity("");el("to").value=c.address;
  if(s.sendMenu)void prepare(false).catch(err);
  else page("send");
}
async function scan(src,onLens=false){
  const version=s.revision,generation=epoch;
  const data=await src;
  if(!data||version!==s.revision||generation!==epoch)return;
  const invoice=await readQR(data);
  if(version!==s.revision||generation!==epoch)return;
  const address=friendly(invoice.address,s.network);
  if(invoice.asset==="USDT"&&!networks[s.network].usdt)throw Error("USDT is available on Mainnet.");
  if(invoice.assetSpecified&&invoice.asset!==s.sendAsset)throw Error("This QR requests "+invoice.asset+". Change the send currency first.");
  if(invoice.units!==null&&invoice.units!==s.sendUnits)throw Error("This QR requests "+ui.amount(invoice.units,invoice.asset)+" "+invoice.asset+". Change the amount first.");
  el("to").setCustomValidity("");el("to").value=address;
  if(invoice.memo)el("memo").value=invoice.memo;
  if(onLens)await prepare(false);
}
function acceptCurrency(){
  if(s.swapDraft&&s.network!=="mainnet"){err(Error("Swaps are available on Mainnet."));return;}
  const asset=s.option?"USDT":"GRAM";
  if(asset!==s.sendAsset){s.sendUnits=0n;s.amountText=null;s.usedMax=false;}
  s.sendAsset=asset;s.amountNote="";page("sendAmount");
}
async function editAmount(action){
  if(!s.sendMenu||busy)return;
  if(s.screen==="send"||s.screen==="swap")acceptCurrency();
  if(s.screen!=="sendAmount"){
    const index=previousPages.findLastIndex(p=>p.screen==="sendAmount");
    if(index>=0)previousPages.splice(index);
    page("sendAmount",{back:true});
  }
  const edit=++amountEdit,revision=s.revision;
  s.usedMax=false;s.amountText=null;s.amountNote="";
  if(action==="maxAmount"){
    s.sendUnits=0n;s.amountNote="Checking balance…";render();
    try{
      const funds=await balances(s.network,s.address);
      if(edit!==amountEdit||revision!==s.revision)return;
      if(s.swapDraft){
        const asset=s.sendAsset;
        if(funds[asset]>0n&&funds.GRAM>maxFeeReserve){
          s.amountNote="Checking swap costs…";render();
          const {swapQuote}=await import("./swap.js");
          const quote=await swapQuote(s.address,asset,funds[asset],funds.jettonWallet);
          if(edit!==amountEdit||revision!==s.revision)return;
          s.sendUnits=maxSwap(funds,asset,quote);
        }
        s.amountNote=!funds[asset]?"No "+asset+" available":s.sendUnits?"Max after swap costs":"Not enough GRAM for swap fees";
      }else{
        s.sendUnits=maxTransfer(funds,s.sendAsset);
        s.amountNote=s.sendAsset==="GRAM"?"Fee reserve: "+ui.amount(maxFeeReserve,"GRAM")+" GRAM":funds.USDT>0n&&!s.sendUnits?"Not enough GRAM for fees":"Available USDT balance";
      }
      s.usedMax=true;
    }catch{if(edit!==amountEdit||revision!==s.revision)return;s.amountNote="Max unavailable. Try again.";}
  }else if(action==="resetAmount")s.sendUnits=0n;
  else ui.adjustSend(s,action);
  render();
}
function gesture(input){
  if(typeof input==="number"||input==="resetAmount"||input==="maxAmount"){void editAmount(input);return;}
  if(input==="menuBack"){
    if(!s.address||el("setup").open||s.screen==="home")return;
    const prior=previousPages.pop();
    local.touch();page(prior?.screen||"home",{option:prior?.option||0,back:true});
    return;
  }
  if(input==="home"||input==="lock"){
    if(input==="lock"){
      if(!s.address||el("setup").open)return;
      local.lock();
    }else local.touch();
    page("home");
    return;
  }
  if(busy||el("setup").open)return;
  if(!s.address){if(input==="back")void glasses.close();return;}
  local.touch();
  const original=s.screen,option=s.option,effect=ui.apply(s,input);
  if(typeof effect==="number"){void editAmount(effect);return;}
  if(effect==="exit"){void glasses.close();return;}
  if(effect==="chooseCurrency")acceptCurrency();
  else if(effect==="chooseRecipient"||effect==="quote"){
    if(s.sendUnits<=0n){s.amountNote="Choose an amount above zero";render();}
    else if(effect==="quote")void prepare(true).catch(err);
    else page("recipient");
  }
  else if(effect==="manual")setForm("recipient");
  else if(effect==="camera"){
    const revision=s.revision;
    void scan(glasses.capture(),true).catch(e=>{if(revision===s.revision)err(e);});
  }
  else if(effect==="pickContact"){page("contacts");if(!s.contacts.length){s.message="Add a contact on your phone.";render();}}
  else if(effect==="contact"){
    chooseContact(s.contacts[s.option]);
  }
  else if(effect==="handoff"){void sign().catch(err);}
  else{if(original!==s.screen){remember(original,option,s.screen);quoteTask++;s.message="";if(!["review","sign"].includes(s.screen))s.invoice=null;}render();}
}
async function prepare(isSwap){
  requireWallet();
  if(busy)return;
  const generation=epoch,task=++quoteTask,network=s.network,owner=s.address;
  const asset=s.sendAsset,n=s.sendUnits;
  let address=null;
  if(!isSwap){
    try{address=friendly(el("to").value,network);}
    catch{el("to").setCustomValidity("Enter a valid "+network+" TON address.");el("to").reportValidity();return;}
  }
  const memo=el("memo").value.trim();
  if(isSwap && network!=="mainnet")throw Error("Swaps are available on Mainnet.");
  busy=true;notify(isSwap?"Requesting a STON.fi quote…":"Checking balance…");
  try{
    const b=await balances(network,owner);
    if(generation!==epoch||task!==quoteTask)return;
    if(b[asset]<n)throw Error("Insufficient balance "+asset+".");
    if(!isSwap&&s.usedMax&&n>maxTransfer(b,asset))throw Error("Balance changed. Select Max again.");
    let tx;
    if(isSwap){const {swapQuote}=await import("./swap.js");tx=await swapQuote(owner,asset,n,b.jettonWallet);}
    else{
      tx={asset,units:n,address,memo,expires:now()+300};
      tx.message=transferMessage(network,owner,tx,b,memo);
    }
    if(generation!==epoch||task!==quoteTask)return;
    if(isSwap&&n>maxSwap(b,asset,tx))throw Error("Not enough GRAM for this quote and its fees. Adjust the amount or select Max again.");
    if(b.GRAM<=BigInt(tx.message.amount))throw Error("Not enough GRAM for the transaction and fees.");
    s.invoice=tx;page("review");
  }catch(e){if(generation===epoch&&task===quoteTask)throw e;}
  finally{if(generation===epoch){busy=false;if(task===quoteTask)s.message="";render();}}
}
async function sign(){
  requireWallet();
  if(busy||pending||!s.invoice||s.screen!=="review")return;
  if(!navigator.locks)throw Error("Open the wallet in a secure, up-to-date WebView to sign.");
  const tx=s.invoice,network=s.network,owner=s.address,generation=epoch,revision=s.revision,storageKey=key("pending");
  busy=true;render();
  try{
    await navigator.locks.request(storageKey,{ifAvailable:true},async lock=>{
      if(revision!==s.revision)return;
      if(!lock)throw Error("This wallet is already sending a transfer.");
      pending=stored(storageKey,null);
      if(pending){page("pending");return;}
      const state=await signingState(network,owner);
      if(generation!==epoch||revision!==s.revision||s.invoice!==tx)return;
      const boc=local.withSeed(seed=>signedTransfer(seed,network,owner,tx,state));
      const rec={id:crypto.randomUUID(),time:now(),expires:tx.expires,asset:tx.asset,units:String(tx.units),other:tx.other,minimum:tx.other?String(tx.minimum):null,address:tx.address,memo:tx.memo||"",hash:messageHash(boc)};
      localStorage.setItem(storageKey,JSON.stringify(rec));
      pending=rec;receipt="";page("pending");
      try{await broadcast(network,boc);}
      catch(e){
        if(generation!==epoch||pending?.id!==rec.id)return;
        if(e.rejected){
          if(stored(storageKey,null)?.id===rec.id)localStorage.removeItem(storageKey);
          pending=null;err(Error("Submission rejected. "+e.message));return;
        }
        rec.submissionError=e.message||"Network connection lost.";
        if(stored(storageKey,null)?.id===rec.id)localStorage.setItem(storageKey,JSON.stringify(rec));
      }
      void refresh();
    });
  }catch(e){if(revision===s.revision)throw e;}
  finally{busy=false;render();}
}
function handle(fn){return async e=>{e?.preventDefault();try{await fn();}catch(error){err(error);}};}
menu(page);account("");
el("connect").onclick=handle(async()=>{if(local.unlocked())local.lock();else await local.open();});
local.load().catch(e=>notify(e.message));
document.addEventListener("pointerdown",e=>{if(e.isTrusted)local.touch();});
el("network").onchange=handle(()=>{
  if(busy)return;const next=el("network").value;s.network=next;localStorage.setItem("gg.network",next);
  account(local.pub?walletContract(local.pub,next).address.toString({bounceable:false,testOnly:next==="testnet"}):"");
});
el("back").onclick=()=>s.sendMenu?gesture("menuBack"):page("home");el("cancel").onclick=()=>page("home");el("resume").onclick=()=>page("pending");
el("transfer").onsubmit=handle(()=>prepare(false));el("sign").onclick=handle(sign);
el("to").oninput=()=>el("to").setCustomValidity("");
el("pick-qr").onclick=()=>el("file").click();
el("dismiss").onclick=()=>{if(pending?.expires>now()){notify("Wait until the request expires before dismissing it.");return;}if(!busy&&confirm("Stop tracking? The signed transaction may still go through.")){localStorage.removeItem(key("pending"));pending=null;page("home");}};
el("copy").onclick=handle(async()=>{await navigator.clipboard.writeText(s.address);notify("Address copied.");});
el("asset").onchange=el("direction").onchange=e=>{
  s.option=e.target.selectedIndex;render();
};
el("asset-prev").onclick=el("direction-prev").onclick=()=>gesture("prev");el("asset-next").onclick=el("direction-next").onclick=()=>gesture("next");
el("choose-currency").onclick=el("choose-direction").onclick=el("choose-recipient").onclick=()=>gesture("click");
el("amount-prev").onclick=()=>editAmount(-1);el("amount-next").onclick=()=>editAmount(1);
el("amount-max").onclick=()=>editAmount("maxAmount");
el("amount").oninput=()=>{
  amountEdit++;s.usedMax=false;s.amountText=el("amount").value;s.amountNote="";
  try{s.sendUnits=units(s.amountText,s.sendAsset);}
  catch(e){s.sendUnits=0n;if(s.amountText&&s.amountText!=="0")s.amountNote=e.message;}
  render();
};
let swipeStart;
el("sendAmount").addEventListener("touchstart",e=>{const t=e.touches[0];swipeStart=[t.clientX,t.clientY];},{passive:true});
el("sendAmount").addEventListener("touchend",e=>{
  if(!swipeStart)return;
  const t=e.changedTouches[0],dx=t.clientX-swipeStart[0],dy=t.clientY-swipeStart[1];swipeStart=null;
  const movement=Math.abs(dy)>Math.abs(dx)?-dy:dx;
  if(Math.abs(movement)>32){if(e.cancelable)e.preventDefault();void editAmount(movement>0?1:-1);}
},{passive:false});
el("sendAmount").addEventListener("touchcancel",()=>{swipeStart=null;});
el("recipient-contact").onclick=()=>page("contacts");
el("share").onclick=handle(async()=>{const text=s.address;if(navigator.share){try{await navigator.share({text});}catch(e){if(e.name!=="AbortError")throw e;}}else{await navigator.clipboard.writeText(text);notify("Address copied.");}});
el("file").onchange=handle(async()=>{const f=el("file").files[0];if(!f)return;const url=URL.createObjectURL(f);try{await scan(url);}finally{URL.revokeObjectURL(url);el("file").value="";}});
el("save").onsubmit=handle(()=>{const name=el("name").value.trim(),address=friendly(el("contactAddress").value,s.network);if(!name)throw Error("Enter a name.");s.contacts=s.contacts.filter(c=>!same(c.address,address)).concat({name,address});localStorage.setItem("gg.contacts."+s.network,JSON.stringify(s.contacts));el("save").reset();render();});
setInterval(()=>{if(!document.hidden)void refresh();},20000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh();});
void glasses.start().catch(e=>console.warn("Even Hub",e.message));
