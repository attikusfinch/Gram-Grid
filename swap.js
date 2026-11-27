import {StonApiClient} from "@ston-fi/api";
import {Client,dexFactory} from "@ston-fi/sdk";
import {networks,same} from "./chain.js";

export async function swapQuote(owner,asset,units,ownerJettonWallet){
  const native="EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
  const {usdt,base}=networks.mainnet;
  const nativeIn=asset==="GRAM", other=nativeIn?"USDT":"GRAM";
  const offerAddress=nativeIn?native:usdt,askAddress=nativeIn?usdt:native;
  const r=await new StonApiClient().simulateSwap({offerAddress,askAddress,offerUnits:String(units),slippageTolerance:"0.005",dexVersion:[2]});
  const minimum=BigInt(r.minAskUnits),output=BigInt(r.askUnits);
  if(!same(r.offerAddress,offerAddress)||!same(r.askAddress,askAddress)||BigInt(r.offerUnits)!==units||!same(r.router.address,r.routerAddress)||minimum<=0n||minimum>output||minimum*1000n+1000n<output*995n)throw Error("The STON.fi quote does not match the request.");
  const contracts=dexFactory(r.router),client=new Client({endpoint:base+"/api/v2/jsonRPC"});
  const router=client.open(contracts.Router.create(r.router.address));
  const expires=Math.floor(Date.now()/1000)+120;
  const params={userWalletAddress:owner,receiverAddress:owner,refundAddress:owner,offerAmount:units,minAskAmount:minimum,deadline:expires,proxyTon:contracts.pTON.create(r.router.ptonMasterAddress),offerJettonWalletAddress:nativeIn?r.router.ptonWalletAddress:ownerJettonWallet,askJettonWalletAddress:r.askJettonWallet};
  const tx=nativeIn?await router.getSwapTonToJettonTxParams({...params,askJettonAddress:usdt}):await router.getSwapJettonToTonTxParams({...params,offerJettonAddress:usdt});
  return {asset,other,units,output,minimum,expires,address:r.router.address,message:{address:tx.to.toString(),amount:tx.value.toString(),payload:tx.body.toBoc().toString("base64")}};
}
