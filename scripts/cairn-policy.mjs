import {createPrivateKey, createPublicKey, sign, verify, randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PUBLIC_KEY = 'F7jrPPnCNArA2bVatJ0NM6mMS1pazdkKgQCf/6h2QR0=';
export const CONTROL_URL = 'https://raw.githubusercontent.com/Garlicgoose/MyWorkTool_License/main/ShipmentTrack_license.json';
export const MODES = ['full', 'restricted', 'disabled', 'remove'];
const digestPattern = /^[0-9a-f]{64}$/;
const directivePattern = /^(?:(?:all|cairn|shipment):(?:[0-9a-f]{64}:)?|[0-9a-f]{64}:)(?:full|restricted|disabled|remove)$/;
const rawKey = key => createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'base64')]),format:'der',type:'spki'});

export function canonical(payload) {
 return JSON.stringify({global_enabled:payload.global_enabled,issued_at:payload.issued_at,
  machines:Object.fromEntries(Object.entries(payload.machines).sort(([a],[b])=>a<b?-1:a>b?1:0)),
  revision:payload.revision,schema:payload.schema});
}

function exactKeys(value, keys) {
 return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
}

export function verifyDocument(document, publicKey=PUBLIC_KEY) {
 if(!exactKeys(document,['payload','signature']))throw new Error('控制文件字段无效。');
 const p=document.payload;
 if(!exactKeys(p,['global_enabled','issued_at','machines','revision','schema'])||p.schema!==1||typeof p.global_enabled!=='boolean'
  ||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.issued_at!=='string'||!p.issued_at.trim()
  ||!p.machines||typeof p.machines!=='object'||Array.isArray(p.machines)
  ||Object.entries(p.machines).some(([k,v])=>typeof v!=='boolean'||(!digestPattern.test(k)&&!directivePattern.test(k))))throw new Error('控制内容无效。');
 if(typeof document.signature!=='string'||!verify(null,Buffer.from(canonical(p)),rawKey(publicKey),Buffer.from(document.signature,'base64')))throw new Error('签名无效，请使用原始有效文件。');
 return document;
}

export function loadSigningKey(input) {
 if(input?.type==='private')return input;
 const bytes=Buffer.isBuffer(input)?input:typeof input==='string'?Buffer.from(input):null;
 if(!bytes)return createPrivateKey(input);
 if(bytes.toString('ascii',0,10)==='-----BEGIN')return createPrivateKey(bytes);
 const text=bytes.toString('ascii').trim();
 const seed=bytes.length===32?bytes:/^[A-Za-z0-9+/]{43}=$/.test(text)?Buffer.from(text,'base64'):null;
 return createPrivateKey({key:seed?Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]):bytes,format:'der',type:'pkcs8'});
}

function changed(document, privateKey, publicKey, mutate) {
 verifyDocument(document,publicKey);
 const key = loadSigningKey(privateKey);
 const derived=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 if(derived!==publicKey)throw new Error('私钥与 Cairn 内置公钥不匹配。');
 const p=structuredClone(document.payload);
 mutate(p);
 if(p.revision===Number.MAX_SAFE_INTEGER)throw new Error('revision 超出安全整数范围。');
 p.revision+=1;p.issued_at=new Date().toISOString();
 const result={payload:p,signature:sign(null,Buffer.from(canonical(p)),key).toString('base64')};
 verifyDocument(result,publicKey);
 return result;
}

export function setMode(document, mode, machine, privateKey, publicKey=PUBLIC_KEY, app='cairn') {
 if(!MODES.includes(mode)||!['all','cairn','shipment'].includes(app))throw new Error('程序或状态无效。');
 if(machine&&!digestPattern.test(machine))throw new Error('设备摘要必须为 64 位小写十六进制。');
 return changed(document,privateKey,publicKey,p=>{
  if(machine&&!(machine in p.machines))p.machines[machine]=true;
  if(machine&&['full','restricted'].includes(mode)&&p.machines[machine]===false){
   // Reopen the selected app while keeping the other app explicitly closed.
   if(app!=='all')p.machines[`${machine}:disabled`]=true;
   p.machines[machine]=true;
  }
  const prefix=machine?(app==='all'?`${machine}:`:`${app}:${machine}:`):`${app}:`;
  for(const value of MODES)delete p.machines[prefix+value];
  p.machines[prefix+mode]=true;
 });
}

export function setMachine(document,machine,enabled,privateKey,publicKey=PUBLIC_KEY) {
 if(!digestPattern.test(machine)||typeof enabled!=='boolean')throw new Error('设备摘要或开关无效。');
 return changed(document,privateKey,publicKey,p=>{p.machines[machine]=enabled});
}

export function deleteMachine(document,machine,privateKey,publicKey=PUBLIC_KEY) {
 if(!digestPattern.test(machine))throw new Error('设备摘要无效。');
 return changed(document,privateKey,publicKey,p=>{for(const key of Object.keys(p.machines))if(key.split(':').includes(machine))delete p.machines[key]});
}

export function resolveMode(payload,machine,app) {
 const scope=prefix=>['remove','disabled','restricted','full'].find(mode=>payload.machines[prefix+mode]===true);
 if(machine in payload.machines){
  const own=scope(`${app}:${machine}:`)??scope(`${machine}:`)??scope(`all:${machine}:`);
  if(own==='remove')return own;
  return payload.machines[machine]===true?(own??'full'):'disabled';
 }
 const selected=scope(`${app}:`)??scope('all:')??'full';
 return selected==='remove'||payload.global_enabled?selected:'disabled';
}

function saveVerified(path, value) {
 mkdirSync(dirname(path),{recursive:true});
 if(existsSync(path)) {
  const original=readFileSync(path),backup=path+`.${randomUUID()}.bak`;
  writeFileSync(backup,original,{flag:'wx'});
  if(!readFileSync(backup).equals(original))throw new Error('备份校验失败，已取消替换。');
 }
 const temporary=path+`.${randomUUID()}.tmp`;
 try{writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});verifyDocument(JSON.parse(readFileSync(temporary,'utf8')));renameSync(temporary,path)}
 finally{if(existsSync(temporary))unlinkSync(temporary)}
}

async function main() {
 const args=process.argv.slice(2),action=args.shift(),options={};
 while(args.length){const key=args.shift();if(!key?.startsWith('--')||!args.length||key in options)throw new Error('参数格式无效。');options[key]=args.shift()}
 if(!['verify','set-mode','set-machine','delete-machine'].includes(action))throw new Error('操作：verify / set-mode / set-machine / delete-machine；修改时必须指定私钥和输出文件。');
 let raw;
 if(options['--input'])raw=readFileSync(resolve(options['--input']),'utf8');
 else{const response=await fetch(CONTROL_URL+'?checked='+Date.now(),{headers:{'cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('读取 GitHub 控制文件失败。');raw=await response.text()}
 if(Buffer.byteLength(raw)>64*1024)throw new Error('控制文件过大。');
 const document=verifyDocument(JSON.parse(raw));
 if(action==='verify'){console.log(`签名有效；revision=${document.payload.revision}；global_enabled=${document.payload.global_enabled}；设备条目=${Object.keys(document.payload.machines).filter(k=>digestPattern.test(k)).length}。`);return}
 if(!options['--private-key']||!options['--output'])throw new Error('必须指定私钥和输出文件。');
 const privatePath=resolve(options['--private-key']),output=resolve(options['--output']);
 if(privatePath.toLowerCase()===output.toLowerCase())throw new Error('输出路径不能指向私钥。');
 const key=loadSigningKey(readFileSync(privatePath));
 let result;
 if(action==='set-mode')result=setMode(document,options['--mode'],options['--machine-digest'],key,PUBLIC_KEY,options['--app']??'all');
 else if(action==='delete-machine')result=deleteMachine(document,options['--machine-digest'],key);
 else{if(!['true','false'].includes(options['--enabled']))throw new Error('必须指定 --enabled true 或 false。');result=setMachine(document,options['--machine-digest'],options['--enabled']==='true',key)}
 saveVerified(output,result);
 console.log(`已生成签名控制文件：revision=${result.payload.revision}；操作=${action}；程序=${options['--app']??'all'}；范围=${options['--machine-digest']?'指定设备':'全局'}。尚未上传。`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1});
