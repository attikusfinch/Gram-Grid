// Local companion view. Both displays read the same production wallet state.
import {glassesMenu} from "./display.js";

export function browserDisplay(state,onGesture){
  const panel=document.createElement("section");
  panel.id="browser-emulator";
  panel.innerHTML='<h2>Even G2 emulator</h2><div class="lens-view"><canvas width="576" height="288" aria-label="Glasses display"></canvas><div id="lens-menu" aria-label="Glasses menu" role="group" hidden></div></div><div class="ring-controls"><button type="button" data-key="prev" aria-label="Up">↑</button><button type="button" data-key="click">Tap</button><button type="button" data-key="next" aria-label="Down">↓</button><button type="button" data-key="back">Back</button><button type="button" data-key="menu" aria-controls="lens-menu" aria-expanded="false">Menu</button></div>';
  document.body.classList.add("with-emulator");
  document.body.append(panel);
  const canvas=panel.querySelector("canvas");
  const menu=panel.querySelector("#lens-menu"),toggle=panel.querySelector("[data-key=menu]");
  const hold=document.createElement("button");
  hold.type="button";hold.dataset.key="home";hold.textContent="Long Press";toggle.before(hold);
  const tap=panel.querySelector("[data-key=click]");
  let holdTimer,held=false;
  tap.addEventListener("pointerdown",e=>{
    if(!e.isPrimary||e.button!==0)return;
    clearTimeout(holdTimer);held=false;tap.setPointerCapture(e.pointerId);
    holdTimer=setTimeout(()=>{held=true;hold.click();},800);
  });
  for(const event of ["pointerup","pointercancel","lostpointercapture"])tap.addEventListener(event,()=>clearTimeout(holdTimer));
  function menuButton(item){
    const button=document.createElement("button");
    button.type="button";button.textContent=item.itemName;
    button.onclick=()=>{showMenu(false);onGesture(item.action);};
    return button;
  }
  let selected=0,items,choices=[];
  function select(i){
    selected=(i+choices.length)%choices.length;
    choices.forEach((button,index)=>button.classList.toggle("selected",index===selected));
    choices[selected].focus({preventScroll:true});
    menu.scrollTop=Math.max(0,choices[selected].offsetTop-menu.clientHeight+choices[selected].offsetHeight);
  }
  function showMenu(open){
    menu.hidden=!open;toggle.setAttribute("aria-expanded",String(open));
    if(open){
      items=glassesMenu(state);choices=items.map(menuButton);menu.replaceChildren(...choices);select(0);
    }else toggle.focus({preventScroll:true});
  }
  for(const button of panel.querySelectorAll("[data-key]"))button.onclick=()=>{
    const input=button.dataset.key;
    if(input==="click"&&held){held=false;return;}
    if(input==="home"){if(!menu.hidden)showMenu(false);onGesture("home");}
    else if(input==="menu")showMenu(menu.hidden);
    else if(menu.hidden)onGesture(input);
    else if(input==="back")showMenu(false);
    else if(input==="click")choices[selected].click();
    else select(selected+(input==="next"?1:-1));
  };
  return {
    start:async()=>{},paint:()=>{
      if(!menu.hidden&&items!==glassesMenu(state))showMenu(false);
      globalThis.GramGrid.draw(canvas,state,"#b7ff90");
    },
    close:()=>{},capture:async()=>{throw Error("Use Scan QR from photo on the phone screen.");}
  };
}
