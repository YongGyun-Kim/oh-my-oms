"use strict";
const $ = s => document.querySelector(s);
const escapeText = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const won = n => new Intl.NumberFormat("ko-KR").format(n) + "원";
const model = {route:"C01",step:1,type:"HW",qty:{HW01:1,HW02:0,SW01:1,SW02:0},provision:"full",state:"normal",condition:"allowed",results:{},drafts:{},counter:0,allocated:1200000,manualRequested:false,manualApplied:false,periodRequested:false,periodApproved:false,periodApplied:false,licenseForm:"term"};
initDetailedDemo(model);
let pending = null;
let dialogInvoker = null;
const badge = (t,c="") => '<span class="badge '+c+'">'+escapeText(t)+'</span>';
const panel = (title,body) => '<section class="panel"><h2>'+title+'</h2>'+body+'</section>';
const table = (title,headers,rows) => '<div class="table-wrap"><table><caption>'+title+'</caption><thead><tr>'+headers.map(x=>'<th scope="col">'+x+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const dl = entries => '<dl>'+entries.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join("")+'</dl>';
const link = (id,label) => '<a href="#'+id+'">'+label+'</a>';
const field = (name,label,value="",type="text",extra="") => '<div class="field"><label for="'+name+'">'+label+'</label><input id="'+name+'" name="'+name+'" type="'+type+'" value="'+escapeText(value)+'" '+extra+'></div>';
const selectedLines = () => OMS_DEMO.products.filter(p=>p.type===model.type && model.qty[p.id]>0);
const canReadPayment = () => model.condition!=="viewonly";
const canReadEntitlement = () => model.condition!=="viewonly";
const canAct = () => model.condition!=="viewonly";
const permissionNotice = () => badge("조회 권한 없음");
const timeline = () => '<ol class="timeline">'+[
{title:"주문 전체 확정",when:"2026-10-05 11:20 · 조건 확인",category:"order"},
{title:"지급 근거 확인",when:"2026-10-05 14:10 · 관련 지급만 반영",category:"payment"},
{title:"일부 제공 결과 확인",when:"2026-10-06 09:30 · 실제 수량과 잔량 기록",category:"order"}
].filter(e=>e.category!=="payment"||canReadPayment()).map(e=>'<li><strong>'+e.title+'</strong><small>'+e.when+'</small></li>').join("")+'</ol>';
const orderRows = () => [
[link("C04","OM-26-HW-0181"),"하드웨어",badge("확정","good"),canReadPayment()?badge("선불 확인 · 후불 별도"):permissionNotice(),"3 / 8개 제공"],
[link(canReadEntitlement()?"C05":"C04","OM-26-SW-0182"),"소프트웨어 · 기간제",badge("확정","good"),canReadPayment()?badge("지급 확인","good"):permissionNotice(),canReadEntitlement()?"발급 확인 · 합의 시작 대기":"발급 결과 조회 권한 없음"],
[link(canAct()?"C06":"C04","OM-26-HW-0175"),"하드웨어",badge("취소 검토","warn"),canReadPayment()?badge("환불 결과 확인 필요","warn"):permissionNotice(),"회수 일부 완료"]
];
function orders(staff=false){return table("주문 목록",["주문","타입","판매 판단","지급","제공/후속"],orderRows().map(r=>staff?[r[0].replace("#C04","#S03").replace("#C05","#S05").replace("#C06","#S06"),...r.slice(1)]:r));}
function statuses(){
const payment=canReadPayment()?badge("선불 확인 · 후불 별도")+'<p>청구와 지급 결과를 따로 확인합니다.</p>':permissionNotice()+'<p>청구·지급 정보 조회 권한이 없습니다.</p>';
return '<div class="summary-grid"><section class="status-block"><h2>판매 판단</h2>'+badge("주문 전체 확정","good")+'<p>제출 당시 가격·조건을 유지합니다.</p></section><section class="status-block"><h2>청구·지급</h2>'+payment+'</section><section class="status-block"><h2>상품 제공</h2>'+badge("일부 제공","warn")+'<p>3 / 8개 완료 · 잔량 5개</p></section></div>';
}
function softwareTerms(){
if(model.licenseForm==="perpetual")return panel("영구 이용 권한",dl([["상품","설계 소프트웨어 Basic"],["대상","새봄테크 · 기업 단위 10개"],["이용형","영구"],["발급 상태","확인 완료"]])+'<p class="hint">영구형에는 계약 종료일이나 기간제 갱신을 표시하지 않습니다.</p>');
return panel("계약 기간과 실제 이용 기간",dl([["상품","보안 소프트웨어 Standard"],["대상","새봄테크 · 기업 단위 10개"],["계약 이용 기간","2026-12-01 ~ 2027-11-30"],["마지막 확인 실제 기간",model.periodApplied?"2026-11-20 ~ 2027-12-10":"2026-11-24 ~ 2027-12-07"],["추가 기간 근거","설치 확인 조기 이용 · 장애 보상 연장"],["제공 완료 판단","발급·결과 제공 확인 / 합의 시작일 도달 확인"]])+'<p class="hint">계약 기간과 실제 기간은 구분합니다. 조기 이용은 후불 지급 기한을 앞당기지 않습니다.</p>');
}
function renewalResult(){
if(model.manualApplied)return '<section class="result"><h3>고객 요청 갱신 처리 완료</h3>'+dl([["처리 방식","일회 수동 갱신 · 자동 갱신 합의 없음"],["적용 회차","2027-12-01 시작 회차"],["실제 적용 기간","2027-12-01 ~ 2028-11-30"],["확인 금액",won(model.manualFee)],["지급/권한 결과","지급 조건 확인 · 기간 적용 결과 확인"],["보상 기간","기존 근거 보존 · 중첩 조정은 해당 합의에 따름"]])+'<p>실제 결과가 확인된 회차입니다. 향후 자동 갱신 신청과는 별개입니다.</p></section>';
if(model.manualRequested)return '<div class="callout info"><h3>갱신 요청 접수 · 직원 확인 대기</h3><p>원래 이용 기간을 유지합니다. 갱신 기간 적용은 아직 확인되지 않았습니다.</p></div>';
return '<p class="hint">고객의 갱신 요청과 실제 기간 적용은 별도로 확인합니다.</p>';
}
function catalog(staff=false){return panel(staff?"판매 상품 목록":"허용된 상품",table("판매 조건",["상품","타입/이용형","단가","지급 조건","다음 행동"],OMS_DEMO.products.map(p=>[escapeText(p.name),p.form,won(p.price),p.payment,staff?"아래 등록/예외 업무에서 검토":'<button type="button" data-order-type="'+p.type+'">주문 작성</button>'])));}
function bodyFor(route){
switch(route){
case "C01":return panel("확인할 업무",'<div class="task-row"><div><strong>하드웨어 제공 잔량 확인</strong><p>3 / 8개 제공 · 다음 출고 결과를 기다리고 있습니다.</p></div>'+link("C04","주문 확인")+'</div>'+(canReadEntitlement()?'<div class="task-row"><div><strong>기간제 이용 권한·갱신 확인</strong><p>계약 기간과 실제 기간, 갱신 요청 결과를 확인하세요.</p></div>'+link("C05","권한 확인")+'</div>':'<p class="hint">발급 결과 조회 권한이 없습니다.</p>'))+panel("진행 중인 주문",orders())+panel("최근 알림",canAct()?'<p><strong>요청 처리 결과를 확인해 주세요.</strong> '+link("C06","요청 상세 확인")+'</p>':'<p>허용된 주문 진행을 확인해 주세요. '+link("C04","주문 상세")+'</p>');
case "C02":return catalog();
case "C03":return orderForm();
case "C04":return statuses()+panel("주문 품목",table("수량별 진행",["상품","주문","확인 제공","잔량","제공 방식"],[["업무용 서버 A","4개","2개","2개","부분 제공 합의"],["네트워크 장비 B","4개","1개","3개","부분 제공 합의"]]))+'<div class="grid">'+panel("청구 정보",!canReadPayment()?'<p>청구 정보 조회 권한이 없습니다.</p>':dl([["주문 가격","6,000,000원"],["선불 대상","4,800,000원"],["후불 대상","1,200,000원"],["후불 기한","제공 건별 완료와 합의 일수 기준"]]))+panel("지급 결과",!canReadPayment()?'<p>지급 결과 조회 권한이 없습니다.</p>':dl([["확인 지급","선불 4,800,000원"],["후불","완료 제공 건별 별도 추적"],["근거","확인된 지급 참조와 관련 주문 연결"]]))+'</div>'+panel("다음 조치",canAct()?link("C06","주문 전체 변경·취소·반품 요청"):"<p>현재는 주문 조회만 허용되어 있습니다.</p>")+proposalPanel("order")+panel("처리 이력",timeline());
case "C05":return '<div class="field"><label for="license-form">이용형</label><select id="license-form"><option value="term" '+(model.licenseForm==="term"?"selected":"")+'>기간제</option><option value="perpetual" '+(model.licenseForm==="perpetual"?"selected":"")+'>영구</option></select></div>'+(!canReadEntitlement()?panel("사용 권한","<p>발급 결과 조회 권한이 없습니다. 허용된 주문 정보는 주문 상세에서 확인할 수 있습니다.</p>"+link("C04","주문 상세")):softwareTerms()+(model.licenseForm==="term"?proposalPanel("renewal")+panel("갱신 회차와 처리 결과",renewalResult()+dl([["기업 계약","개별 갱신 신청보다 우선"],["자동 갱신","신청과 직원의 합의 확인을 구별"],["미지급 유예","명시적 계약이 있을 때만 적용"]])):""));
case "C06":return panel("전체 주문 요청",dl([["대상","OM-26-HW-0175 · 주문 전체"],["고객 요청","주문 전체 반품"],["판단","계약·실제 제공 근거 확인"],["회수","2 / 4개 확인 · 잔량 2개"],["환불","요청과 실제 결과 별도 · 결과 확인 필요"]])+'<p class="hint">고객은 특정 품목이나 수량만 요청할 수 없습니다. 내부 처리의 부분 결과는 각각 표시합니다.</p>')+panel("요청 이력",timeline());
case "C07":return customerUsersPanel();
case "C08":return customerRolesPanel();
case "C09":return panel("적용 중인 기업 계약",dl([["고객사","새봄테크"],["상품 범위","합의된 상품별 조건"],["유효 근거","서명 합의 참조 AGR-DEMO-01"],["변경 요청","요청·합의·내부 승인·실제 적용 별도"],["우선순위","기업 계약 우선"]]))+panel("변경 전후 확인","<p>변경 요청 접수나 조건 입력만으로 기존 유효 계약을 바꾸지 않습니다. 두 유효 합의가 상충하면 확인 대상으로 남깁니다.</p>");
case "S01":return panel("확인·판단이 필요한 업무",table("처리 업무",["대상","업무","이유","다음 조치"],[[link("S03","OM-26-HW-0181"),"주문 전체 판단","일부 공급 근거 미확인","전체 조건 확인"],[link("S09","PAY-DEMO-02"),"미배분 지급","배분 대상 불명확","참조·근거 대조"],[link("S05","ENT-DEMO-03"),"SW 결과 확인","발급 응답 미확인","기존 결과 대조"],[link("S08","AGR-DEMO-01"),"계약 승인","다른 승인자 확인 필요","등록 내용·합의 근거 검토"]]))+panel("일반 주문 조회",link("S07","진행·완료 주문 모두 확인"));
case "S02":return catalog(true)+panel("등록·예외 적용 경계","<p>판매 상품 등록은 내부 권한 있는 직원만 수행합니다. 타입별 필수 판매 정보를 확인하고, 계약 조건에 해당하는 공개·가격 예외는 계약 승인 경로를 거칩니다.</p>"+link("S08","계약 등록·승인 확인"));
case "S03":return panel("주문 전체 판단 근거",table("품목 조건",["품목","거래 조건","공급·납기","판단"],[["업무용 서버 A","제출 가격·선불 정책 유지","확인 근거 있음","조건 확인"],["네트워크 장비 B","후불·부분 제공 합의","추가 근거 확인 필요","전체 직원 확인 대기"]]))+panel("제출 가격과 수락","<p>일부 품목만 자동 확정하지 않습니다. 제출 가격을 바꾸어 진행하려면 고객의 새 동의가 필요합니다. 조회 실패·업무 미확인·계약 충돌을 구분합니다.</p>");
case "S04":return panel("지급·제공 정책",dl([["제공 방식","부분 제공 합의"],["확보 정책","품목별 합의 정책에 따름"],["선불","주문 내 선불 대상과 후불 대상 분리"],["완료 기준","품목별 배송 근거 또는 고객 인수"]]))+panel("요청과 실제 결과",table("HW 수량별 이행",["상품","주문","확보","실제 출고","제공 완료","잔량"],[["업무용 서버 A","4","4","2","2","2"],["네트워크 장비 B","4","3","1","1","3"]]))+panel("근거·재처리","<p>직원 등록과 외부 결과의 출처·참조를 보존합니다. 성공 여부가 미확인이면 결과를 먼저 대조하고, 확정 실패는 원인 해소 후 실패 잔량만 재처리합니다.</p>");
case "S05":return softwareTerms()+panel("고객 요청 갱신",renewalResult()+'<p class="hint">유효 일회 갱신의 계약·가격·지급 조건과 실제 적용 결과를 확인합니다. 자동 갱신 합의는 필수 조건이 아닙니다.</p><button id="manual-renewal-check" type="button" '+(!model.manualRequested?"disabled":"")+'>고객 요청 갱신 적용 결과 확인</button>'+(!model.manualRequested?'<p class="hint">고객 갱신 요청을 접수한 뒤 결과를 확인할 수 있습니다.</p>':""))+panel("기간 조정 진행",dl([["요청",model.periodRequested?"요청 등록":"요청 전"],["별도 승인",model.periodApproved?"승인 완료":"미승인"],["실제 적용",model.periodApplied?"변경 결과 확인":"마지막 확인 기간 유지"]])+'<p class="hint">두 권한을 가진 요청자는 별도 승인할 수 있습니다. 계약 조건의 자기 승인 금지와는 다른 규칙입니다.</p>');
case "S06":return panel("요청 판단과 후속 실행",table("대상별 결과",["업무","요청/판단","실제 결과","남은 조치"],[["주문 전체 반품","검토 완료","HW 회수 일부 확인","잔량 회수 확인"],["SW 권한 회수","승인·요청","결과 미확인","같은 요청 결과 대조"],["환불","승인·요청","일부 결과 확인","잔액·미확인 대조"]]))+panel("상충 근거","<p>원래 값·출처·차이·판단·정정을 함께 남깁니다. 이 사실에 의존하는 추가 출고·발급·환불만 보류하며 관련 없는 업무를 일괄 중단하지 않습니다.</p>");
case "S07":return panel("권한 내 모든 주문",orders(true))+panel("조회 범위","<p>대기 업무뿐 아니라 진행·완료 주문을 조회합니다. 대금·발급 결과와 실행 행위는 각각의 권한이 필요합니다.</p>");
case "S08":return panel("합의 근거와 승인 대상",dl([["고객사","새봄테크"],["등록 내용","상품별 거래·갱신 조건 / 내용 버전 3"],["합의 근거","AGR-DEMO-01 · 확인 대상 버전 연결"],["등록자","박등록"],["승인자",model.condition==="self"?"박등록 · 등록자 본인":"이승인 · 다른 사람"],["유효 시점","합의된 적용 시점, 기존 주문 자동 덮어쓰기 없음"]]))+panel("등록자와 승인자 분리","<p>동일인은 다른 역할·계정을 사용해도 자기 등록을 승인할 수 없습니다. 다른 승인자가 없으면 미승인 상태를 유지합니다.</p>");
case "S09":return panel("확인 지급과 배분 잔액",dl([["대상 지급","PAY-DEMO-02 · SW 주문 관련 참조"],["확인 지급액",won(1800000)],["기존 배분",won(model.allocated)],["미배분 잔액",won(1800000-model.allocated)],["대조 출처","직원 근거 / 외부 참조 각각 유지"]]))+panel("청구·후불·환불 구별","<p>명확한 참조와 사전 배분 규칙만 자동 연결합니다. 제공 건별 완료일·합의 일수로 후불 기한을 판단하고, 확인되지 않은 지급을 연체로 단정하지 않습니다.</p><p>환불은 합의 대상·잔액·요청·실제 결과·실패 잔량을 따로 추적합니다.</p>");
case "S10":return panel("기업 신청과 관리자 확인",table("확인 대상",["기업","업무","확인 근거","상태"],[["새봄테크","최초 기업 이용 승인","기업·최초 관리자 확인","확인 대기"],["다온엔지니어링","관리자 재지정","새 지정자의 기업 관리 근거","근거 확인 필요"]]))+panel("권한 구분","<p>기업 확인과 관리자 지정에 필요한 권한을 따로 확인합니다. 마지막 관리자 부재가 다른 사용자의 자동 중단을 뜻하지 않습니다.</p>");
case "S11":return panel("내부 역할과 업무 권한",table("역할의 행위",["역할 예시","허용 행위","자동 포함하지 않는 행위"],[["거래 운영","상품/주문·계약 등록","계약 자기 승인"],["대금 담당","청구·지급·배분","기간 직접 변경"],["권한 관리자","역할·계정 복구","전체 거래 데이터 조회"]]))+panel("계정 복구","<p>권한과 확인된 본인 근거가 필요합니다. MFA 재등록·기존 수단 무효화·처리 이력·당사자 알림을 연결합니다. 이메일 접근만으로 MFA를 해제하지 않습니다.</p>");
case "A01":return panel("로그인과 추가 인증",'<form id="auth-form">'+field("auth-email","이메일","demo@example.invalid","email",'autocomplete="username" required')+field("auth-code","추가 인증 값","","text",'autocomplete="one-time-code" required aria-describedby="auth-hint"')+'<p id="auth-hint" class="hint">등록한 추가 인증 수단의 값을 입력하세요. 붙여넣기를 사용할 수 있습니다.</p><button class="primary" type="submit">추가 인증 확인</button></form><div id="auth-result"></div>')+panel("도움",link("A03","인증 수단을 사용할 수 없나요?")+" · "+link("A02","기업 이용 신청"));
case "A02":return panel("이용 신청 안내","<p>기업과 최초 관리자를 확인한 뒤 거래를 시작할 수 있습니다. 확인 대기 중에는 주문을 제출할 수 없습니다.</p>");
case "A03":return panel("복구 경로","<p>사전에 발급된 복구 코드 또는 별도로 등록한 수단을 확인합니다. 사용할 수 없는 경우 담당자의 본인 확인 경로로 연결합니다.</p><p>복구는 새 인증 수단 등록과 기존 수단 무효화·알림을 포함합니다.</p>"+link("A01","로그인으로 돌아가기"));
default:return "";
}}
function orderForm(){
const products=OMS_DEMO.products.filter(p=>p.type===model.type);
const steps='<ol class="steps" aria-label="주문 작성 단계">'+["상품·수량","조건 확인","전체 검토"].map((s,i)=>'<li '+(model.step===i+1?'aria-current="step"':"")+'>'+String(i+1)+'. '+s+'</li>').join("")+'</ol>';
let body="";
if(model.step===1)body='<div class="field"><label for="order-type">상품 타입</label><select id="order-type"><option value="HW" '+(model.type==="HW"?"selected":"")+'>하드웨어</option><option value="SW" '+(model.type==="SW"?"selected":"")+'>소프트웨어</option></select></div>'+products.map(p=>'<div class="item"><div class="item-top"><div><h3>'+p.name+'</h3><p class="hint">'+p.form+' · '+won(p.price)+' · '+p.payment+'</p></div><div class="field"><label for="qty-'+p.id+'">'+p.name+' 수량</label><input id="qty-'+p.id+'" data-qty="'+p.id+'" type="number" min="0" step="1" value="'+model.qty[p.id]+'"></div></div></div>').join("")+'<p class="hint">하드웨어와 소프트웨어는 서로 다른 주문으로 제출합니다. 수량 0은 선택하지 않음입니다.</p>';
else if(model.step===2)body=table("품목별 조건",["상품","수량","이용형/기간","지급"],selectedLines().map(p=>[p.name,String(model.qty[p.id]),p.term,p.payment]))+'<fieldset><legend>제공 방식</legend><label class="choice"><input type="radio" name="provision" value="full" '+(model.provision==="full"?"checked":"")+'>일괄 제공 — 전체 상품이 준비된 경우 제공</label><label class="choice"><input type="radio" name="provision" value="partial" '+(model.provision==="partial"?"checked":"")+'>부분 제공 허용 — 품목별 지급·제공 조건 충족 시 제공</label></fieldset><p class="hint">상품별 조건을 유지합니다. 미확인 조건은 직원 확인으로 연결하며 확인되지 않은 값을 임의 적용하지 않습니다.</p>';
else body=table("제출 내용",["상품","수량","단가","지급","이용 조건"],selectedLines().map(p=>[p.name,String(model.qty[p.id]),won(p.price),p.payment,p.term]))+'<div class="actions"><span>제공 방식: <strong>'+(model.provision==="full"?"일괄 제공":"부분 제공 허용")+'</strong></span><span>주문 금액: <strong>'+won(selectedLines().reduce((n,p)=>n+p.price*model.qty[p.id],0))+'</strong></span></div><p class="hint">제출 가격·조건을 확인하세요. 요청 접수는 지급·상품 제공 완료가 아닙니다.</p>';
return panel("주문 내용",steps+'<div id="order-error" class="validation" role="alert" tabindex="-1"></div>'+body+'<div class="actions">'+(model.step>1?'<button id="order-back" type="button">이전 단계</button>':"")+'<button id="order-next" class="primary" type="button">'+(model.step===3?"주문 요청 제출":"다음 단계")+'</button></div><div id="order-result"></div>');
}
function fieldsFor(story){
const id=story.id.replaceAll(".","-");
let out=field(id+"-target","대상",story.route.startsWith("A")?"새봄테크":"현재 선택한 주문·기업");
if(["US1.1","US1.3"].includes(story.id))out+=field(id+"-name","담당자","김담당")+field(id+"-email","담당자 이메일","demo@example.invalid","email",'required autocomplete="email"');
if(["US1.4","US1.6"].includes(story.id))out+='<fieldset><legend>행위별 권한·범위</legend><label class="choice"><input type="checkbox" name="read-all" checked>주문 조회 · 기업 전체</label><label class="choice"><input type="checkbox" name="submit-seoul" checked>주문 제출 · 서울·IT</label><label class="choice"><input type="checkbox" name="submit-busan">주문 제출 · 부산·IT</label></fieldset><p class="hint">선택한 행위의 범위만 합산합니다.</p>';
if(story.id==="US4.4")out+=field("allocation-amount","신규 배분 금액(원)",Math.max(0,1800000-model.allocated),"number",'min="1" step="1" required')+'<p class="hint">미배분 잔액: '+won(1800000-model.allocated)+'</p>';
else if(/^US4\./.test(story.id)||story.id==="US8.6"||story.id==="US7.8")out+=field(id+"-amount","금액(원)","600000","number",'min="1" step="1" required');
if(/^US[56]\./.test(story.id)||["US8.5","US8.11"].includes(story.id))out+=field(id+"-quantity","대상 수량","2","number",'min="1" step="1" required');
if(["US6.3","US6.4"].includes(story.id))out+='<div class="field-row">'+field(id+"-start","제안 실제 시작일","2026-11-20","date",'required')+field(id+"-end","제안 실제 종료일","2027-12-10","date",'required')+'</div>';
if(story.id==="US1.8")out+=field(id+"-code","사전 복구 코드","","text",'required autocomplete="one-time-code"');
if(/^US8\.[123]$/.test(story.id))out+='<p class="hint"><strong>요청 대상: 주문 전체</strong> · 개별 품목/수량 요청은 제공하지 않습니다.</p>';
if(!story.readOnly)out+='<div class="field"><label for="'+id+'-evidence">요청 사유·확인 근거</label><textarea id="'+id+'-evidence" name="evidence" required>'+(["US2.4","US2.6"].includes(story.id)?"합의 근거 AGR-DEMO-01 · 내용 버전 3":"확인된 대상과 업무 근거")+'</textarea></div>';
return out;
}
function actionForms(route){
if(model.condition==="viewonly")return panel("실행 권한","<p>현재는 주문 조회만 허용되어 있습니다. 대금·발급 결과와 실행 행위는 별도 권한이 필요합니다.</p>");
const stories=OMS_DEMO.stories.filter(s=>s.route===route&&!["US3.1","US3.6","US1.7","US3.5","US7.5","US1.3","US1.4","US1.5"].includes(s.id)&&!(route==="C05"&&model.licenseForm==="perpetual"&&s.id.startsWith("US7.")));
if(!stories.length)return "";
return panel("업무 확인·처리",stories.map(s=>'<details><summary>'+escapeText(s.title)+'</summary><form data-story="'+s.id+'">'+fieldsFor(s)+'<div class="validation" data-error role="alert" tabindex="-1"></div><button type="submit" class="primary">'+(s.readOnly?"결과 확인":"내용 검토")+'</button></form><div data-result="'+s.id+'"></div></details>').join(""));
}
function stateContent(screen){
const back=screen.kind==="staff"?"S01":screen.kind==="access"?"A01":"C01";
if(model.state==="denied")return panel("접근할 수 없습니다","<p>허용된 접속 환경과 업무 권한을 확인해 주세요. 업무 정보는 표시하지 않습니다.</p>"+link(back,"허용된 시작 화면으로 돌아가기"));
if(model.condition==="viewonly" && !["C01","C04","S07","S03","A01","A02","A03"].includes(screen.id))return panel("조회 권한이 없습니다","<p>현재는 주문 조회만 허용되어 있습니다. 이 업무의 정보는 표시하지 않습니다.</p>"+link(screen.kind==="staff"?"S07":"C04","허용된 주문 정보 확인"));

if(model.state==="empty")return '<section class="empty"><h2>현재 확인된 항목이 없습니다</h2><p>해당 범위 조회 결과는 0건입니다.</p>'+link(back,"시작 화면")+'</section>';
if(model.state==="loading")return '<section class="panel" aria-busy="true"><h2>내용을 확인하고 있습니다</h2><p role="status">조회·처리 결과를 기다려 주세요. 아직 완료로 확인되지 않았습니다.</p></section>';
if(model.state==="error")return '<section class="callout error"><h2>내용을 불러오지 못했습니다</h2><p>현재 업무 결과를 확인할 수 없습니다. 조회 실패를 미지급·발급 실패로 표시하지 않습니다.</p><button data-recheck-view>다시 조회</button></section>';
return (model.state==="partial"?'<div class="callout"><h2>일부 결과가 확인되었습니다</h2><p>확인 수량·금액과 잔량을 구분합니다. 전체 완료가 아닙니다.</p></div>':model.state==="unknown"?'<div class="callout"><h2>처리 결과 확인이 필요합니다</h2><p>마지막 확인 사실을 표시합니다. 새 요청 대신 기존 요청의 결과를 확인하세요.</p><button data-recheck-view>기존 결과 재확인</button></div>':"")+
(model.condition==="missing"?'<div class="callout"><h2>확인 근거가 부족합니다</h2><p>필요한 합의·대상 근거 확인 전 조건을 적용하지 않습니다.</p></div>':model.condition==="conflict"?'<div class="callout"><h2>근거가 서로 다릅니다</h2><p>원래 출처·차이·판단을 확인합니다. 관련 추가 처리는 대조 전 보류합니다.</p></div>':"")+
(model.condition==="viewonly"&&screen.id==="S03"?bodyFor("C04"):bodyFor(screen.id))+actionForms(screen.id);
}
function render(moveFocus=false){
const screen=OMS_DEMO.screens.find(s=>s.id===model.route)||OMS_DEMO.screens[0];
model.route=screen.id;
document.title=screen.title+" · OMS 화면 시안";
document.body.classList.toggle("staff",screen.kind==="staff");
$("#screen-picker").value=screen.id;
const navKind=screen.kind==="access"?"access":screen.kind;
$("#nav").innerHTML=OMS_DEMO.screens.filter(s=>s.kind===navKind&&(model.condition!=="viewonly"||["C01","C04","S07","S03","A01","A02","A03"].includes(s.id))).map(s=>'<a href="#'+s.id+'" '+(s.id===screen.id?'aria-current="page"':"")+'>'+s.title+'</a>').join("");
$("#nav-context").textContent=screen.kind==="staff"?"내부 업무":screen.kind==="customer"?"기업 업무":"이용·계정";
$("#user-context").innerHTML=screen.kind==="staff"?"내부 직원<br>허용 업무 범위":screen.kind==="customer"?"김담당<br>새봄테크":"이용·계정 확인";
$("#app-context").textContent=screen.kind==="staff"?"내부 직원 · PC / 허용 접속 환경 확인":screen.kind==="customer"?"새봄테크 · 허용 기업 문맥":"OMS · 이용·계정 확인";
$("#main").innerHTML='<div class="page-head"><div><p class="eyebrow">'+(screen.kind==="staff"?"내부 업무":screen.kind==="customer"?"새봄테크":"이용·계정")+'</p><h1 tabindex="-1">'+screen.title+'</h1><p>'+escapeText(screen.goal)+'</p></div>'+(screen.id==="C01"&&canAct()?'<a href="#C02">상품 확인·새 주문</a>':"")+'</div>'+stateContent(screen);
restoreDrafts();
attachHandlers();attachDetailedHandlers();
Object.keys(model.results).forEach(id=>showResult(id,false));
if(moveFocus)$("#main h1").focus();
}
function restoreDrafts(){
for(const form of document.querySelectorAll("form[data-story]")){
const id=form.dataset.story,draft=model.drafts[id];
if(draft)for(const input of form.elements)if(input.name in draft){if(input.type==="checkbox")input.checked=draft[input.name]==="on";else input.value=draft[input.name];}
}
}
function rememberForms(){
for(const form of document.querySelectorAll("form[data-story]"))model.drafts[form.dataset.story]=Object.fromEntries(new FormData(form).entries());
}
function openConfirm(title,description,summary,run,invoker){
pending=run;dialogInvoker=invoker;
$("#dialog-title").textContent=title;$("#dialog-description").textContent=description;$("#dialog-summary").innerHTML='<pre>'+escapeText(summary)+'</pre>';
$("#confirm-dialog").showModal();$("#cancel-confirm").focus();
}
$("#cancel-confirm").onclick=()=>$("#confirm-dialog").close();
$("#confirm-dialog").addEventListener("close",()=>{pending=null;if(dialogInvoker?.isConnected)dialogInvoker.focus();});
$("#commit-confirm").onclick=()=>{const fn=pending;dialogInvoker=null;$("#confirm-dialog").close();if(fn)fn();};
function commitStory(story,form){
const id=story.id;
const error=form.querySelector("[data-error]");
const fail=message=>{error.textContent=message;error.focus();$("#live").textContent=message;};
if(model.condition==="viewonly")return fail("이 업무 실행 권한이 없습니다.");
if(model.condition==="missing"||model.condition==="conflict")return fail("근거 확인·대조가 필요합니다. 실제 조건 적용이나 추가 실행을 하지 않습니다.");
if(id==="US2.6"&&model.condition==="self")return fail("등록자 본인은 다른 역할·계정으로도 이 계약을 승인할 수 없습니다. 다른 승인자의 확인이 필요합니다.");
if(model.results[id])return showResult(id,true);
if(["US5.7","US6.6","US8.6"].includes(id)&&model.state==="unknown")return fail("성공 여부가 미확인입니다. 기존 요청 결과를 먼저 대조해 주세요.");
if(id==="US4.4"){
const amount=Number(form.elements.namedItem("allocation-amount").value);
if(!Number.isInteger(amount)||amount<=0||amount>1800000-model.allocated)return fail("미배분 잔액 이내의 양의 정수 금액을 입력해 주세요. 중복·초과 배분할 수 없습니다.");
if(model.state==="normal")model.allocated+=amount;
}
if(id==="US6.4"&&!model.periodRequested)return fail("기간 조정 요청이 먼저 필요합니다. 요청과 승인은 별도 행동입니다.");
if(id==="US6.3"&&model.state==="normal")model.periodRequested=true;
if(id==="US6.4"&&model.state==="normal")model.periodApproved=true;
if(id==="US7.1"&&model.state==="normal")model.manualRequested=true;
const ref="DEMO-"+String(++model.counter).padStart(4,"0");
let text=story.readOnly?"선택한 대상의 확인 결과를 표시합니다. 권한 밖 정보와 미확인 사실을 완료로 표시하지 않습니다.":"요청을 접수했습니다. 판단·실제 적용 결과와 남은 조치를 별도로 확인해 주세요.";
if(id==="US4.4")text="확인 지급의 배분 결과를 기록했습니다. 지급 사실·배분·상품 제공 완료는 각각 별도입니다.";
if(id==="US2.6")text="다른 사람의 승인 확인 결과입니다. 합의 근거·내용 버전·유효 시점과 실제 적용 결과를 연결합니다.";
if(id==="US6.4")text="별도 승인 결과가 확인되었습니다. 실제 적용 결과를 확인하기 전에는 마지막 확인 기간을 유지합니다.";
if(id==="US7.1")text="고객 갱신 요청 접수 · 직원 확인 대기. 원래 기간을 유지하며 실제 적용 결과는 별도로 확인합니다.";
if(id==="US1.8"||id==="US1.9")text="복구 확인 절차 결과를 검토합니다. MFA 재등록·기존 수단 무효화·처리 이력·당사자 알림을 각각 확인해야 합니다.";
if(model.state==="unknown")text="기존 요청의 접수·실제 결과를 아직 확인하지 못했습니다. 마지막 확인 사실을 유지하고 추가 실행하지 않습니다.";
if(model.state==="partial")text="일부 결과만 확인되었습니다. 확인 수량·금액과 미완료 잔량은 별도로 추적하고 전체 완료로 표시하지 않습니다.";
model.results[id]={ref,status:model.state==="unknown"?"unknown":model.state==="partial"?"partial":"received",text};
if(["US4.4","US6.3","US6.4","US7.1"].includes(id)&&model.state==="normal")render(false);
showResult(id,true);$("#live").textContent="요청 결과가 표시되었습니다.";
}
function showResult(id,focus){
const area=document.querySelector('[data-result="'+id+'"]')||(id==="order"?$("#order-result"):null);
if(!area||!model.results[id])return;
const r=model.results[id],title=r.status==="unknown"?"접수·처리 결과 확인 필요":r.status==="partial"?"일부 결과 확인":"접수·확인 결과";
area.innerHTML='<section class="result"><h3 tabindex="-1">'+title+'</h3><p>요청 참조: '+r.ref+'</p><p>'+escapeText(r.text)+'</p>'+(r.status==="unknown"||id==="US6.4"?'<button type="button" data-recheck="'+id+'">기존 요청 결과 재확인</button>':"")+'</section>';
area.querySelector("[data-recheck]")?.addEventListener("click",()=>{
if(model.state==="unknown"){r.text="아직 실제 결과를 확인하지 못했습니다. 같은 요청을 확인하며 추가 실행하지 않습니다.";showResult(id,true);return;}
r.status="received";
if(id==="US6.3")model.periodRequested=true;
if(id==="US7.1")model.manualRequested=true;
if(id==="US6.4"&&model.periodApproved){model.periodApplied=true;r.text="승인된 실제 기간 적용 결과를 확인했습니다. 계약 기간은 보존합니다.";render(false);const a=document.querySelector('[data-result="'+id+'"]');a?.closest("details")?.setAttribute("open","");showResult(id,true);}
else{r.text="기존 요청의 확인 결과입니다. 새 요청이나 추가 업무 효과를 만들지 않습니다.";showResult(id,true);}
});
if(focus){area.closest("details")?.setAttribute("open","");area.querySelector("h3").focus();}
}
function attachHandlers(){
document.querySelectorAll("[data-order-type]").forEach(b=>b.onclick=()=>{model.type=b.dataset.orderType;model.step=1;location.hash="C03";});
$("#order-type")?.addEventListener("change",e=>{model.type=e.target.value;model.step=1;render(true);});
document.querySelectorAll("[data-qty]").forEach(i=>i.addEventListener("input",()=>model.qty[i.dataset.qty]=Number(i.value)));
document.querySelectorAll('[name="provision"]').forEach(i=>i.onchange=()=>model.provision=i.value);
$("#order-back")?.addEventListener("click",()=>{model.step--;render(true);});
$("#order-next")?.addEventListener("click",e=>{
if(!["allowed","self","ready"].includes(model.condition)){const el=$("#order-error");el.textContent=!canReadPayment()?"주문 제출 권한이 없습니다.":"확인 근거가 필요합니다. 조건 확인 전 임의 적용하지 않습니다.";el.focus();return;}
if(!selectedLines().length||OMS_DEMO.products.some(p=>p.type===model.type&&(!Number.isInteger(model.qty[p.id])||model.qty[p.id]<0))){const el=$("#order-error");const targetId='qty-'+OMS_DEMO.products.find(p=>p.type===model.type).id;el.innerHTML='<a href="#'+targetId+'" data-error-target="'+targetId+'">수량을 확인해 주세요.</a> 하나 이상의 상품에 양의 정수 수량이 필요합니다.';el.querySelector('a').onclick=event=>{event.preventDefault();document.getElementById(targetId).focus();};el.focus();return;}
if(model.step<3){model.step++;render(true);return;}
openConfirm("주문 요청 제출","대상 상품·수량·가격·제공 방식을 확인하세요. 접수는 지급·제공 완료가 아닙니다.",selectedLines().map(p=>p.name+" · "+model.qty[p.id]+"개 · "+won(p.price)+" · "+p.payment).join("\n")+"\n제공 방식: "+(model.provision==="full"?"일괄":"부분 허용"),()=>{
if(!model.results.order)model.results.order={ref:"DEMO-"+String(++model.counter).padStart(4,"0"),status:model.state==="unknown"?"unknown":"received",text:model.state==="unknown"?"원래 요청의 결과 확인이 필요합니다. 새 주문을 만들지 않습니다.":model.condition==="ready"?"주문 요청 접수 · 전체 품목의 조건·공급·납기 근거 확인으로 주문 전체 확정. 지급·상품 제공은 별도입니다.":"주문 요청 접수 · 주문 전체 직원 확인 대기. 일부 공급 근거 확인이 필요하며 일부 품목만 확정하지 않습니다."};
showResult("order",true);
},e.target);
});
$("#license-form")?.addEventListener("change",e=>{model.licenseForm=e.target.value;render(true);});
$("#manual-renewal-check")?.addEventListener("click",e=>openConfirm("고객 요청 갱신 결과 확인","일회 갱신의 계약·회차·가격·지급 조건과 실제 적용 근거를 확인합니다.","자동 갱신 합의 없음\n유효 일회 갱신·지급 조건 확인\n실제 적용 기간: 2027-12-01 ~ 2028-11-30\n확인 금액: "+won(model.manualFee),()=>{
if(model.condition==="viewonly"||model.condition==="missing"||model.condition==="conflict"||model.state!=="normal"){$("#live").textContent="실제 결과가 미확인 또는 근거 대기입니다.";const p=$("#manual-renewal-check").parentElement;p.insertAdjacentHTML("beforeend",'<p class="validation" role="alert">전체 실제 적용 결과 확인 필요. 원래 기간을 유지합니다.</p>');return;}
model.manualApplied=true;render(true);$("#live").textContent="실제 갱신 적용 결과를 확인했습니다.";
},e.target));
document.querySelectorAll("[data-recheck-view]").forEach(b=>b.onclick=()=>{model.state="normal";$("#state-picker").value="normal";render(true);$("#live").textContent="예시 기존 결과를 다시 확인했습니다.";});
document.querySelectorAll("form[data-story]").forEach(form=>form.addEventListener("submit",e=>{
e.preventDefault();if(!form.reportValidity())return;
const story=OMS_DEMO.stories.find(s=>s.id===form.dataset.story);
model.drafts[story.id]=Object.fromEntries(new FormData(form).entries());
if(story.readOnly){commitStory(story,form);return;}
const summary=Array.from(new FormData(form).entries()).map(([k,v])=>{
const input=form.elements.namedItem(k),label=input?.labels?.[0]?.textContent||k;
return (label||k)+": "+v;
}).join("\n");
openConfirm(story.title,"대상·원래 조건·변경 내용·근거를 확인하세요. 요청과 실제 적용은 별도입니다.",summary,()=>commitStory(story,form),form.querySelector('button[type="submit"]'));
}));
$("#auth-form")?.addEventListener("submit",e=>{
e.preventDefault();
$("#auth-result").innerHTML='<section class="result"><h3 tabindex="-1">'+(model.condition==="missing"?"추가 인증 확인 필요":"추가 인증 확인 결과")+'</h3><p>'+(model.condition==="missing"?"필요한 인증을 확인하기 전 업무 접근을 허용하지 않습니다.":"이 예시는 인증 결과 화면입니다. 실제 인증은 수행하지 않습니다. 기업 승인·행위 권한·직원 접속 조건은 별도 확인 대상입니다.")+'</p>'+link("C01","허용 고객 업무 예시 보기")+'</section>';
$("#auth-result h3").focus();
});
}
$("#screen-picker").innerHTML=OMS_DEMO.screens.map(s=>'<option value="'+s.id+'">'+(s.kind==="staff"?"직원 · ":s.kind==="customer"?"고객 · ":"접근 · ")+s.title+'</option>').join("");
$("#screen-picker").onchange=e=>{location.hash=e.target.value;};
$("#state-picker").onchange=e=>{rememberForms();model.state=e.target.value;render(true);};
$("#condition-picker").onchange=e=>{rememberForms();model.condition=e.target.value;render(true);};
$("#reset-demo").onclick=()=>location.reload();
window.addEventListener("hashchange",()=>{rememberForms();model.route=location.hash.slice(1);render(true);});
model.route=location.hash.slice(1)||"C01";render();
