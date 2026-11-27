// Keep the four-module quiet zone clear. All decoration is outside that field.
export function paymentQR(modules){
  const scale=8, frame=2, quiet=4, inset=frame+quiet;
  const size=modules.size, side=size+2*inset;
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=side*scale;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);
  ctx.fillStyle="#daffe6";
  ctx.fillRect(frame,frame,side-2*frame,side-2*frame);
  ctx.fillStyle="#10251c";
  for(let row=0;row<size;row++){
    for(let col=0;col<size;col++){
      if(modules.get(row,col))ctx.fillRect(inset+col,inset+row,1,1);
    }
  }
  // The centers of the three finder patterns are solid 3 × 3 blocks.
  ctx.fillStyle="#21563e";
  for(const [x,y] of [[2,2],[size-5,2],[2,size-5]])ctx.fillRect(inset+x,inset+y,3,3);
  ctx.fillStyle="#8ee2aa";
  for(const x of [0,side-1]){
    for(const y of [0,side-1]){
      ctx.fillRect(x===0?0:side-6,y,6,1);
      ctx.fillRect(x,y===0?0:side-6,1,6);
    }
  }
  return canvas;
}
