/* Real account/create/edit forms and mutation hooks; synthetic auth and HTTP only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'Node', 'Event', 'MutationObserver']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act, Simulate } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const clone = value => JSON.parse(JSON.stringify(value));
const mfa = { mfa: { enabled: true, method: 'sms' }, mobiles: [{number:'+441111111111',verified:true,primary:true},{number:'+442222222222',verified:false,primary:false}], authenticatorSecret: 'synthetic-existing-secret' };
let actor = { id:'root-a', userRole:'root', email:'root@example.invalid', name:'Root', description:'', securityPolicy:'', userTypeProprietaryInfo:clone(mfa) };
let target = { id:'target-a', userRole:'noc', email:'target@example.invalid', name:'Target', description:'', securityPolicy:'', securityPolicyChange:1, notes:[], currentPassword:'', userTypeProprietaryInfo:clone(mfa) };
let requests = [], failSave = false;
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({user:actor}) };
  if (name === 'react-i18next') return { useTranslation: () => ({t:key=>key}) };
  if (name === 'hooks/useApiRequirements') return { __esModule:true, default:()=>({passwordPolicyLink:'http://localhost/policy',passwordPattern:'.*'}) };
  if (name === 'hooks/Network/Entity') return { useGetEntities:()=>({data:[]}) };
  if (name === 'hooks/Network/Venues') return { useGetVenues:()=>({data:[]}) };
  if (name === 'utils/axiosInstances') return { axiosSec: {
    post: async(url, body) => { requests.push({method:'POST',url,body:clone(body)}); return {data:{...body,id:'created-a'}}; },
    put: async(url, body) => { requests.push({method:'PUT',url,body:clone(body)}); if(failSave)throw new Error('Synthetic failure');
      if(url === `user/${actor.id}`) { actor={...actor,...body}; return {data:clone(actor)}; }
      target={...target,...body}; return {data:clone(target)};
    },
  } };
  if (/^(components|helpers|hooks|constants|models|utils|contexts)\//.test(name)) name=path.resolve('src',name);
  return originalLoad.call(this,name,parent,isMain);
};
for(const extension of ['.ts','.tsx','.jsx']) Module._extensions[extension]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  fileName:filename,
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true},
}).outputText,filename);
const Edit=require('./src/pages/UsersPage/Table/EditUserModal/Form.tsx').default;
const Create=require('./src/pages/UsersPage/Table/CreateUserModal/Form.tsx').default;
const Profile=require('./src/pages/Profile/GeneralInformation.tsx').default;
const {canAccessRoute}=require('./src/helpers/userAccessPolicy.ts');
let root,container,client,ref,checks=0;
const check=(value,label)=>{assert.ok(value,label);++checks;};
const settle=async cb=>act(async()=>{if(cb)await cb();await new Promise(resolve=>setTimeout(resolve,35));});
const render=async(kind='edit',editing=true)=>{
  if(root){await settle(()=>root.unmount());client.clear();}
  document.body.innerHTML='';container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);ref=React.createRef();
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}},logger:{log(){},warn(){},error(){}}});
  const component=kind==='profile'?React.createElement(Profile):React.createElement(kind==='edit'?Edit:Create,{selectedUser:target,editing,isOpen:true,onClose(){},formRef:ref});
  await settle(()=>root.render(React.createElement(ChakraProvider,null,React.createElement(QueryClientProvider,{client},component))));await settle();
};
const input=label=>[...container.querySelectorAll('label')].find(node=>node.textContent.replace('*','').trim()===label)?.closest('.chakra-form-control')?.querySelector('input');
const change=async(label,value)=>settle(()=>{const node=input(label);assert.ok(node,label);node.value=value;Simulate.change(node,{target:node});});
const submit=()=>settle(()=>ref.current.submitForm());
const click=label=>settle(()=>Simulate.click(container.querySelector(`[aria-label="${label}"]`)));
const untouched=body=>!Object.hasOwn(body,'userTypeProprietaryInfo')&&!Object.hasOwn(body,'mfa')&&!Object.hasOwn(body,'mobiles')&&!Object.hasOwn(body,'verified');
(async()=>{
  await render();check(input('Mobile number').value==='', 'contact defaults blank, never copies MFA phone');
  await change('Mobile number','07700123456');await submit();check(requests.length===0&&ref.current.errors.contactMobileNumber,'invalid national mobile blocked');
  await change('Mobile number',' +447700123456 ');await submit();
  check(requests.at(-1).body.contactMobileNumber==='+447700123456'&&requests.at(-1).url==='user/target-a','root edit persists normalized contact through actual user mutation');
  check(untouched(requests.at(-1).body)&&JSON.stringify(target.userTypeProprietaryInfo)===JSON.stringify(mfa),'contact update does not send/change MFA, verification or secondary phones');
  await render();check(input('Mobile number').value==='+447700123456','saved contact is displayed');
  await change('common.description','Description only');await submit();check(!Object.hasOwn(requests.at(-1).body,'contactMobileNumber'),'unchanged contact omitted on ordinary edit');
  await render();await change('Mobile number','');await submit();check(requests.at(-1).body.contactMobileNumber==='','explicit blank clears contact');
  await render('edit',false);check(input('Mobile number').disabled,'read-only user modal keeps contact read-only');const beforeReadonly=requests.length;await submit();check(requests.length===beforeReadonly,'read-only submit cannot write');
  actor={...actor,userRole:'noc'};await render();check(input('Mobile number').disabled,'nonroot cannot edit another account contact');await submit();check(requests.length===beforeReadonly,'nonroot programmatic submit cannot write another account');
  check(!canAccessRoute(actor,{id:'users-page',authorized:['root']}),'user management navigation remains root-only');actor={...actor,userRole:'root'};
  await render('create');check(input('Mobile number').value==='', 'new-user mobile blank with no fake default');
  await settle(()=>ref.current.setValues({...ref.current.values,name:'New user',email:'new@example.invalid',currentPassword:'Synthetic123!',userRole:'noc',emailValidation:false,changePassword:false,contactMobileNumber:'not-a-number'}));
  const beforeCreate=requests.length;await submit();check(requests.length===beforeCreate&&ref.current.errors.contactMobileNumber,'invalid create contact rejected');
  await change('Mobile number','+447700654321');await submit();check(requests.at(-1).method==='POST'&&requests.at(-1).body.contactMobileNumber==='+447700654321','create persists contact using existing create hook');
  check(untouched(requests.at(-1).body),'new-user contact does not enable MFA or mark a phone verified');
  await render('create');await settle(()=>ref.current.setValues({...ref.current.values,name:'No mobile',email:'blank@example.invalid',currentPassword:'Synthetic123!',userRole:'noc',emailValidation:false,changePassword:false}));await submit();
  check(requests.at(-1).method==='POST'&&!Object.hasOwn(requests.at(-1).body,'contactMobileNumber'),'blank contact accepted and omitted at creation');
  actor={...actor,userRole:'noc',contactMobileNumber:'+447700999999'};await render('profile');
  check(input('Mobile number').value==='+447700999999'&&input('Mobile number').disabled,'own account card displays contact independently of MFA');
  await click('toggle-edit');await change('Mobile number','bad');await settle(()=>Simulate.submit(container.querySelector('form')));
  const beforeProfile=requests.length;check(container.textContent.includes('Use a country code'),'own account invalid number validation shown');
  await change('Mobile number','+447700888888');await click('save');await settle();
  check(requests.length===beforeProfile+1&&requests.at(-1).url===`user/${actor.id}`&&requests.at(-1).body.contactMobileNumber==='+447700888888','limited user can update own contact through existing account hook');
  check(untouched(requests.at(-1).body)&&JSON.stringify(actor.userTypeProprietaryInfo)===JSON.stringify(mfa),'own account contact preserves MFA configuration and verified phones');
  await click('toggle-edit');await change('Mobile number','');await click('save');await settle();check(requests.at(-1).body.contactMobileNumber==='','own account contact can be cleared');
  await render('profile');await click('toggle-edit');await change('Mobile number','+447700777777');await click('toggle-edit');
  const dialog=document.querySelector('[role="alertdialog"]');check(!!dialog,'own account dirty cancellation asks before discarding');
  const beforeDiscard=requests.length;await settle(()=>Simulate.click([...dialog.querySelectorAll('button')].find(node=>node.textContent==='common.confirm')));
  check(input('Mobile number').value===''&&requests.length===beforeDiscard,'cancel restores contact without API write');
  await settle(()=>root.unmount());client.clear();console.log(`PASS ${checks} real create/edit/account contact-mobile interactions; MFA untouched`);
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
