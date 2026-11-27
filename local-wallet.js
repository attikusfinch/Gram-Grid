import {entropyToMnemonic, mnemonicToSeed, validateMnemonic} from "@scure/bip39";
import {wordlist} from "@scure/bip39/wordlists/english";
import {deriveEd25519Path,keyPairFromSeed} from "@ton/crypto";
import {Address,beginCell,Cell,external,internal,SendMode,storeMessage} from "@ton/core";
import {WalletContractV5R1} from "@ton/ton";
import {Buffer} from "buffer";
import {networks} from "./chain.js";

export const minPasswordLength=4;
export function validatePassword(password){
  if(Array.from(password).length<minPasswordLength)throw Error(`Use at least ${minPasswordLength} characters for your password.`);
}
export function ensureSecure(){
  if(!globalThis.isSecureContext||!crypto.subtle||!globalThis.indexedDB)
    throw Error("Open the installed Even Hub app, an HTTPS page, or localhost. Wallet keys require a secure connection.");
}
export function newPhrase(){
  ensureSecure();
  const entropy=crypto.getRandomValues(new Uint8Array(16));
  try{return entropyToMnemonic(entropy,wordlist);}finally{entropy.fill(0);}
}
export async function deriveSeed(phrase){
  const words=phrase.trim().toLowerCase().split(/\s+/);
  const normalized=words.join(" ");
  if(words.length!==12||!validateMnemonic(normalized,wordlist))throw Error("Check the spelling and order of all 12 English words.");
  const master=await mnemonicToSeed(normalized);
  try{return await deriveEd25519Path(master,[44,607,0]);}finally{master.fill(0);}
}
export function walletContract(pub,net){
  return WalletContractV5R1.create({publicKey:Buffer.from(pub,"hex"),walletId:{networkGlobalId:Number(networks[net].id)}});
}
function publicHex(seed){
  const pair=keyPairFromSeed(seed);
  try{return pair.publicKey.toString("hex");}finally{pair.secretKey.fill(0);}
}
async function database(){
  ensureSecure();
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("gram-grid-wallet",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("keys");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(Error("Wallet storage is unavailable."));
  });
}
export async function readVault(){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const r=db.transaction("keys").objectStore("keys").get("wallet");
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });}finally{db.close();}
}
async function encryptionKey(password,salt){
  const bytes=new TextEncoder().encode(password);
  try{
    const k=await crypto.subtle.importKey("raw",bytes,"PBKDF2",false,["deriveKey"]);
    return await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:600000},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }finally{bytes.fill(0);}
}
export async function saveVault(seed,password,expected){
  ensureSecure();
  validatePassword(password);
  const pub=publicHex(seed);
  if(expected&&pub!==expected.pub)throw Error("This phrase belongs to a different wallet. Your existing wallet is safe.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await encryptionKey(password,salt);
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,seed);
  const record={version:1,pub,salt,iv,cipher,id:crypto.randomUUID()};
  const db=await database();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction("keys","readwrite"),store=tx.objectStore("keys"),read=store.get("wallet");
    read.onsuccess=()=>{if(read.result?.id!==expected?.id){tx.abort();return;}store.put(record,"wallet");};
    tx.oncomplete=resolve;tx.onabort=()=>reject(Error("The wallet has changed. Reopen the app."));
  });}finally{db.close();}
  return record;
}
export async function decryptVault(record,password){
  ensureSecure();
  if(record.version!==1)throw Error("This wallet storage version is unsupported.");
  const key=await encryptionKey(password,record.salt);
  try{
    const seed=Buffer.from(await crypto.subtle.decrypt({name:"AES-GCM",iv:record.iv},key,record.cipher));
    if(seed.length!==32||publicHex(seed)!==record.pub){seed.fill(0);throw Error();}
    return seed;
  }catch{throw Error("Could not unlock the wallet. Check your password or recover access with your 12 words.");}
}
export function signedTransfer(seed,net,owner,tx,chainState){
  const pair=keyPairFromSeed(seed);
  try{
    const contract=walletContract(pair.publicKey.toString("hex"),net);
    if(!contract.address.equals(Address.parse(owner)))throw Error("The wallet address has changed.");
    const active=chainState.status==="active";
    if(active&&(chainState.code_hash!==contract.init.code.hash().toString("base64")||!Number.isSafeInteger(chainState.seqno)||chainState.seqno<0||chainState.is_signature_allowed!==true))throw Error("The current contract state does not allow signing.");
    if(!active&&!["uninit","nonexist","uninitialized"].includes(chainState.status))throw Error("Wallet unavailable.");
    if(tx.expires<=Date.now()/1000+5)throw Error("The request has expired.");
    const m=tx.message,destination=Address.parseFriendly(m.address);
    if(net==="mainnet"&&destination.isTestOnly)throw Error("The recipient is on another network.");
    const body=contract.createTransfer({seqno:active?chainState.seqno:0,secretKey:pair.secretKey,timeout:tx.expires,
      sendMode:SendMode.PAY_GAS_SEPARATELY|SendMode.IGNORE_ERRORS,
      messages:[internal({to:destination.address,bounce:destination.isBounceable,value:BigInt(m.amount),body:m.payload?Cell.fromBase64(m.payload):undefined})]});
    return beginCell().store(storeMessage(external({to:contract.address,init:active?undefined:contract.init,body}))).endCell().toBoc().toString("base64");
  }finally{pair.secretKey.fill(0);}
}
