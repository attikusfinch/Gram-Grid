import {waitForEvenAppBridge, CreateStartUpPageContainer, RebuildPageContainer, StartUpPageCreateResult, OsEventTypeList as Event, ImageRawDataUpdate} from "@evenrealities/even_hub_sdk";

const mainMenu=[
  {itemID:3,itemName:"Back",action:"menuBack"},
  {itemID:1,itemName:"Home",action:"home"},
  {itemID:2,itemName:"Lock wallet",action:"lock"}
];
const amountMenu=[
  {itemID:17,itemName:"Max",action:"maxAmount"},
  ...[-1,-10,-100,1,10,100].map((tenths,i)=>({
    itemID:10+i,itemName:(tenths>0?"+":"")+tenths/10,action:tenths
  })),
  {itemID:16,itemName:"Reset to 0",action:"resetAmount"},...mainMenu.slice(0,2)
];
export const glassesMenu=state=>state.sendMenu?amountMenu:mainMenu;

export function display(state,onGesture,onError){
  const canvas=document.createElement("canvas");
  canvas.width=576; canvas.height=288;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  const parts=Array.from({length:4},(_,i)=>({containerID:i+1,containerName:"part"+i,xPosition:i%2*288,yPosition:Math.floor(i/2)*144,width:288,height:144,zOrderIndex:i+1}));
  const last=[];
  let bridge,activeMenu,ready=false,dirty=false,painting=false;
  function layout(menu){
    return {menuObject:{menuItems:menu.map(({itemID,itemName})=>({itemID,itemName}))},
      containerTotalNum:5,imageObject:parts,textObject:[{containerID:5,containerName:"input",xPosition:0,yPosition:0,width:576,height:288,zOrderIndex:0,isEventCapture:1,content:" "}]};
  }
  async function paint(){
    dirty=true;
    if(!ready||painting)return;
    painting=true;
    try{
      while(dirty){
        dirty=false;
        const menu=glassesMenu(state);
        if(menu!==activeMenu){
          if(!await bridge.rebuildPageContainer(new RebuildPageContainer(layout(menu))))throw Error("Could not update the G2 menu.");
          activeMenu=menu;last.length=0;
        }
        globalThis.GramGrid.draw(canvas,state);
        for(const p of parts){
          const rgba=ctx.getImageData(p.xPosition,p.yPosition,288,144).data;
          const gray=Uint8Array.from({length:288*144},(_,i)=>Math.round(rgba[i*4]*rgba[i*4+3]/255));
          if(last[p.containerID]&&gray.every((v,i)=>last[p.containerID][i]===v))continue;
          const result=await bridge.updateImageRawData(new ImageRawDataUpdate({containerID:p.containerID,containerName:p.containerName,imageData:gray}));
          if(result!=="success")throw Error("G2: "+result);
          last[p.containerID]=gray;
        }
      }
    }catch(e){onError(e);}finally{painting=false;}
  }
  async function start(){
    bridge=await waitForEvenAppBridge();
    activeMenu=glassesMenu(state);
    const initial=layout(activeMenu);
    const code=await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(initial));
    // Reloading the phone WebView can leave the previous page active on the glasses.
    if(code!==StartUpPageCreateResult.success){
      const restored=await bridge.rebuildPageContainer(new RebuildPageContainer(initial));
      if(!restored)throw Error("Could not initialize the G2 display (startup code "+code+").");
    }
    ready=true;
    bridge.onEvenHubEvent(({textEvent,listEvent,sysEvent,menuItemClickEvent})=>{
      if([sysEvent,textEvent,listEvent].some(e=>e?.eventType===Event.LONG_PRESS_EVENT)){
        onGesture("home");return;
      }
      if(menuItemClickEvent){
        const item=glassesMenu(state).find(item=>item.itemID===menuItemClickEvent.itemID);
        if(item)onGesture(item.action);
        return;
      }
      const e=textEvent??sysEvent;if(!e)return;
      const type=e.eventType??((textEvent||sysEvent?.eventSource)?Event.CLICK_EVENT:undefined);
      const gesture=({[Event.CLICK_EVENT]:"click",[Event.DOUBLE_CLICK_EVENT]:"back",[Event.SCROLL_TOP_EVENT]:"prev",[Event.SCROLL_BOTTOM_EVENT]:"next"})[type];
      if(gesture)onGesture(gesture);
    });
    await paint();
  }
  async function close(){
    // The desktop simulator clears the display immediately instead of showing the G2 exit prompt.
    if(location.hostname==="127.0.0.1"&&new URLSearchParams(location.search).get("simulator")==="1")return;
    try{await bridge?.shutDownPageContainer(1);}catch(error){onError(error);}
  }
  return {start,paint,close,capture:async()=>{
    if(!ready)throw Error("Open the camera in the Even app or choose a photo on your phone.");
    const asset=await bridge.captureImageFromCamera();
    if(asset)return asset.base64.startsWith("data:")?asset.base64:"data:"+asset.mimeType+";base64,"+asset.base64;
  }};
}
