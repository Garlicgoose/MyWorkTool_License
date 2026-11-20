import {PUBLIC_KEY,setMode,setMachine,deleteMachine} from './cairn-policy.mjs';

export function applyRequest(document,request,key,publicKey=PUBLIC_KEY){
 const keys=['id','action','app','mode','machine_digest','enabled','created_at'];
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!keys.includes(k))
  ||typeof request.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(request.id)
  ||!['set-mode','set-machine','delete-machine'].includes(request.action)
  ||!['all','cairn','shipment'].includes(request.app))throw new Error('Invalid control request.');
 const machine=request.machine_digest||undefined;
 if(request.action==='set-mode')return setMode(document,request.mode,machine,key,publicKey,request.app);
 if(request.action==='set-machine')return setMachine(document,machine,request.enabled,key,publicKey);
 return deleteMachine(document,machine,key,publicKey);
}
