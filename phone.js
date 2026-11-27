const ui=globalThis.GramGrid;
export const el=id=>document.getElementById(id);
const val=(id,value)=>el(id).textContent=value;
const panels=["balance","receive","send","sendAmount","recipient","swap","history","contacts","review","tracking"];
const titles={home:"Wallet",send:"Send",receive:"Receive",swap:"Swap",balance:"Balance",history:"History",contacts:"Contacts",review:"Review",sign:"Sign",pending:"Pending",error:"Error"};
export function menu(open){
  for(const [id,icon] of [["recipient-contact","contacts"],["pick-qr","qr"]]){
    const canvas=el(id).querySelector("canvas");
    ui.icon(canvas.getContext("2d"),icon,16,16,2,"#b7ff90");
  }
  ui.actions.forEach((action,i)=>{
    const button=document.createElement("button"),canvas=document.createElement("canvas");
    canvas.width=64;canvas.height=64;ui.icon(canvas.getContext("2d"),action,32,32,4,"#b7ff90");
    button.setAttribute("aria-label",ui.labels[i]);button.title=ui.labels[i];button.append(canvas);
    button.onclick=()=>open(action);el("menu").append(button);
  });
}
function list(id,items,empty,fn){
  const root=el(id);root.replaceChildren();
  for(const item of items){const li=document.createElement("li");li.append(fn(item));root.append(li);}
  if(!items.length){const li=document.createElement("li");li.textContent=empty;root.append(li);}
}
export function phone(s,context){
  const {pending,receipt,busy,chooseContact}=context;
  const page=s.screen==="phone"?s.form:s.screen;
  const section=["done","pending","error"].includes(page)?"tracking":page==="sign"?"review":page;
  for(const id of panels)el(id).hidden=id!==section;
  el("menu").hidden=page!=="home"||!s.address;el("back").hidden=page==="home"||section==="review";
  const screen=el("mobile-screen");
  if(screen.dataset.page!==page){
    screen.dataset.page=page;el("page-content").scrollTop=0;
    const icon=({home:"balance",sendAmount:s.swapDraft?"swap":"send",recipient:"send",review:"check",sign:"check",pending:"history",done:"check",error:"warning"})[page]||page;
    const g=el("page-icon").getContext("2d");g.clearRect(0,0,64,64);
    ui.icon(g,ui.actions.includes(icon)||["check","warning"].includes(icon)?icon:"phone",32,32,4,"#b7ff90");
  }
  for(const control of screen.querySelectorAll("footer [data-page]"))control.hidden=control.dataset.page!==section;
  el("account").hidden=page!=="home";
  el("connect").hidden=page!=="home"&&context.unlocked;
  el("connect").className=context.unlocked?"quiet":"primary";
  el("home-value").hidden=!s.address||s.usd===null;
  val("home-value",s.usd===null?"":"≈ $"+s.usd.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
  val("title",({sendAmount:"Amount",recipient:"Recipient",done:s.successLabel})[page]||titles[page]||"Wallet");el("network").value=s.network;
  el("network").disabled=busy;el("connect").disabled=busy;
  val("who",s.address?s.address.slice(0,8)+"…"+s.address.slice(-8):"Wallet setup");
  val("connect",context.hasVault?(context.unlocked?"Lock":"Unlock"):"Create or restore wallet");
  el("asset").options[1].disabled=s.network!=="mainnet";
  el("asset-prev").disabled=el("asset-next").disabled=s.network!=="mainnet";
  if(page==="send")el("asset").selectedIndex=s.option;
  if(page==="swap")el("direction").selectedIndex=s.option;
  if(page==="sendAmount"){
    val("amount-label","Amount in "+s.sendAsset);
    const value=s.amountText??ui.amount(s.sendUnits,s.sendAsset);
    if(el("amount").value!==value)el("amount").value=value;
    val("choose-recipient",s.swapDraft?"Get quote":s.selectedContact?"Review transfer":"Choose recipient");
    el("choose-recipient").disabled=s.sendUnits===0n||busy;
    el("amount").disabled=busy;
  }
  if(page==="recipient")val("send-summary",ui.amount(s.sendUnits,s.sendAsset)+" "+s.sendAsset);
  val("back",s.sendMenu?"Back":"Back to menu");
  val("usd",s.usd===null?"—":"≈ $"+s.usd.toLocaleString("en-US",{maximumFractionDigits:2,minimumFractionDigits:2}));
  for(const asset of ["GRAM","USDT"])val(asset.toLowerCase(),s.holdings?ui.amount(s.holdings[asset],asset):"—");
  el("usdt-row").hidden=s.network!=="mainnet";
  val("address",s.address||"Create or restore a wallet on this phone.");
  el("qrbox").hidden=!s.qr; if(s.qr)el("qr").src=s.qr;else el("qr").removeAttribute("src");
  el("copy").disabled=el("share").disabled=!s.address;
  val("income",s.notice?"Received "+ui.amount(s.notice.units,s.notice.asset)+" "+s.notice.asset:"");
  list("activity",s.history,s.address?"No confirmed transfers yet":"Create or restore a wallet",t=>{
    const row=document.createElement("div"),date=document.createElement("span"),amount=document.createElement("strong");
    row.className="ledger-row";date.textContent=new Date(t.time*1000).toLocaleString("en-US");
    amount.textContent=(t.incoming?"+":"−")+ui.amount(t.units,t.asset)+" "+t.asset;
    row.append(date,amount);
    const peer=document.createElement("span");
    peer.className="ledger-peer";peer.textContent=ui.historyPeer(t);
    if(peer.textContent){peer.title=t.counterparty||(t.incoming?t.from:t.to);row.append(peer);}
    return row;
  });
  list("people",s.contacts,"No contacts yet",c=>{const b=document.createElement("button");b.textContent=c.name+" · "+c.address.slice(-7);b.onclick=()=>chooseContact(c);return b;});
  el("check-transfer").disabled=busy;
  el("choose-direction").disabled=s.network!=="mainnet"||busy;
  if(s.invoice && section==="review"){
    const t=s.invoice;val("kind",t.other?"Swap via STON.fi":"Transfer");
    val("total",ui.amount(t.units,t.asset)+" "+t.asset);
    val("details",t.other?"Estimated return ≈ "+ui.amount(t.output,t.other)+" "+t.other+"\nMinimum "+ui.amount(t.minimum,t.other)+" "+t.other+"\nExpires at "+new Date(t.expires*1000).toLocaleTimeString("en-US")+"\nRouter "+t.address:"Recipient\n"+t.address+(t.memo?"\nComment: "+t.memo:""));
    val("fee","Network "+s.network+" · Message amount "+ui.amount(BigInt(t.message.amount),"GRAM")+" GRAM. A separate network fee applies.");
  }
  el("sign").disabled=busy||Boolean(pending)||!s.address||!context.unlocked;
  const expired=pending?.expires<=Date.now()/1000;
  el("dismiss").hidden=page!=="pending"||busy||!expired;
  const link=page==="pending"?context.walletExplorer:page==="done"?receipt:"";
  el("explorer").hidden=!link;
  if(link)el("explorer").href=link;
  val("explorer",page==="pending"?"View wallet activity":s.network==="mainnet"?"View on gram.org":"View on Tonscan");
  let result="Waiting for on-chain confirmation.";
  if(s.retryingSubmission)result="TON Center is busy. Retrying automatically…";
  if(pending?.submissionError)result="Delivery is unconfirmed. "+pending.submissionError;
  if(expired)result="The signing window has expired. Checking whether the request reached the chain.";
  el("result").hidden=page==="done";
  val("result",page==="error"?s.error:page==="done"?"":result);
  val("status",(page==="sendAmount"&&s.amountNote)||s.message||(page==="review"&&pending?"A previous transaction is pending. View its status before signing.":"")||(s.address&&!context.unlocked?"Unlock your wallet on your phone to send funds.":"")||(s.network==="testnet"&&page==="swap"?"The GRAM/USDT pair is available on Mainnet.":""));
}
