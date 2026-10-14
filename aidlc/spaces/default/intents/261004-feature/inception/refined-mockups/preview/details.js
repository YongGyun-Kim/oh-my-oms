"use strict";
const CUSTOMER_ACTIONS = [
["productRead","상품 조회"],["orderRead","주문 조회"],["orderSubmit","주문 제출"],["paymentRead","청구·지급 조회"],["entitlementRead","발급 결과 조회"],
["renewalRequest","갱신 요청"],["autoRenewRequest","자동 갱신 신청"],["autoRenewCancel","자동 갱신 해제"],
["changeRequest","변경 요청"],["cancelRequest","취소 요청"],["returnRequest","반품 요청"],
["orgManage","조직 관리"],["userManage","사용자 관리"],["roleManage","역할 관리"],["contractChangeRequest","계약 조건 변경 요청"]
];
const cloneDemo = x => JSON.parse(JSON.stringify(x));
function initDetailedDemo(m){
Object.assign(m,{proposalMode:"current",proposalVersions:{order:3,renewal:2},proposalResults:{},proposalAlerts:{},manualFee:1800000,
users:[
{id:"person-1",name:"김담당",email:"buyer@example.invalid",department:"IT",site:"서울",active:true,admin:false,roles:["role-seoul","role-busan"]},
{id:"person-2",name:"이관리",email:"admin@example.invalid",department:"IT",site:"부산",active:true,admin:true,roles:["role-admin"]}
],
roles:[
{id:"role-seoul",name:"서울 구매",actions:{productRead:[{type:"enterprise",site:"서울",department:"IT"}],orderRead:[{type:"enterprise",site:"서울",department:"IT"}],orderSubmit:[{type:"combination",site:"서울",department:"IT"}]}},
{id:"role-busan",name:"부산 구매",actions:{orderSubmit:[{type:"combination",site:"부산",department:"IT"}]}},
{id:"role-admin",name:"기업 관리",actions:{orgManage:[{type:"enterprise",site:"서울",department:"IT"}],userManage:[{type:"enterprise",site:"서울",department:"IT"}],roleManage:[{type:"enterprise",site:"서울",department:"IT"}]}}
],userDraft:null,roleDraft:null,grantUser:"person-1",grantDraft:null,managementResult:"",managementHistory:[]});
}
function proposalData(kind){
const version=model.proposalVersions[kind];
const order=kind==="order",changed=version>(order?3:2);
return {kind,id:order?"P-ORDER-DEMO-01":"P-RENEW-DEMO-01",version,title:order?"주문 가격 변경 제안":"갱신 가격 변경 제안",
target:order?"OM-26-HW-0181":"ENT-DEMO-03 · 보안 소프트웨어 Standard · 기업 권한 10개",
cycle:order?"해당 주문":"2027-12-01 시작 회차",
oldTotal:order?6000000:1800000,newTotal:order?(changed?6450000:6300000):(changed?2070000:1980000),
oldConditions:order?"주문 전체 8개 · 부분 제공 합의 · 선불/후불 품목 조건 유지":"2027-12-01 ~ 2028-11-30 · 선결제 · 기업 계약 우선",
newConditions:order?"주문 전체 8개 · 부분 제공 합의 · 지급 조건 유지; 서버 A 단가만 변경":"2027-12-01 ~ 2028-11-30 · 선결제 · 합의 범위 밖 제안으로 새 동의 필요",
oldUnit:order?"서버 A 1,200,000원 × 4 / 장비 B 300,000원 × 4":"180,000원 × 10",
newUnit:order?(changed?"서버 A 1,312,500원 × 4 / 장비 B 300,000원 × 4":"서버 A 1,275,000원 × 4 / 장비 B 300,000원 × 4"):(changed?"207,000원 × 10":"198,000원 × 10")};
}
function proposalKey(p){return p.id+":"+p.version;}
function proposalPanel(kind){
if(!canReadPayment()||!canAct())return "";
const p=proposalData(kind),r=model.proposalResults[proposalKey(p)],blocked=model.proposalMode!=="current"||model.condition==="missing"||model.condition==="conflict";
const status=model.proposalMode==="changed"?"제안 내용 변경 · 재검토 필요":model.proposalMode==="unknown"?"현재 제안 조회 미확인":r?(r.status==="unknown"?"동의·거절 접수 결과 미확인":r.decision==="agree"?"동의 의사 확인":"거절 의사 확인"):"고객 확인 대기";
const body=dl([["제안",p.id+" · 내용 버전 "+p.version],["대상",p.target],["적용 대상 회차",p.cycle]])+
(model.proposalMode!=="current"?'<p class="callout">현재 제안 내용을 확인하지 못했습니다. 아래는 마지막 확인 자료이며, 다시 조회하고 검토한 뒤 동의·거절할 수 있습니다.</p>':"")+
table("원래 조건과 변경 제안",["비교 항목","원래 조건","변경 제안"],[["금액",won(p.oldTotal),won(p.newTotal)],["품목·수량·단가",p.oldUnit,p.newUnit],["거래·이용 조건",p.oldConditions,p.newConditions]])+
'<p class="hint">제출 당시 주문·계약과 기존 실제 이용 기간은 보존합니다. 동의 의사 확인은 실제 가격·기간 적용이나 지급 완료가 아닙니다.</p>'+
'<p>'+badge(status,blocked||r?.status==="unknown"?"warn":"")+'</p>'+
(model.proposalAlerts[kind]?'<p class="validation" role="alert">'+escapeText(model.proposalAlerts[kind])+'</p>':"")+
'<div class="actions">'+(!r?'<button type="button" class="primary" data-proposal-decision="agree" data-kind="'+kind+'" '+(blocked?"disabled":"")+'>제안에 동의</button><button type="button" data-proposal-decision="decline" data-kind="'+kind+'" '+(blocked?"disabled":"")+'>제안 거절</button>':"")+
(blocked?'<button type="button" data-proposal-refresh="'+kind+'">현재 제안 다시 확인</button>':"")+
(r?.status==="unknown"?'<button type="button" data-proposal-recheck="'+kind+'">기존 동의·거절 결과 재확인</button>':"")+'</div>'+
(r?'<p>요청 참조: '+r.ref+' · 제안 '+p.id+' / 버전 '+p.version+'</p>':"");
return panel(p.title,body);
}
function proposalSummary(p,decision){
return ["제안: "+p.id+" / 버전 "+p.version,"대상: "+p.target,"회차: "+p.cycle,"원래 금액: "+won(p.oldTotal),"변경 제안 금액: "+won(p.newTotal),"원래 조건: "+p.oldConditions,"변경 조건: "+p.newConditions,"선택: "+(decision==="agree"?"동의":"거절"),"기존 주문·계약·실제 기간을 보존하고 실제 적용 결과를 별도로 확인합니다."].join("\n");
}
function userDraft(){
if(!model.userDraft)model.userDraft={mode:"edit",...cloneDemo(model.users[0])};
return model.userDraft;
}
function options(values,selected){return values.map(v=>'<option '+(v===selected?"selected":"")+'>'+escapeText(v)+'</option>').join("");}
function selectField(id,label,values,value){
return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'" name="'+id+'">'+options(values,value)+'</select></div>';
}
function adminCount(users=model.users){return users.filter(u=>u.active&&u.admin).length;}
function managementFeedback(){return model.managementResult?'<section class="result"><h3 tabindex="-1" id="management-result">'+escapeText(model.managementResult)+'</h3></section>':"";}
function customerUsersPanel(){
const d=userDraft();
return panel("우리 기업 담당자",table("소속·활성·관리자",["담당자","부서/사업장","상태","관리자","역할"],model.users.map(u=>[escapeText(u.name),u.department+" / "+u.site,u.pending?"초대 확인 대기":u.active?"활성":"비활성",u.admin?"기업 관리자":"일반 담당자",u.roles.map(r=>escapeText(model.roles.find(x=>x.id===r)?.name||r)).join(", ")||"부여 역할 없음"])))+
(adminCount()===0?'<div class="callout"><h2>기업 관리자가 없습니다</h2><p>다른 사용자의 권한은 자동 변경하지 않습니다. 새 관리자 지정은 기업 관리 근거를 확인한 뒤 내부 직원에게 요청해 주세요.</p></div>':"")+
panel("초대·소속·활성 변경",'<form id="customer-user-form">'+
'<div class="field"><label for="user-mode">업무</label><select id="user-mode"><option value="edit" '+(d.mode==="edit"?"selected":"")+'>기존 담당자 변경</option><option value="invite" '+(d.mode==="invite"?"selected":"")+'>새 담당자 초대</option></select></div>'+
(d.mode==="edit"?'<div class="field"><label for="user-person">변경 대상</label><select id="user-person">'+model.users.map(u=>'<option value="'+u.id+'" '+(u.id===d.id?"selected":"")+'>'+escapeText(u.name)+'</option>').join("")+'</select></div>':"")+
field("user-name","담당자 이름",d.name,"text","required")+field("user-email","담당자 이메일",d.email,"email",'required autocomplete="email"')+
'<div class="field-row">'+selectField("user-department","소속 부서",["IT","총무"],d.department)+selectField("user-site","소속 사업장",["서울","부산"],d.site)+'</div>'+
(d.mode==="edit"?'<label class="choice"><input id="user-active" type="checkbox" '+(d.active?"checked":"")+'>활성 상태</label>':'<p class="hint">초대 접수와 활성 결과를 구분합니다.</p>')+
'<label class="choice"><input id="user-admin" type="checkbox" '+(d.admin?"checked":"")+'>기업 관리자 권한</label>'+
'<div class="field"><label for="user-reason">변경·초대 사유</label><textarea id="user-reason" required>'+escapeText(d.reason||"확인된 사용자·소속 변경")+'</textarea></div>'+
'<p class="hint">마지막 관리자 권한 회수·비활성화도 경고 후 처리할 수 있습니다. 다른 담당자의 역할·활성 상태는 자동 변경하지 않습니다.</p>'+
'<div id="user-error" class="validation" role="alert" tabindex="-1"></div><button class="primary" type="submit">변경·초대 내용 검토</button></form>')+managementFeedback()+
panel("처리 이력",managementHistory());
}
function managementHistory(){
return model.managementHistory.length?'<ol class="timeline">'+model.managementHistory.map(h=>'<li>'+escapeText(h)+'</li>').join("")+'</ol>':'<p class="hint">아직 확인된 변경 결과가 없습니다.</p>';
}
function scopeText(s){
return s.type==="enterprise"?"자기 기업 전체":s.type==="site"?"사업장 전체: "+s.site:s.type==="department"?"부서 전체: "+s.department:"조합: "+s.site+" · "+s.department;
}
function freshRole(){return {id:"new",name:"새 역할",actions:{}};}
function roleDraft(){
if(!model.roleDraft)model.roleDraft=cloneDemo(model.roles[0]);
return model.roleDraft;
}
function roleScopeFields(action,scope,index){
const prefix="scope-"+action+"-"+index;
return '<div class="scope-row" data-scope-action="'+action+'" data-scope-index="'+index+'">'+
'<div class="field"><label for="'+prefix+'-type">범위 종류</label><select id="'+prefix+'-type" data-scope-prop="type">'+
[["combination","부서·사업장 조합"],["site","사업장 전체"],["department","부서 전체"],["enterprise","기업 전체"]].map(([v,t])=>'<option value="'+v+'" '+(v===scope.type?"selected":"")+'>'+t+'</option>').join("")+'</select></div>'+
((scope.type==="combination"||scope.type==="site")?'<div class="field"><label for="'+prefix+'-site">사업장</label><select id="'+prefix+'-site" data-scope-prop="site">'+options(["서울","부산"],scope.site)+'</select></div>':"")+
((scope.type==="combination"||scope.type==="department")?'<div class="field"><label for="'+prefix+'-department">부서</label><select id="'+prefix+'-department" data-scope-prop="department">'+options(["IT","총무"],scope.department)+'</select></div>':"")+
'<button type="button" data-remove-scope="'+action+'" data-index="'+index+'" aria-label="'+CUSTOMER_ACTIONS.find(x=>x[0]===action)[1]+'의 '+(index+1)+'번째 범위 삭제">범위 삭제</button></div>';
}
function finalRoleTable(role){
return table("행위별 최종 범위",["행위","허용 범위"],CUSTOMER_ACTIONS.map(([id,name])=>[name,role.actions[id]?.length?role.actions[id].map(scopeText).map(escapeText).join("<br>"):"미부여"]));
}
function effectivePermissions(user){
const result={};for(const r of model.roles.filter(r=>user.roles.includes(r.id)))for(const [action,scopes]of Object.entries(r.actions)){
result[action]??=[];for(const s of scopes)if(!result[action].some(x=>scopeText(x)===scopeText(s)))result[action].push(cloneDemo(s));
}return {actions:result};
}
function customerRolesPanel(){
const d=roleDraft(),u=model.users.find(u=>u.id===model.grantUser)||model.users[0];
if(!model.grantDraft)model.grantDraft=[...u.roles];
return panel("역할 정의·행위별 범위",'<form id="customer-role-form"><div class="field"><label for="role-select">편집할 역할</label><select id="role-select">'+model.roles.map(r=>'<option value="'+r.id+'" '+(r.id===d.id?"selected":"")+'>'+escapeText(r.name)+'</option>').join("")+'<option value="new" '+(d.id==="new"?"selected":"")+'>새 역할</option></select></div>'+
field("role-name","역할 이름",d.name,"text","required")+
'<p class="hint">각 행위를 따로 선택합니다. 같은 행위의 범위만 합산하며 다른 기업·내부 직원 전용 권한은 부여할 수 없습니다.</p>'+
'<div class="role-grid">'+CUSTOMER_ACTIONS.map(([id,name])=>'<fieldset><legend>'+name+'</legend><label class="choice"><input type="checkbox" data-enable-action="'+id+'" '+(d.actions[id]?"checked":"")+'>이 행위 허용</label>'+
(d.actions[id]?d.actions[id].map((s,i)=>roleScopeFields(id,s,i)).join("")+'<button type="button" data-add-scope="'+id+'">이 행위에 범위 추가</button>':'<p class="hint">미부여</p>')+'</fieldset>').join("")+'</div>'+
'<div id="role-error" class="validation" role="alert" tabindex="-1"></div><button class="primary" type="submit">행위별 최종 범위 검토</button></form>')+
panel("담당자에게 역할 부여·회수",'<form id="customer-grant-form"><div class="field"><label for="grant-user">대상 담당자</label><select id="grant-user">'+model.users.map(x=>'<option value="'+x.id+'" '+(x.id===u.id?"selected":"")+'>'+escapeText(x.name)+'</option>').join("")+'</select></div><fieldset><legend>부여할 역할</legend>'+
model.roles.map(r=>'<label class="choice"><input type="checkbox" data-grant-role="'+r.id+'" '+(model.grantDraft.includes(r.id)?"checked":"")+'> '+escapeText(r.name)+'</label>').join("")+'</fieldset><p class="hint">선택하면 부여, 선택 해제하면 회수합니다. 계정 관리 권한을 거래 조회·실행 권한으로 자동 확대하지 않습니다.</p><button class="primary" type="submit">부여·회수와 최종 범위 검토</button></form>')+
panel(escapeText(u.name)+"의 현재 행위별 범위",finalRoleTable(effectivePermissions(u)))+managementFeedback()+panel("부여·회수 이력",managementHistory());
}
function proposalComplete(kind,p,r){
if(kind==="renewal"&&r.decision==="agree"&&r.status==="confirmed"&&!model.manualApplied)model.manualFee=p.newTotal;
}
function focusManagementResult(){
document.querySelector("#management-result")?.focus();
$("#live").textContent=model.managementResult;
}
function refreshEditor(selector){render(false);document.querySelector(selector)?.focus();}
function attachDetailedHandlers(){
$("#proposal-picker").value=model.proposalMode;
$("#proposal-picker").onchange=e=>{rememberForms();model.proposalMode=e.target.value;render(true);};
document.querySelectorAll("[data-proposal-decision]").forEach(b=>b.onclick=()=>{
const kind=b.dataset.kind,p=cloneDemo(proposalData(kind)),decision=b.dataset.proposalDecision,key=proposalKey(p);
openConfirm(decision==="agree"?"가격 변경 제안에 동의":"가격 변경 제안 거절","제안 식별·내용 버전·원래/변경 조건·회차를 확인하세요. 실제 적용 결과는 별도로 확인합니다.",proposalSummary(p,decision),()=>{
if(!canAct()||model.condition==="missing"||model.condition==="conflict"||model.proposalMode!=="current"||proposalKey(proposalData(kind))!==key){
model.proposalAlerts[kind]="제안 내용이나 확인 조건이 변경되었습니다. 현재 제안을 다시 확인한 뒤 검토해 주세요.";render(false);$("#live").textContent=model.proposalAlerts[kind];return;}
if(!model.proposalResults[key])model.proposalResults[key]={ref:"DEMO-"+String(++model.counter).padStart(4,"0"),decision,status:model.state==="normal"?"confirmed":"unknown"};
const r=model.proposalResults[key];proposalComplete(kind,p,r);render(true);
$("#live").textContent=r.status==="unknown"?"동의·거절 접수 결과 확인이 필요합니다.":"해당 제안 버전의 의사를 확인했습니다.";
},b);
});
document.querySelectorAll("[data-proposal-refresh]").forEach(b=>b.onclick=()=>{
const kind=b.dataset.proposalRefresh;if(model.proposalMode==="changed")model.proposalVersions[kind]++;
model.proposalMode="current";model.proposalAlerts[kind]="";render(true);
});
document.querySelectorAll("[data-proposal-recheck]").forEach(b=>b.onclick=()=>{
const kind=b.dataset.proposalRecheck,p=proposalData(kind),r=model.proposalResults[proposalKey(p)];
if(model.proposalMode!=="current"||model.state!=="normal"){$("#live").textContent="같은 요청의 결과가 아직 미확인입니다.";return;}
r.status="confirmed";proposalComplete(kind,p,r);render(true);$("#live").textContent="기존 제안·버전·요청에 연결된 결과를 확인했습니다.";
});
$("#user-mode")?.addEventListener("change",e=>{
model.userDraft=e.target.value==="invite"?{id:"new",mode:"invite",name:"",email:"",department:"IT",site:"서울",active:false,admin:false,roles:[]}: {mode:"edit",...cloneDemo(model.users[0])};render(true);
});
$("#user-person")?.addEventListener("change",e=>{model.userDraft={mode:"edit",...cloneDemo(model.users.find(u=>u.id===e.target.value))};render(true);});
const uf=$("#customer-user-form");
if(uf){
const capture=()=>{const d=model.userDraft;d.name=$("#user-name").value;d.email=$("#user-email").value;d.department=$("#user-department").value;d.site=$("#user-site").value;d.active=$("#user-active")?.checked||false;d.admin=$("#user-admin").checked;d.reason=$("#user-reason").value;};
uf.addEventListener("input",capture);uf.addEventListener("change",capture);
uf.onsubmit=e=>{
e.preventDefault();if(!uf.reportValidity())return;capture();
const d=cloneDemo(model.userDraft),old=model.users.find(u=>u.id===d.id),next=old?model.users.map(u=>u.id===d.id?{...u,...d}:u):model.users;
const last=old&&adminCount()>0&&adminCount(next)===0;
let summary=["대상 기업: 새봄테크","대상: "+d.name,"이메일: "+d.email,"소속: "+(old?old.site+"·"+old.department+" → ":"")+d.site+"·"+d.department,"활성: "+(old?(old.active?"활성":"비활성")+" → ":"")+(d.mode==="invite"?"초대 확인 대기":d.active?"활성":"비활성"),"관리자 권한: "+(old?(old.admin?"있음":"없음")+" → ":"")+(d.admin?"있음":"없음"),"사유: "+d.reason].join("\n");
if(last)summary+="\n주의: 이 변경 후 기업 관리자가 0명이 됩니다. 다른 사용자의 권한·활성 상태는 유지하며 내부 직원의 근거 확인 후 관리자 재지정이 필요합니다.";
openConfirm(d.mode==="invite"?"담당자 초대 내용 확인":"소속·활성·관리자 변경 확인",last?"마지막 관리자 회수·비활성화도 경고 후 허용합니다. 다른 사용자 권한을 자동 중단하지 않습니다.":"원래 내용과 변경 대상·소속·상태를 확인하세요.",summary,()=>{
if(!canAct()||model.condition==="missing"||model.condition==="conflict"||model.state!=="normal"){model.managementResult="변경 결과 미확인 · 마지막 확인 내용을 유지합니다.";render(false);focusManagementResult();return;}
if(old)model.users=model.users.map(u=>u.id===d.id?{...u,...d,pending:d.active?false:u.pending}:u);
else model.users.push({...d,id:"person-"+(model.users.length+1),pending:true,active:false});
model.managementResult=old?"담당자 변경 결과 확인":"초대 요청 접수 · 활성 확인 대기";
model.managementHistory.unshift(d.name+" · "+(old?old.site+"·"+old.department+" → ":"")+d.site+"·"+d.department+" · "+(last?"관리자 0명 경고 확인 · ":"")+d.reason);
model.userDraft=null;render(false);focusManagementResult();
},uf.querySelector('button[type="submit"]'));
};
}
$("#role-select")?.addEventListener("change",e=>{model.roleDraft=e.target.value==="new"?freshRole():cloneDemo(model.roles.find(r=>r.id===e.target.value));render(true);});
$("#role-name")?.addEventListener("input",e=>model.roleDraft.name=e.target.value);
document.querySelectorAll("[data-enable-action]").forEach(i=>i.onchange=()=>{
const id=i.dataset.enableAction;if(i.checked)model.roleDraft.actions[id]=[{type:"combination",site:"서울",department:"IT"}];else delete model.roleDraft.actions[id];refreshEditor('[data-enable-action="'+id+'"]');
});
document.querySelectorAll("[data-add-scope]").forEach(b=>b.onclick=()=>{model.roleDraft.actions[b.dataset.addScope].push({type:"combination",site:"부산",department:"IT"});refreshEditor('[data-add-scope="'+b.dataset.addScope+'"]');});
document.querySelectorAll("[data-remove-scope]").forEach(b=>b.onclick=()=>{model.roleDraft.actions[b.dataset.removeScope].splice(Number(b.dataset.index),1);refreshEditor('[data-add-scope="'+b.dataset.removeScope+'"]');});
document.querySelectorAll("[data-scope-prop]").forEach(i=>i.onchange=()=>{
const row=i.closest("[data-scope-action]");model.roleDraft.actions[row.dataset.scopeAction][Number(row.dataset.scopeIndex)][i.dataset.scopeProp]=i.value;refreshEditor('#'+i.id);
});
const rf=$("#customer-role-form");
if(rf)rf.onsubmit=e=>{
e.preventDefault();if(!rf.reportValidity())return;
const d=cloneDemo(model.roleDraft);if(Object.values(d.actions).some(scopes=>!scopes.length)){$("#role-error").textContent="허용한 행위에는 하나 이상의 범위가 필요합니다.";$("#role-error").focus();return;}
const summary=["역할: "+d.name,"대상: 자기 기업 새봄테크",...CUSTOMER_ACTIONS.map(([id,name])=>name+": "+(d.actions[id]?.map(scopeText).join(" / ")||"미부여")),"조회·제출 등의 범위를 서로 교차 확대하지 않습니다."].join("\n");
openConfirm("역할과 행위별 최종 범위 확인","선택한 행위 각각의 최종 범위를 확인하세요. 직원 전용 권한은 포함하지 않습니다.",summary,()=>{
if(!canAct()||model.condition==="missing"||model.condition==="conflict"||model.state!=="normal"){model.managementResult="역할 변경 결과 미확인 · 기존 역할 유지";render(false);focusManagementResult();return;}
if(d.id==="new"){d.id="role-"+(model.roles.length+1);model.roles.push(d);}else model.roles=model.roles.map(r=>r.id===d.id?d:r);
model.roleDraft=cloneDemo(d);model.managementResult="역할 정의·행위별 범위 확인";model.managementHistory.unshift(d.name+" · 행위별 범위 정의/정정 근거 보존");render(false);focusManagementResult();
},rf.querySelector('button[type="submit"]'));
};
$("#grant-user")?.addEventListener("change",e=>{model.grantUser=e.target.value;model.grantDraft=[...model.users.find(u=>u.id===e.target.value).roles];render(true);});
document.querySelectorAll("[data-grant-role]").forEach(i=>i.onchange=()=>{const id=i.dataset.grantRole;if(i.checked&&!model.grantDraft.includes(id))model.grantDraft.push(id);if(!i.checked)model.grantDraft=model.grantDraft.filter(x=>x!==id);});
const gf=$("#customer-grant-form");
if(gf)gf.onsubmit=e=>{
e.preventDefault();const user=model.users.find(u=>u.id===model.grantUser),ids=[...model.grantDraft],newUser={...user,roles:ids},effective=effectivePermissions(newUser);
const names=list=>list.map(id=>model.roles.find(r=>r.id===id)?.name||id).join(", ")||"없음";
const summary=["기업: 새봄테크","대상: "+user.name,"원래 역할: "+names(user.roles),"변경 역할: "+names(ids),...CUSTOMER_ACTIONS.map(([id,name])=>name+": "+(effective.actions[id]?.map(scopeText).join(" / ")||"미부여")),"소속·활성·다른 사용자의 역할은 자동 변경하지 않습니다."].join("\n");
openConfirm("역할 부여·회수와 최종 범위 확인","같은 행위의 범위만 합산합니다. 관리 권한을 주문·대금·발급 조회로 자동 확대하지 않습니다.",summary,()=>{
if(!canAct()||model.condition==="missing"||model.condition==="conflict"||model.state!=="normal"){model.managementResult="부여·회수 결과 미확인 · 기존 권한 유지";render(false);focusManagementResult();return;}
model.users=model.users.map(u=>u.id===user.id?{...u,roles:ids}:u);model.managementHistory.unshift(user.name+" · 역할 "+names(user.roles)+" → "+names(ids));model.managementResult="역할 부여·회수 결과 확인";render(false);focusManagementResult();
},gf.querySelector('button[type="submit"]'));
};
}
