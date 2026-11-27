// Shared pixel artwork and interaction state for the device and offline workbench.
(() => {
  const actions = ["send", "receive", "swap", "balance", "history", "contacts"];
  const labels = ["Send", "Receive", "Swap", "Balance", "History", "Contacts"];
  const historyDate=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"});
  // Each stroke follows the same 16 × 16 grid. Straight segments use a two-pixel nib.
  const paths = {
    previous: [[[10,2],[4,8],[10,14]]], next: [[[5,2],[11,8],[5,14]]],
    up: [[[2,10],[8,4],[14,10]]], down: [[[2,5],[8,11],[14,5]]],
    send: [[[3,12],[12,3]],[[5,3],[12,3],[12,10]]],
    receive: [[[12,3],[3,12]],[[3,5],[3,12],[10,12]]],
    swap: [[[1,4],[13,4],[10,1]],[[14,10],[2,10],[5,13]]],
    balance: [[[2,4],[12,4],[12,2],[4,2],[2,4],[2,12],[13,12],[13,5]],[[13,7],[9,7],[9,9],[13,9]]],
    history: [[[1,6],[4,3],[6,2],[10,2],[14,6],[14,10],[10,14],[6,14],[3,12]],[[1,3],[1,7],[5,7]],[[8,5],[8,8],[10,10]]],
    contacts: [[[5,2],[10,2],[10,6],[8,8],[7,8],[5,6],[5,2]],[[2,13],[2,11],[5,9],[10,9],[13,11],[13,13],[2,13]]],
    camera: [[[1,5],[4,5],[5,3],[9,3],[11,5],[14,5],[14,12],[1,12],[1,5]],[[6,7],[9,7],[9,10],[6,10],[6,7]]],
    qr: [[[1,1],[5,1],[5,5],[1,5],[1,1]],[[9,1],[13,1],[13,5],[9,5],[9,1]],[[1,9],[5,9],[5,13],[1,13],[1,9]],[[9,8],[9,11],[11,11],[11,13],[14,13]],[[13,8],[14,8]]],
    phone: [[[4,1],[11,1],[11,14],[4,14],[4,1]],[[7,11],[8,11]]],
    check: [[[2,8],[6,12],[13,4]]], close: [[[3,3],[12,12]],[[12,3],[3,12]]],
    empty: [[[3,8],[12,8]]], warning: [[[1,13],[7,2],[8,2],[14,13],[1,13]],[[7,7],[7,9]],[[7,11],[7,11]]],
  };
  function icon(g, name, cx, cy, scale, color) {
    const ox=cx-8*scale, oy=cy-8*scale;
    g.fillStyle=color;
    for(const path of paths[name]){
      for(let i=1;i<path.length;i++){
        const [x,y]=path[i-1], [u,v]=path[i], steps=Math.max(1,Math.abs(u-x),Math.abs(v-y));
        for(let j=0;j<=steps;j++) g.fillRect(ox+Math.round(x+(u-x)*j/steps)*scale,oy+Math.round(y+(v-y)*j/steps)*scale,2*scale,2*scale);
      }
    }
  }
  function corners(g,x,y,w,h){
    g.fillStyle="#fff";
    for(const top of [0,h-3])for(const left of [0,w-3]){
      g.fillRect(x+left-(left?12:0),y+top,15,3);
      g.fillRect(x+left,y+top-(top?12:0),3,15);
    }
  }
  const unit=asset=>asset==="GRAM"?1000000000n:1000000n;
  function amount(n,asset){
    const u=unit(asset),frac=(n%u).toString().padStart(u.toString().length-1,"0").replace(/0+$/,"");
    return (n/u).toString()+(frac?"."+frac:"");
  }
  function create(){
    return {screen:"home",focus:0,option:0,invoice:null,holdings:null,usd:null,address:"",network:"mainnet",history:[],contacts:[],notice:null,error:"",revision:0};
  }
  function enter(s,screen){
    if(screen==="swap"||screen==="send")s.swapDraft=screen==="swap";
    if(screen==="home"||s.screen==="home"){s.sendAsset="GRAM";s.sendUnits=0n;s.amountText=null;}
    s.screen=screen;s.option=0;s.revision++;
  }
  function adjustSend(s,tenths){
    s.amountText=null;s.amountNote="";
    const scale=unit(s.sendAsset),value=s.sendUnits+BigInt(tenths)*scale/10n;
    const maximum=10n**18n*scale-1n;
    s.sendUnits=value<0n?0n:value>maximum?maximum:value;
  }
  function apply(s,input){
    if(input==="back"){
      if(s.screen==="home")return "exit";
      enter(s,"home");return;
    }
    const delta=input==="next"?1:input==="prev"?-1:0;
    if(s.screen==="home"){
      if(delta)s.focus=(s.focus+6+delta)%6;
      else if(input==="click")enter(s,actions[s.focus]);
      return;
    }
    if(delta){
      if(["swap","review"].includes(s.screen))s.option=1-s.option;
      if(s.screen==="send"&&s.network==="mainnet")s.option=1-s.option;
      if(s.screen==="sendAmount")return -delta;
      if(s.screen==="recipient")s.option=(s.option+3+delta)%3;
      if(s.screen==="contacts"&&s.contacts.length)s.option=(s.option+s.contacts.length+delta)%s.contacts.length;
      if(s.screen==="history"&&s.history.length)s.option=(s.option+s.history.length+delta)%s.history.length;
      return;
    }
    if(input!=="click")return;
    if(s.screen==="send"||s.screen==="swap")return "chooseCurrency";
    if(s.screen==="sendAmount")return s.swapDraft?"quote":"chooseRecipient";
    if(s.screen==="recipient")return ["pickContact","camera","manual"][s.option];
    if(s.screen==="contacts"&&s.contacts.length)return "contact";
    if(s.screen==="review"){
      if(s.option){enter(s,"home");return;}
      return "handoff";
    }
    if(s.screen==="error"){enter(s,actions[s.focus]);return;}
    enter(s,"home");
  }
  function draw(canvas,s,ink="#fff"){
    const g=canvas.getContext("2d");g.clearRect(0,0,576,288);g.textAlign="center";g.textBaseline="middle";
    function text(str,y,size=27){g.font="600 "+size+"px sans-serif";g.fillStyle=ink;g.fillText(str,288,y,530);}
    function symbol(name,x,y,z){icon(g,name,x,y,z,ink);}
    if(s.screen==="home"){
      if(s.needsPhone&&!s.address){symbol("phone",288,104,6);text("Set up your wallet on your phone",207,28);return;}
      actions.forEach((act,i)=>{
        const x=16+(i%3)*184,y=Math.floor(i/3)*116;
        symbol(act,x+88,y+58,4);
        if(i===s.focus)corners(g,x+5,y+8,166,100);
      });
      text(labels[s.focus]+(s.locked?" · Locked":""),264,30);return;
    }
    if(s.screen==="send"){
      symbol("send",288,60,4);
      if(s.network==="mainnet"){symbol("previous",100,150,2);symbol("next",476,150,2);}
      text(s.option?"USDT":"GRAM",150,45);text("Choose currency",238,27);return;
    }
    if(s.screen==="sendAmount"){
      symbol(s.swapDraft?"swap":"send",288,55,4);symbol("down",55,149,2);symbol("up",521,149,2);
      g.font="600 40px sans-serif";g.fillStyle=ink;g.fillText(amount(s.sendUnits,s.sendAsset)+" "+s.sendAsset,288,150,397);
      text(s.amountNote||(s.swapDraft?"Swap to "+(s.sendAsset==="GRAM"?"USDT":"GRAM"):"Amount"),235,27);return;
    }
    if(s.screen==="recipient"){
      ["contacts","camera","phone"].forEach((name,i)=>symbol(name,104+i*184,141,4));
      corners(g,27+s.option*184,76,154,130);
      text(["Choose contact","Scan QR code","Enter address"][s.option],264,30);return;
    }
    if(s.screen==="review"){
      const tx=s.invoice;symbol(tx.other?"swap":"send",288,40,3);
      text(amount(tx.units,tx.asset)+" "+tx.asset,96,37);
      text(tx.other?"≥ "+amount(tx.minimum,tx.other)+" "+tx.other:tx.address.slice(0,7)+"…"+tx.address.slice(-7),140);
      text(s.network.toUpperCase()+" · "+amount(BigInt(tx.message.amount),"GRAM")+" GRAM"+(tx.memo?" · "+tx.memo:""),170,18);
      symbol("check",207,216,3);symbol("close",369,216,3);
      corners(g,s.option?321:159,184,96,64);
      text(s.option?"Cancel":tx.other?"Confirm swap":"Confirm transfer",269,26);return;
    }
    if(s.screen==="error"){symbol("warning",288,94,5);text(s.error,188);return;}
    if(s.screen==="pending"){
      symbol("history",288,100,6);
      text("Transaction pending",205,30);
      if(s.retryingSubmission)text("Retrying automatically…",247,22);
      return;
    }
    if(s.screen==="phone"||s.screen==="sign"){symbol("phone",288,128,6);return;}
    if(s.screen==="done"){
      symbol("check",288,110,6);text(s.successLabel,205,30);return;
    }
    symbol(s.screen,288,58,4);
    switch(s.screen){
      case "balance":if(s.holdings){text(amount(s.holdings.GRAM,"GRAM")+" GRAM"+(s.network==="mainnet"?"   ·   "+amount(s.holdings.USDT,"USDT")+" USDT":""),142);text(s.usd===null?"—":"≈ $"+s.usd.toFixed(2),209,36);}else symbol("empty",288,154,3);break;
      case "receive":if(s.notice){text("+"+amount(s.notice.units,s.notice.asset)+" "+s.notice.asset,158,36);}else symbol("phone",288,140,4);if(s.address){text(s.address.slice(0,7)+"…"+s.address.slice(-7),244,22);}break;
      case "swap":symbol("previous",75,145,2);symbol("next",501,145,2);text(s.option?"USDT → GRAM":"GRAM → USDT",145,35);text("Swap direction",235,27);break;
      case "contacts":{const c=s.contacts[s.option];if(c){text(c.name,151);text(c.address.slice(0,7)+"…"+c.address.slice(-7),208,22);}else{symbol("phone",288,149,3);text("Add contacts on your phone",224,27);}break;}
      case "history":{
        const tx=s.history[s.option];
        if(tx){
          text((tx.incoming?"+":"−")+amount(tx.units,tx.asset)+" "+tx.asset,137);
          if(Number.isFinite(tx.time))text(historyDate.format(tx.time*1000),188,24);
          text((s.option+1)+" / "+s.history.length,240,19);
        }else symbol("empty",288,158,3);
        break;
      }
    }
  }
  globalThis.GramGrid={actions,labels,create,enter,apply,draw,amount,adjustSend,icon};
})();
