import {checkVaultOwner,decryptVault,deriveSeed,ensureSecure,minPasswordLength,newPhrase,readVault,saveVault,validatePassword} from "./local-wallet.js";

const by=id=>document.getElementById(id);
function shuffled(items){
  const list=[...items];
  for(let i=list.length-1;i>0;i--){
    const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);
    [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
}
function renderWordChoices(words,previous){
  const positions=shuffled(words.map((_,i)=>i).filter(i=>!previous.includes(i))).slice(0,3).sort((a,b)=>a-b);
  const vocabulary=[...new Set(words)];
  // A valid phrase can repeat words. Always offer three distinct choices.
  if(vocabulary.length<3)vocabulary.push(...["apple","river","clock"].filter(word=>!vocabulary.includes(word)));
  const groups=positions.map((position,i)=>{
    const correct=words[position];
    const alternatives=shuffled(vocabulary.filter(word=>word!==correct)).slice(0,2);
    const group=document.createElement("fieldset"),legend=document.createElement("legend");
    legend.textContent="Word "+(position+1);
    group.append(legend);
    const row=document.createElement("div");
    row.className="word-options";
    for(const word of shuffled([correct,...alternatives])){
      const label=document.createElement("label"),radio=document.createElement("input"),text=document.createElement("span");
      radio.type="radio";radio.name="choice"+i;radio.value=word;radio.required=true;
      text.lang="en";text.textContent=word;
      label.append(radio,text);row.append(label);
    }
    group.append(row);return group;
  });
  by("word-check").replaceChildren(...groups);
  return positions;
}
function choicesMatch(words,positions){
  return positions.length===3&&positions.every((n,i)=>by("setup-form").elements.namedItem("choice"+i)?.value===words[n]);
}
function clearChoiceSelection(){
  for(const radio of by("word-check").querySelectorAll(":checked"))radio.checked=false;
}

const secretFields=["password","repeat"];
export function phoneWallet(onChange){
  const dialog=by("setup");
  const recoveryWords=Array.from({length:12},(_,i)=>{
    const label=document.createElement("label"),input=document.createElement("input");
    label.textContent=String(i+1).padStart(2,"0");input.setAttribute("aria-label","Recovery word "+(i+1));
    input.lang="en";input.autocomplete="off";input.autocapitalize="none";input.spellcheck=false;input.required=true;
    label.append(input);by("recovery").append(label);return input;
  });
  const recovery=by("recovery");
  function focusPreviousWord(input){
    let i=recoveryWords.indexOf(input)-1;
    if(i<0)return;
    while(i>0&&!recoveryWords[i].value)i--;
    const previous=recoveryWords[i];
    previous.focus();
    previous.setSelectionRange(previous.value.length,previous.value.length);
    return previous;
  }
  function backspaceFromEmpty(e){
    const input=e.target;
    if(!e.cancelable||e.isComposing||input.value!==""||!recoveryWords.includes(input))return;
    const previous=focusPreviousWord(input);
    if(!previous)return;
    e.preventDefault();
    const end=previous.value.length;
    if(end){
      previous.setRangeText("",end-1,end,"end");
      if(!previous.value)focusPreviousWord(previous);
    }
  }
  recovery.addEventListener("keydown",e=>{
    if(e.key==="Backspace"&&!e.ctrlKey&&!e.altKey&&!e.metaKey)backspaceFromEmpty(e);
  });
  recovery.addEventListener("beforeinput",e=>{
    if(e.inputType==="deleteContentBackward")backspaceFromEmpty(e);
  });
  recovery.addEventListener("input",e=>{
    if(e.inputType==="deleteContentBackward"&&!e.isComposing&&e.target.value==="")focusPreviousWord(e.target);
  });
  recovery.addEventListener("paste",e=>{
    const list=e.clipboardData.getData("text").trim().split(/\s+/);
    if(list.length<2)return;
    e.preventDefault();
    const start=list.length===12?0:recoveryWords.indexOf(e.target);
    if(start<0||start+list.length>12){by("setup-message").textContent="A recovery phrase has exactly 12 words.";return;}
    list.forEach((word,i)=>{recoveryWords[start+i].value=word.toLowerCase();});
    by("setup-message").textContent="";
    (recoveryWords[start+list.length]||by("setup-submit")).focus();
  });
  let record,seed,importSeed,phrase="",positions=[],wrongAnswers=0,mode="",saving=false,revision=0,deadline=0;
  const idle=5*60*1000;
  function clearInputs(){
    importSeed?.fill(0);importSeed=null;
    phrase="";positions=[];wrongAnswers=0;by("word-check").replaceChildren();by("words").replaceChildren();
    for(const id of secretFields)by(id).value="";
    for(const input of recoveryWords)input.value="";
  }
  function lock(){
    revision++;seed?.fill(0);seed=null;clearInputs();deadline=0;
    if(dialog.open)dialog.close();
    onChange();
  }
  function unlocked(){return Boolean(seed)&&Date.now()<deadline;}
  function touch(){if(unlocked())deadline=Date.now()+idle;}
  function stage(name){
    mode=name;by("setup-message").textContent="";
    for(const id of ["welcome","backup","verify","recover","unlock"])by("stage-"+id).hidden=id!==name;
    by("pass-fields").hidden=!["backup","protect","unlock"].includes(name);
    by("repeat-label").hidden=name!=="backup";
    by("repeat").disabled=name!=="backup";
    by("password").autocomplete=name==="unlock"?"current-password":"new-password";
    by("recovery").disabled=name!=="recover";
    by("password-label").textContent=name==="unlock"?"Device password":name==="protect"?"New device password":"Create a device password";
    by("password-help").textContent=name==="unlock"?"Enter the password you set on this device.":name==="protect"?`Choose at least ${minPasswordLength} characters to protect the imported wallet on this device.`:`Use at least ${minPasswordLength} characters. This password encrypts your key on this device. Your 12 words restore your wallet on another device.`;
    by("setup-submit").hidden=name==="welcome";
    by("setup-cancel").hidden=name==="welcome";
    by("setup-cancel").textContent=name==="verify"?"Start over":name==="unlock"?"Close":"Back";
    by("setup-submit").textContent=({backup:"I wrote them down",verify:"Verify and open",recover:"Continue",protect:"Import wallet",unlock:"Open wallet"})[name]||"";
    by("setup-title").textContent=({welcome:"Gram Grid",backup:"Write down your 12 words",verify:"Check your backup",recover:"Import wallet",protect:"Protect your wallet",unlock:"Unlock wallet"})[name];
    dialog.querySelector(".setup-inner").scrollTop=0;
    if(dialog.open)by("setup-title").focus({preventScroll:true});
  }
  function showSetup(){
    clearInputs();stage(record?"unlock":"welcome");
    if(!dialog.open)dialog.show();
  }
  async function open(){
    ensureSecure();record=await readVault();showSetup();
  }
  by("make").onclick=()=>{
    phrase=newPhrase();
    by("words").replaceChildren(...phrase.split(" ").map(w=>{const li=document.createElement("li");li.textContent=w;return li;}));
    stage("backup");
  };
  function nextChallenge(){
    positions=renderWordChoices(phrase.split(" "),positions);wrongAnswers=0;
  }
  for(const id of ["recover-new","recover-saved"])by(id).onclick=()=>{clearInputs();stage("recover");};
  by("setup-cancel").onclick=()=>{
    if(saving)return;
    if(mode==="protect"){importSeed?.fill(0);importSeed=null;by("password").value="";stage("recover");return;}
    if(mode==="unlock"){dialog.close();return;}
    const trigger=mode==="recover"?(record?"recover-saved":"recover-new"):"make";
    clearInputs();stage(record?"unlock":"welcome");by(trigger).focus();
  };
  dialog.addEventListener("close",()=>{revision++;clearInputs();});
  by("setup-form").onsubmit=async e=>{
    e.preventDefault();if(saving)return;
    const current=revision;let next;
    try{
      saving=true;by("setup-submit").disabled=true;
      const password=by("password").value;
      if(mode==="recover"){
        next=await deriveSeed(recoveryWords.map(input=>input.value.trim()).join(" "));
        if(current!==revision||!dialog.open)return;
        if(record)checkVaultOwner(next,record);
        importSeed=next;next=null;by("password").value="";stage("protect");by("password").focus();return;
      }
      if(!["backup","verify","protect","unlock"].includes(mode))return;
      if(mode==="unlock")next=await decryptVault(record,password);
      else{
        validatePassword(password);
        if(mode==="backup"){
          if(password!==by("repeat").value)throw Error("The passwords do not match.");
          by("words").replaceChildren();stage("verify");nextChallenge();return;
        }
        if(mode==="verify"&&!choicesMatch(phrase.split(" "),positions)){
          wrongAnswers++;clearChoiceSelection();
          if(wrongAnswers===3){nextChallenge();throw Error("Three incorrect attempts. Choose the words for the new positions.");}
          throw Error("Check your words and their order. Attempts before the positions change: "+(3-wrongAnswers)+".");
        }
        next=mode==="protect"?importSeed.slice():await deriveSeed(phrase);
        if(current!==revision||!dialog.open)return;
        record=await saveVault(next,password,record);
      }
      if(current!==revision||!dialog.open)return;
      seed?.fill(0);seed=next;next=null;deadline=Date.now()+idle;
      clearInputs();dialog.close();onChange();
    }catch(e){if(current===revision)by("setup-message").textContent=e.message;}
    finally{next?.fill(0);saving=false;by("setup-submit").disabled=false;}
  };
  setInterval(()=>{if(seed&&!unlocked())lock();},5000);
  window.addEventListener("pagehide",lock);
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden&&dialog.open){
      if(record)dialog.close();
      else{revision++;clearInputs();stage("welcome");}
    }
  });
  window.addEventListener("pageshow",e=>{if(e.persisted&&!record&&!dialog.open)showSetup();});
  return {open,lock,touch,unlocked,get pub(){return record?.pub;},
    load:async()=>{record=await readVault();if(!record)showSetup();onChange();},
    withSeed:fn=>{if(!unlocked())throw Error("Unlock your wallet on your phone.");return fn(seed);}};
}
