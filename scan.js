import jsQR from "jsqr";

const usdtMaster = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
function validAddress(address) {
  if (!/^[A-Za-z0-9_+-]{48}$/.test(address)) return false;
  const bytes = Uint8Array.from(atob(address.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
  if (![0x11,0x51].includes(bytes[0]&0x7f)) return false;
  let crc=0;
  for(const byte of bytes.slice(0,34)){
    crc ^= byte << 8;
    for(let i=0;i<8;i++) crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;
  }
  return bytes[34]===(crc>>8) && bytes[35]===(crc&255);
}
export function parseInvoice(value) {
  let address=value.trim(), asset="GRAM", units=null,memo="";
  if(address.startsWith("ton://")){
    const url=new URL(address);
    if(url.host!=="transfer" || url.username || url.password || url.hash)throw Error("Scan a TON payment QR code.");
    for(const key of url.searchParams.keys()){
      if(!["amount","jetton","text"].includes(key)||url.searchParams.getAll(key).length!==1)throw Error("Unsupported QR parameters.");
    }
    if(url.searchParams.has("jetton")){
      if(url.searchParams.get("jetton")!==usdtMaster)throw Error("Unknown token.");
      asset="USDT";
    }
    if(url.searchParams.has("amount")){
      const raw=url.searchParams.get("amount");
      if(!/^[1-9]\d{0,29}$/.test(raw))throw Error("Check the amount in the QR code.");
      units=BigInt(raw);
    }
    memo=url.searchParams.get("text")??"";
    if(memo.length>120)throw Error("The QR comment is too long.");
    address=url.pathname.slice(1);
  }
  if(!validAddress(address))throw Error("Invalid TON address.");
  return {address,asset,assetSpecified:asset==="USDT"||units!==null,units,memo};
}
export async function readQR(src){
  const image=new Image();image.src=src;
  await image.decode();
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const g=canvas.getContext("2d",{willReadFrequently:true});g.drawImage(image,0,0,canvas.width,canvas.height);
  const data=g.getImageData(0,0,canvas.width,canvas.height);
  const result=jsQR(data.data,data.width,data.height);
  if(!result)throw Error("Could not read the QR code.");
  return parseInvoice(result.data);
}
