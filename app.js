const INITIAL = window.INITIAL_DATA;
const LOGO = window.LOGO_URI;
const SUPABASE_URL="__SUPABASE_URL__";
const SUPABASE_KEY="__SUPABASE_KEY__";
const cloudClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
let cloudUser=null;
let cloudChannel=null;
let cloudSyncTimer=null;
let applyingRemote=false;

const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=> (crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random());

let db;
function migrate(seed,useLocal=true){
  let x=null;
  if(useLocal){try{x=JSON.parse(localStorage.getItem('sbv-db')||'null')}catch(e){x=null}}
  x=x||JSON.parse(JSON.stringify(seed));
  for(const k of ['products','customers','sales','inventory','lots','expenses']) if(!Array.isArray(x[k])) x[k]=JSON.parse(JSON.stringify(seed[k]||[]));
  x.quotes=Array.isArray(x.quotes)?x.quotes:[]; x.receipts=Array.isArray(x.receipts)?x.receipts:[];
  x.operators=Array.isArray(x.operators)&&x.operators.length?x.operators:[{id:'op-admin',name:'Administrador',pin:'1234',active:true}];
  x.operators.forEach(o=>{o.pin=String(o.pin||'1234'); if(o.active===undefined)o.active=true;});
  x.activityLog=Array.isArray(x.activityLog)?x.activityLog:[];
  x.currentOperatorId=null;
  x.settings=x.settings&&typeof x.settings==='object'?x.settings:{};
  x.settings.company_name=x.settings.company_name||'Silagem Baixa Verde';
  x.settings.slogan=x.settings.slogan||'Confiança e Qualidade';
  x.settings.cpf_cnpj=x.settings.cpf_cnpj||'';
  x.settings.phone=x.settings.phone||'';
  x.settings.whatsapp=x.settings.whatsapp||'';
  x.settings.email=x.settings.email||'';
  x.settings.address=x.settings.address||'';
  x.settings.city=x.settings.city||'';
  x.settings.state=x.settings.state||'';
  x.settings.primary_color=x.settings.primary_color||'#1f6b2a';
  x.settings.sidebar_color=x.settings.sidebar_color||'#102615';
  x.settings.background_color=x.settings.background_color||'#f4f7f3';
  x.settings.logo=x.settings.logo||'';
  x.settings.quote_valid_days=Number(x.settings.quote_valid_days||7);
  x.settings.document_footer=x.settings.document_footer||'Obrigado pela preferência.';
  x.settings.receipt_text=x.settings.receipt_text||'Declaramos o recebimento do valor acima referente à compra descrita neste recibo.';
  x.customers.forEach((c,i)=>{c.id=c.id||'c-'+i;c.name=c.name||'';c.cpf_cnpj=c.cpf_cnpj||'';c.phone=c.phone||'';c.email=c.email||'';c.address=c.address||'';c.number=c.number||'';c.complement=c.complement||'';c.neighborhood=c.neighborhood||'';c.city=c.city||'';c.state=c.state||'';c.zip=c.zip||'';c.type=c.type||'';c.notes=c.notes||''});
  const det={'Com grãos':'Silagem de milho com grãos — embalagem com média de 25 kg','Pouco grão':'Silagem de milho com menor concentração de grãos — embalagem com média de 25 kg','Sorgo':'Silagem de sorgo — embalagem conforme produção','Sal':'Sal / suplemento conforme especificação cadastrada'};
  x.products.forEach((p,i)=>{p.id=p.id||'p-'+i;p.name=p.name||'';p.unit=p.unit||'saco';p.sale_price=Number(p.sale_price||0);p.unit_cost=Number(p.unit_cost||0);p.details=p.details||det[p.name]||p.notes||p.name;p.average_weight=p.average_weight||(p.name==='Com grãos'?'25 kg':'');p.notes=p.notes||''});
  x.sales.forEach((s,i)=>{s.id=s.id||'s-'+i;s.source=s.source||'imported';s.invoice_number=s.invoice_number||'';s.sale_notes=s.sale_notes||'';s.receivable=Number(s.receivable||0);s.received=Number(s.received||0);s.total=Number(s.total||0);s.freight_charged=Number(s.freight_charged||0);s.freight_real=Number(s.freight_real||0)});
  x.lots.forEach((l,i)=>{l.id=l.id||'l-'+i;l.base_qty=Number(l.base_qty||0);l.sold=Number(l.sold||0);l.balance=Number(l.balance ?? (l.base_qty-l.sold));l.status=l.status||'EM USO'});
  x.expenses.forEach((e,i)=>{
    e.id=e.id||'e-'+i;
    e.payment=e.payment||'';
    e.payment_status=e.payment_status||(String(e.payment).toLowerCase()==='a pagar'?'A pagar':'Pago');
    e.paid_date=e.paid_date||'';
    e.paid_method=e.paid_method||(e.payment_status==='Pago'&&e.payment!=='A pagar'?e.payment:'');
    e.payment_note=e.payment_note||'';
  });
  return x;
}
function cloudPayload(){
 const copy=JSON.parse(JSON.stringify(db));
 copy.currentOperatorId=null;
 return copy;
}
function setCloudStatus(text,ok=true){
 const el=document.getElementById('cloudStatus');
 if(el){
   el.textContent=text;
   el.style.color=ok?'#267a36':'#a52319';
 }
}
function save(){
 localStorage.setItem('sbv-db',JSON.stringify(db));
 if(cloudUser&&!applyingRemote){
   clearTimeout(cloudSyncTimer);
   cloudSyncTimer=setTimeout(()=>pushCloudState(),500);
 }
}
async function pushCloudState(){
 if(!cloudUser)return;
 const {error}=await cloudClient.from('app_state').upsert({
   user_id:cloudUser.id,
   payload:cloudPayload(),
   updated_at:new Date().toISOString()
 },{onConflict:'user_id'});
 if(error){
   console.error('Erro ao sincronizar',error);
   setCloudStatus('Sem sincronizar',false);
 }else{
   setCloudStatus('Sincronizado',true);
 }
}
async function loadCloudStateOrSeed(){
 if(!cloudUser)return;
 setCloudStatus('Sincronizando...',true);
 const {data,error}=await cloudClient.from('app_state').select('payload,updated_at').eq('user_id',cloudUser.id).maybeSingle();
 if(error){
   console.error(error);
   setCloudStatus('Erro na nuvem',false);
   return;
 }
 if(data?.payload&&Object.keys(data.payload).length){
   const op=db?.currentOperatorId||null;
   applyingRemote=true;
   db=migrate(data.payload,false);
   db.currentOperatorId=op;
   localStorage.setItem('sbv-db',JSON.stringify(db));
   applyingRemote=false;
   applySettings();
 }else{
   await pushCloudState();
 }
 setCloudStatus('Sincronizado',true);
}
function setupRealtime(){
 if(!cloudUser)return;
 if(cloudChannel)cloudClient.removeChannel(cloudChannel);
 cloudChannel=cloudClient.channel(`app-state-${cloudUser.id}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'app_state',filter:`user_id=eq.${cloudUser.id}`},payload=>{
     const remote=payload.new?.payload;
     if(!remote)return;
     const op=db?.currentOperatorId||null;
     applyingRemote=true;
     db=migrate(remote,false);
     db.currentOperatorId=op;
     localStorage.setItem('sbv-db',JSON.stringify(db));
     applyingRemote=false;
     applySettings();
     setCloudStatus('Atualizado agora',true);
     const page=document.querySelector('nav button.active')?.dataset.page;
     if(page&&!document.getElementById('loginOverlay')&&!document.getElementById('cloudLoginOverlay'))go(page);
   })
   .subscribe();
}
async function finishCloudLogin(session){
 cloudUser=session.user;
 await loadCloudStateOrSeed();
 setupRealtime();
 applySettings();
 updateCloudAccountUI();
 showLogin();
}
function updateCloudAccountUI(){
 const el=document.getElementById('cloudAccount');
 if(el)el.textContent=cloudUser?.email||'';
}
function showCloudLogin(message=''){
 document.getElementById('cloudLoginOverlay')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div id="cloudLoginOverlay" style="position:fixed;inset:0;background:#0f2614;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px">
  <div class="card" style="width:min(460px,100%);padding:28px">
    <div style="text-align:center;margin-bottom:20px">
      <img src="${appLogo()}" style="width:120px;height:120px;object-fit:contain">
      <h2 style="margin:10px 0 4px">${esc(companyName())}</h2>
      <p style="color:#6d776e;margin:0">Conta da nuvem — PC e celular sincronizados</p>
    </div>
    <div class="field"><label>E-mail</label><input id="cloudEmail" type="email" autocomplete="username" placeholder="seuemail@exemplo.com"></div>
    <div class="field" style="margin-top:12px"><label>Senha da nuvem</label><input id="cloudPassword" type="password" autocomplete="current-password" placeholder="Mínimo 6 caracteres"></div>
    <div id="cloudLoginMsg" style="font-size:13px;margin-top:12px;color:${message?'#a52319':'#6d776e'}">${message||'Use a mesma conta no computador e no celular.'}</div>
    <button class="primary" id="cloudSignIn" style="width:100%;margin-top:18px">Entrar e sincronizar</button>
    <button class="secondary" id="cloudSignUp" style="width:100%;margin-top:9px">Criar minha conta</button>
  </div>
 </div>`);
 const email=document.getElementById('cloudEmail');
 const pass=document.getElementById('cloudPassword');
 const msg=document.getElementById('cloudLoginMsg');
 document.getElementById('cloudSignIn').onclick=async()=>{
   if(!email.value||!pass.value){msg.textContent='Informe e-mail e senha.';msg.style.color='#a52319';return}
   msg.textContent='Entrando...';msg.style.color='#6d776e';
   const {data,error}=await cloudClient.auth.signInWithPassword({email:email.value.trim(),password:pass.value});
   if(error){msg.textContent='Não foi possível entrar: '+error.message;msg.style.color='#a52319';return}
   document.getElementById('cloudLoginOverlay')?.remove();
   await finishCloudLogin(data.session);
 };
 document.getElementById('cloudSignUp').onclick=async()=>{
   if(!email.value||!pass.value||pass.value.length<6){msg.textContent='Informe um e-mail válido e uma senha com pelo menos 6 caracteres.';msg.style.color='#a52319';return}
   msg.textContent='Criando conta...';msg.style.color='#6d776e';
   const {data,error}=await cloudClient.auth.signUp({email:email.value.trim(),password:pass.value});
   if(error){msg.textContent='Não foi possível criar: '+error.message;msg.style.color='#a52319';return}
   if(data.session){
     document.getElementById('cloudLoginOverlay')?.remove();
     await finishCloudLogin(data.session);
   }else{
     msg.textContent='Conta criada. Abra seu e-mail e confirme o cadastro; depois clique em Entrar e sincronizar.';
     msg.style.color='#267a36';
   }
 };
 pass.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('cloudSignIn').click()});
}
const navItems=[['dashboard','Painel'],['reports','Relatórios mensais'],['activity','Operadores / Atividades'],['sale-new','Nova venda'],['receivables','A receber'],['sales','Histórico de vendas'],['products','Produtos'],['expenses','Gastos'],['customers','Clientes'],['inventory','Estoque'],['lots','Cargas / Lotes'],['quotes','Orçamentos'],['receipts','Recibos'],['settings','Configurações']];

function currentOperator(){return db.operators.find(o=>o.id===db.currentOperatorId)||null}
function operatorName(id,fallback='Não informado'){return db.operators.find(o=>o.id===id)?.name||fallback}
function logActivity(action,details=''){
  const op=currentOperator();
  db.activityLog.push({
    id:uid(),date:today(),
    time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    operator_id:op?.id||'',operator_name:op?.name||'Não informado',
    action,details
  });
  save();
}
function showLogin(){
  document.body.insertAdjacentHTML('beforeend',`<div id="loginOverlay" style="position:fixed;inset:0;background:#0f2614;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card" style="width:min(430px,100%);padding:28px">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${appLogo()}" style="width:120px;height:120px;object-fit:contain">
        <h2 style="margin:10px 0 4px">${esc(companyName())}</h2>
        <p style="color:#6d776e;margin:0">Acesso ao sistema</p>
      </div>
      <div class="field"><label>Operador</label>
        <select id="loginOperator">${db.operators.filter(o=>o.active!==false).map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-top:12px"><label>Senha / PIN</label><input id="loginPin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Digite sua senha"></div>
      <button class="primary" id="loginBtn" style="width:100%;margin-top:18px">Entrar</button>
      <div id="loginError" style="color:#a52319;font-size:13px;margin-top:10px;display:none">Senha incorreta.</div>
      <small style="display:block;color:#6d776e;margin-top:16px;text-align:center">Primeiro acesso: Administrador / PIN 1234</small>
    </div>
  </div>`);
  loginBtn.onclick=()=>{
    const op=db.operators.find(o=>o.id===loginOperator.value);
    if(!op||String(loginPin.value)!==String(op.pin)){loginError.style.display='block';loginPin.focus();return}
    db.currentOperatorId=op.id;
    loginOverlay.remove();
    logActivity('Acesso ao sistema','Login realizado');
    updateOperatorHeader();
    go('dashboard');
  };
  loginPin.addEventListener('keydown',e=>{if(e.key==='Enter')loginBtn.click()});
}
function updateOperatorHeader(){
  if(!document.getElementById('operatorBox'))return;
  const op=currentOperator();
  operatorBox.innerHTML=`<small style="color:#6d776e">Operador:</small><b>${esc(op?.name||'')}</b><button class="secondary" id="logoutBtn" style="padding:7px 10px">Sair</button>`;
  logoutBtn.onclick=()=>{logActivity('Saída do sistema','Logout');db.currentOperatorId=null;save();showLogin();};
}

function appLogo(){return db?.settings?.logo||LOGO}
function companyName(){return db?.settings?.company_name||'Silagem Baixa Verde'}
function companySlogan(){return db?.settings?.slogan||'Confiança e Qualidade'}
function applySettings(){
  const s=db.settings||{};
  document.documentElement.style.setProperty('--g',s.primary_color||'#1f6b2a');
  document.documentElement.style.setProperty('--sidebar',s.sidebar_color||'#102615');
  document.documentElement.style.setProperty('--bg',s.background_color||'#f4f7f3');
  document.querySelectorAll('.brand img,.top-logo').forEach(i=>i.src=appLogo());
  document.querySelectorAll('.brand strong').forEach(i=>i.textContent=companyName());
  document.querySelectorAll('.brand small').forEach(i=>i.textContent=companySlogan());
}
function renderNav(){nav.innerHTML=navItems.map(([id,t])=>`<button data-page="${id}" onclick="go('${id}')">${t}</button>`).join('')}
window.openMobileMore=function(){document.getElementById('mobileMore')?.classList.add('open');document.getElementById('mobileMoreBackdrop')?.classList.add('open');document.querySelectorAll('[data-mobile-page]').forEach(b=>b.classList.toggle('active',b.dataset.mobilePage==='more'))}
window.closeMobileMore=function(){document.getElementById('mobileMore')?.classList.remove('open');document.getElementById('mobileMoreBackdrop')?.classList.remove('open')}
function go(page){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));document.querySelectorAll('[data-mobile-page]').forEach(b=>b.classList.toggle('active',b.dataset.mobilePage===page));closeMobileMore();document.querySelector('.sidebar')?.classList.remove('open');const map={dashboard,reports,activity,saleNew,receivables,sales,products,expenses,customers,inventory,lots,quotes,receipts,settings};(map[page.replace('-new','New')]||dashboard)()}
menuBtn.onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
function title(t,s=''){pageTitle.textContent=t;pageSub.textContent=s}
function metric(l,v,n=''){return `<div class="card metric"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`}
function badge(t,c=''){return `<span class="badge ${c}">${t}</span>`}
function table(rows,heads,map){return `<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${map(r).map(v=>`<td>${v??''}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function customerAddress(c){return [c.address,c.number,c.complement,c.neighborhood,c.city,c.state,c.zip].filter(Boolean).join(', ')}
function findCustomer(n){return db.customers.find(c=>String(c.name).toLowerCase()===String(n).toLowerCase())}
function findProduct(n){return db.products.find(p=>p.name===n)}


function ymLabel(ym){
 const [y,m]=String(ym).split('-').map(Number);
 const d=new Date(y,m-1,1);
 return d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
}
function previousMonthYM(){
 const d=new Date();
 d.setDate(1);
 d.setMonth(d.getMonth()-1);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function availableMonths(){
 const vals=[...db.sales.map(s=>String(s.date||'').slice(0,7)),...db.expenses.map(e=>String(e.date||'').slice(0,7))].filter(x=>/^\d{4}-\d{2}$/.test(x));
 vals.push(previousMonthYM(),today().slice(0,7));
 return [...new Set(vals)].sort().reverse();
}


function settings(){
 title('Configurações','Personalize o sistema, documentos e faça backup dos seus dados.');
 const s=db.settings;
 content.innerHTML=`<div class="card" style="margin-bottom:18px"><h2 style="margin-top:0">Sincronização</h2>
   <p><b>Conta da nuvem:</b> <span id="cloudAccount">${esc(cloudUser?.email||'')}</span></p>
   <p style="color:#6d776e">Use esta mesma conta no PC e no celular para acessar os mesmos dados.</p>
   <div class="toolbar"><button class="secondary" id="syncNowBtn">Sincronizar agora</button><button class="danger" id="cloudLogoutBtn">Sair da conta da nuvem</button></div>
 </div>
 <div class="card"><h2 style="margin-top:0">Identidade da empresa</h2><form id="settingsForm">
   <div class="field span2"><label>Nome da empresa</label><input name="company_name" value="${esc(s.company_name)}"></div>
   <div class="field"><label>Slogan</label><input name="slogan" value="${esc(s.slogan)}"></div>
   <div class="field"><label>CPF / CNPJ da empresa</label><input name="cpf_cnpj" value="${esc(s.cpf_cnpj)}"></div>
   <div class="field"><label>Telefone</label><input name="phone" value="${esc(s.phone)}"></div>
   <div class="field"><label>WhatsApp</label><input name="whatsapp" value="${esc(s.whatsapp)}"></div>
   <div class="field"><label>E-mail</label><input name="email" value="${esc(s.email)}"></div>
   <div class="field span2"><label>Endereço</label><input name="address" value="${esc(s.address)}"></div>
   <div class="field"><label>Cidade</label><input name="city" value="${esc(s.city)}"></div>
   <div class="field"><label>Estado</label><input name="state" value="${esc(s.state)}"></div>

   <div class="field"><label>Cor principal</label><input name="primary_color" type="color" value="${esc(s.primary_color)}"></div>
   <div class="field"><label>Cor do menu lateral</label><input name="sidebar_color" type="color" value="${esc(s.sidebar_color)}"></div>
   <div class="field"><label>Cor de fundo</label><input name="background_color" type="color" value="${esc(s.background_color)}"></div>

   <div class="field"><label>Validade padrão do orçamento (dias)</label><input name="quote_valid_days" type="number" min="1" value="${Number(s.quote_valid_days||7)}"></div>
   <div class="field full"><label>Texto padrão do recibo</label><textarea name="receipt_text">${esc(s.receipt_text)}</textarea></div>
   <div class="field full"><label>Rodapé de orçamento e recibo</label><textarea name="document_footer">${esc(s.document_footer)}</textarea></div>
 </form>
 <div class="section"><h2>Logo</h2>
   <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
     <img id="logoPreview" src="${appLogo()}" style="width:120px;height:120px;object-fit:contain;border:1px solid #dce5dc;border-radius:14px;background:#fff">
     <div>
       <input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp">
       <div class="actions" style="justify-content:flex-start"><button class="secondary" id="resetLogo" type="button">Voltar para logo original</button></div>
     </div>
   </div>
 </div>
 <div class="actions"><button class="primary" id="saveSettings">Salvar configurações</button></div></div>

 <div class="section card"><h2 style="margin-top:0">Backup e segurança dos dados</h2>
   <p style="color:#6d776e">Como esta versão de teste salva tudo neste navegador, é importante guardar uma cópia de segurança regularmente.</p>
   <div class="toolbar">
     <button class="primary" id="exportBackup">Baixar backup completo</button>
     <label class="secondary" style="cursor:pointer">Restaurar backup<input id="importBackup" type="file" accept="application/json" style="display:none"></label>
   </div>
 </div>`;

 document.getElementById('syncNowBtn').onclick=async()=>{await pushCloudState();alert('Dados sincronizados com a nuvem.');};
 document.getElementById('cloudLogoutBtn').onclick=async()=>{
   if(!confirm('Sair da conta da nuvem neste aparelho?'))return;
   await cloudClient.auth.signOut();
   cloudUser=null;
   if(cloudChannel){cloudClient.removeChannel(cloudChannel);cloudChannel=null;}
   showCloudLogin();
 };
 let pendingLogo=s.logo||'';
 logoFile.onchange=()=>{
   const file=logoFile.files?.[0]; if(!file)return;
   if(file.size>3*1024*1024){alert('A imagem é muito grande. Use uma logo com até 3 MB.');logoFile.value='';return}
   const r=new FileReader();
   r.onload=()=>{pendingLogo=String(r.result);logoPreview.src=pendingLogo};
   r.readAsDataURL(file);
 };
 resetLogo.onclick=()=>{pendingLogo='';logoPreview.src=LOGO};

 saveSettings.onclick=()=>{
   const o=Object.fromEntries(new FormData(settingsForm));
   Object.assign(db.settings,o,{
     quote_valid_days:Number(o.quote_valid_days||7),
     logo:pendingLogo
   });
   save();applySettings();logActivity('Configurações alteradas','Identidade visual e dados da empresa');alert('Configurações salvas.');settings();
 };

 exportBackup.onclick=()=>{
   const payload={app:'Silagem Baixa Verde',version:8,exported_at:new Date().toISOString(),data:db};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`backup-silagem-${today()}.json`;a.click();URL.revokeObjectURL(a.href);
   logActivity('Backup exportado','Backup completo do sistema');
 };

 importBackup.onchange=()=>{
   const file=importBackup.files?.[0];if(!file)return;
   const r=new FileReader();
   r.onload=()=>{
     try{
       const obj=JSON.parse(String(r.result));
       const incoming=obj.data||obj;
       if(!incoming||!Array.isArray(incoming.sales)||!Array.isArray(incoming.customers))throw new Error('Formato inválido');
       if(!confirm('Restaurar este backup irá substituir os dados atuais deste navegador. Deseja continuar?'))return;
       localStorage.setItem('sbv-db',JSON.stringify(incoming));
       alert('Backup restaurado. O sistema será recarregado.');
       location.reload();
     }catch(e){alert('Não foi possível restaurar este arquivo. Verifique se é um backup válido do sistema.')}
   };
   r.readAsText(file);
 };
}

function activity(){
 title('Operadores / Atividades','Veja quem usou o sistema no dia e gerencie senhas.');
 const todayLogs=[...db.activityLog].sort((a,b)=>(String(b.date)+String(b.time)).localeCompare(String(a.date)+String(a.time)));
 content.innerHTML=`<div class="grid">
   ${metric('Operadores ativos',db.operators.filter(o=>o.active!==false).length,'Com acesso ao sistema')}
   ${metric('Acessos hoje',db.activityLog.filter(x=>x.date===today()&&x.action==='Acesso ao sistema').length,'Logins registrados hoje')}
   ${metric('Vendas hoje',db.sales.filter(s=>s.date===today()).length,'Vendas registradas hoje')}
   ${metric('Operador atual',currentOperator()?.name||'—','Usuário conectado')}
 </div>
 <div class="section card">
   <h2>Operadores</h2>
   <div class="toolbar"><button class="primary" onclick="editOperator('NEW')">+ Novo operador</button></div>
   ${table(db.operators,['Nome','Status','Ação'],o=>[o.name,badge(o.active!==false?'ATIVO':'INATIVO',o.active!==false?'':'warn'),`<button class="secondary" onclick="editOperator('${o.id}')">Editar / senha</button>`])}
 </div>
 <div class="section">
   <h2>Registro de atividades</h2>
   ${table(todayLogs,['Data','Hora','Operador','Ação','Detalhes'],x=>[x.date,x.time,x.operator_name,x.action,x.details||''])}
 </div>`;
}
window.editOperator=function(id){
 const isNew=id==='NEW';
 const op=isNew?{id:uid(),name:'',pin:'',active:true}:db.operators.find(o=>o.id===id);
 if(!op)return;
 title(isNew?'Novo operador':'Editar operador','Defina nome, senha/PIN e acesso.');
 content.innerHTML=`<div class="card"><form id="opForm">
   <div class="field span2"><label>Nome do operador</label><input name="name" value="${esc(op.name)}" required></div>
   <div class="field"><label>Senha / PIN</label><input name="pin" type="password" inputmode="numeric" value="${esc(op.pin)}" required></div>
   <div class="field"><label>Status</label><select name="active"><option value="true" ${op.active!==false?'selected':''}>Ativo</option><option value="false" ${op.active===false?'selected':''}>Inativo</option></select></div>
 </form><div class="actions"><button class="secondary" onclick="go('activity')">Cancelar</button><button class="primary" id="saveOp">Salvar</button></div></div>`;
 saveOp.onclick=()=>{if(!opForm.reportValidity())return;const d=Object.fromEntries(new FormData(opForm));op.name=d.name.trim();op.pin=String(d.pin);op.active=d.active==='true';if(isNew)db.operators.push(op);logActivity(isNew?'Operador criado':'Operador alterado',op.name);save();go('activity')};
}
function reports(){
 title('Relatórios mensais','Veja faturamento, recebimentos, gastos e resultado de qualquer mês.');
 const months=availableMonths();
 const def=previousMonthYM();
 content.innerHTML=`<div class="card">
   <div class="toolbar" style="align-items:end">
     <div class="field" style="min-width:260px">
       <label>Mês para analisar</label>
       <select id="reportMonth">${months.map(m=>`<option value="${m}" ${m===def?'selected':''}>${ymLabel(m)}</option>`).join('')}</select>
     </div>
     <button class="secondary" id="prevMonthBtn">← Mês anterior</button>
     <button class="secondary" id="nextMonthBtn">Mês seguinte →</button>
   </div>
   <div id="reportBody"></div>
 </div>`;
 const draw=()=>{
   const ym=reportMonth.value;
   const sm=db.sales.filter(s=>String(s.date||'').slice(0,7)===ym);
   const em=db.expenses.filter(e=>String(e.date||'').slice(0,7)===ym);
   const faturamento=sm.reduce((a,s)=>a+Number(s.total||0),0);
   const recebido=sm.reduce((a,s)=>a+Number(s.received||0),0);
   const aReceber=sm.reduce((a,s)=>a+Math.max(Number(s.receivable||0),0),0);
   const gastos=em.reduce((a,e)=>a+Number(e.total||0),0);
   const resultado=faturamento-gastos;
   const ticket=sm.length?faturamento/sm.length:0;
   const unidades=sm.reduce((a,s)=>a+Number(s.quantity||0),0);
   const gastoPorCategoria={};
   em.forEach(e=>{const k=e.category||'Sem categoria';gastoPorCategoria[k]=(gastoPorCategoria[k]||0)+Number(e.total||0)});
   const categorias=Object.entries(gastoPorCategoria).sort((a,b)=>b[1]-a[1]);

   reportBody.innerHTML=`
   <div class="section">
     <h2 style="margin-top:0">${ymLabel(ym)}</h2>
     <div class="grid">
       ${metric('Faturamento',money(faturamento),`${sm.length} venda(s) no mês`)}
       ${metric('Recebido',money(recebido),'Valores recebidos dessas vendas')}
       ${metric('A receber',money(aReceber),'Saldo das vendas do mês')}
       ${metric('Gastos',money(gastos),`${em.length} lançamento(s) de gasto`)}
     </div>
     <div class="grid" style="margin-top:14px">
       ${metric('Resultado bruto',money(resultado),'Faturamento menos gastos registrados')}
       ${metric('Ticket médio',money(ticket),'Média por venda')}
       ${metric('Unidades vendidas',unidades,'Quantidade total vendida')}
       ${metric('Margem sobre faturamento',faturamento?`${((resultado/faturamento)*100).toFixed(1)}%`:'0,0%','Resultado bruto / faturamento')}
     </div>
   </div>

   <div class="section">
     <h2>Resumo dos gastos por categoria</h2>
     ${table(categorias,['Categoria','Total'],x=>[x[0],`<b>${money(x[1])}</b>`])}
   </div>

   <div class="section">
     <h2>Vendas do mês</h2>
     ${table([...sm].sort((a,b)=>String(b.date).localeCompare(String(a.date))),
       ['Data','Cliente','Produto','Qtd.','Total','Recebido','A receber','Quem fez a venda','Frete cobrado','Frete real','NF'],
       s=>[s.date,s.customer,s.product,s.quantity,money(s.total),money(s.received),money(s.receivable),s.operator_name||operatorName(s.operator_id),money(s.freight_charged),money(s.freight_real),s.invoice_number||'—'])}
   </div>

   <div class="section">
     <h2>Gastos do mês</h2>
     ${table([...em].sort((a,b)=>String(b.date).localeCompare(String(a.date))),
       ['Data','Categoria','Fornecedor / Funcionário','Carga','Valor','Pagamento'],
       e=>[e.date,e.category||'',e.supplier||'',e.lot||'',money(e.total),e.payment_status||'—',e.paid_method||'—',e.paid_date||'—'])}
   </div>`;
 };
 function moveMonth(delta){
   const [y,m]=reportMonth.value.split('-').map(Number);
   const d=new Date(y,m-1+delta,1);
   const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
   if(![...reportMonth.options].some(o=>o.value===ym)){
     const opt=document.createElement('option');opt.value=ym;opt.textContent=ymLabel(ym);reportMonth.appendChild(opt);
   }
   reportMonth.value=ym;draw();
 }
 reportMonth.onchange=draw;
 prevMonthBtn.onclick=()=>moveMonth(-1);
 nextMonthBtn.onclick=()=>moveMonth(1);
 draw();
}

function dashboard(){
 title('Painel','Visão geral da Silagem Baixa Verde.');
 const ym=today().slice(0,7),sm=db.sales.filter(s=>String(s.date||'').slice(0,7)===ym);
 const fat=sm.reduce((a,s)=>a+s.total,0),rec=sm.reduce((a,s)=>a+s.received,0),ar=db.sales.reduce((a,s)=>a+Math.max(s.receivable,0),0),gm=db.expenses.filter(e=>String(e.date||'').slice(0,7)===ym).reduce((a,e)=>a+Number(e.total||0),0);
 const open=db.sales.filter(s=>s.receivable>0).sort((a,b)=>b.receivable-a.receivable).slice(0,8);
 content.innerHTML=`<div class="grid">${metric('Faturamento no mês',money(fat))}${metric('Recebido no mês',money(rec))}${metric('Total a receber',money(ar))}${metric('Gastos no mês',money(gm))}</div><div class="section"><div class="toolbar"><button class="primary" onclick="go('reports')">Ver relatório mensal completo</button><button class="secondary" onclick="go('settings')">Abrir configurações</button></div></div><div class="section"><h2>Pendências de recebimento</h2>${table(open,['Cliente','Data','Produto','Saldo'],s=>[s.customer,s.date,s.product,`<b>${money(s.receivable)}</b>`])}</div><div class="section"><h2>Estoque</h2>${table(db.inventory,['Produto','Atual','Mínimo','Situação'],i=>[i.product,i.current,i.minimum||0,badge(Number(i.current)<=Number(i.minimum||0)?'REPOR':'OK',Number(i.current)<=Number(i.minimum||0)?'danger':'')])}</div>`;
}

function saleNew(){
 title('Nova venda','Cliente, estoque e recebimento atualizam automaticamente.');
 content.innerHTML=`<div class="card"><form id="f">
 <div class="field"><label>Data</label><input name="date" type="date" value="${today()}" required></div>
 <div class="field span2"><label>Cliente</label><input name="customer" list="cl" required><datalist id="cl">${db.customers.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist></div>
 <div class="field"><label>Produto</label><select name="product" required><option value="">Selecione</option>${db.products.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div>
 <div class="field"><label>Quantidade</label><input name="quantity" type="number" min="1" required></div>
 <div class="field"><label>Preço unitário</label><input name="unit_price" type="number" step=".01" required></div>
 <div class="field"><label>Desconto</label><input name="discount" type="number" step=".01" value="0"></div>
 <div class="field"><label>Carga / Lote</label><select name="lot"><option value="">Selecione</option>${db.lots.filter(l=>l.status!=='ACABOU').map(l=>`<option>${esc(l.lot)}</option>`).join('')}</select></div>
 <div class="field"><label>Tipo de entrega</label><select name="delivery_type"><option>Retirada</option><option>Entrega</option></select></div>
 <div class="field"><label>Forma de pagamento</label><select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>TED</option><option>Crédito</option><option>Débito</option></select></div>
 <div class="field"><label>Frete cobrado</label><input name="freight_charged" type="number" step=".01" value="0"></div>
 <div class="field"><label>Frete real</label><input name="freight_real" type="number" step=".01" value="0"></div>
 <div class="field"><label>Valor recebido</label><input name="received" type="number" step=".01" value="0"></div>
 <div class="field"><label>NF / Nota fiscal</label><input name="invoice_number"></div>
 <div class="field span2"><label>Observações</label><input name="sale_notes"></div>
 <div class="full card" id="calc"></div></form><div class="actions"><button class="primary" id="saveSale">Salvar venda</button></div></div>`;
 const form=f; function calcIt(){const o=Object.fromEntries(new FormData(form));const tot=Number(o.quantity||0)*Number(o.unit_price||0)-Number(o.discount||0)+Number(o.freight_charged||0);calc.innerHTML=`Total: <b>${money(tot)}</b> &nbsp; | &nbsp; A receber: <b>${money(Math.max(tot-Number(o.received||0),0))}</b>`}
 form.oninput=calcIt;calcIt(); form.product.onchange=()=>{const p=findProduct(form.product.value);if(p)form.unit_price.value=p.sale_price;calcIt()}
 saveSale.onclick=()=>{if(!form.reportValidity())return;const o=Object.fromEntries(new FormData(form));let c=findCustomer(o.customer.trim());if(!c){c={id:uid(),name:o.customer.trim(),cpf_cnpj:'',phone:'',email:'',address:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',type:'',notes:''};db.customers.push(c)}
 const q=Number(o.quantity),up=Number(o.unit_price),d=Number(o.discount||0),fc=Number(o.freight_charged||0),fr=Number(o.freight_real||0),rv=Number(o.received||0),tot=q*up-d+fc;
 const op=currentOperator();const s={id:uid(),source:'app',date:o.date,customer:c.name,product:o.product,quantity:q,unit_price:up,discount:d,lot:o.lot,delivery_type:o.delivery_type,payment_method:o.payment_method,freight_charged:fc,freight_real:fr,total:tot,received:rv,receivable:Math.max(tot-rv,0),status:tot-rv<=0?'Recebido':'Pendente',invoice_number:o.invoice_number||'',sale_notes:o.sale_notes||'',operator_id:op?.id||'',operator_name:op?.name||'Não informado'};db.sales.push(s);logActivity('Venda lançada',`${c.name} - ${o.product} - ${money(tot)}`);
 const inv=db.inventory.find(i=>i.product===s.product);if(inv){inv.current=Number(inv.current||0)-q;inv.sales_out=Number(inv.sales_out||0)+q}
 const lot=db.lots.find(l=>l.lot===s.lot);if(lot){lot.sold+=q;lot.balance=lot.base_qty-lot.sold;if(lot.balance<=0)lot.status='ACABOU'}
 save();go(s.receivable>0?'receivables':'sales')}
}

function receivables(){
 title('A receber','Somente vendas com saldo pendente.');
 const rows=db.sales.filter(s=>s.receivable>0).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 content.innerHTML=table(rows,['Data','Cliente','Produto','Total','Recebido','Saldo','Ações'],s=>[s.date,s.customer,s.product,money(s.total),money(s.received),`<b>${money(s.receivable)}</b>`,`<button class="secondary" onclick="receive('${s.id}')">Receber</button> <button class="danger" onclick="deleteSale('${s.id}')">Excluir</button>`])
}
window.receive=function(id){
 const s=db.sales.find(x=>x.id===id);
 if(!s)return;

 title('Receber pagamento',`${s.customer} — saldo ${money(s.receivable)}`);

 content.innerHTML=`<div class="card" style="max-width:760px">
   <div class="grid">
     ${metric('Total da venda',money(s.total))}
     ${metric('Já recebido',money(s.received))}
     ${metric('Saldo atual',money(s.receivable))}
     ${metric('Cliente',esc(s.customer))}
   </div>

   <form id="receiveForm" style="margin-top:18px" autocomplete="off">
     <div class="field full">
       <label>Valor recebido agora</label>
       <input id="receiveAmount" name="amount" type="text" autocomplete="off" placeholder="0,00"
              style="font-size:28px;font-weight:800;text-align:right;padding:16px" required>
     </div>

     <div class="field">
       <label>Data do recebimento</label>
       <input id="receiveDate" name="date" type="date" value="${today()}" required>
     </div>

     <div class="field">
       <label>Forma de pagamento</label>
       <select id="receiveMethod" name="method">
         <option>Pix</option>
         <option>Dinheiro</option>
         <option>TED</option>
         <option>Débito</option>
         <option>Crédito</option>
         <option>Outro</option>
       </select>
     </div>

     <div class="field full">
       <label>Observação</label>
       <input id="receiveNote" name="note" type="text" autocomplete="off" placeholder="Opcional">
     </div>
   </form>

   <div class="section">
     <h3 style="margin-bottom:10px">Teclado de valor</h3>
     <div id="moneyKeypad" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:420px">
       <button type="button" class="secondary money-key" data-key="7">7</button>
       <button type="button" class="secondary money-key" data-key="8">8</button>
       <button type="button" class="secondary money-key" data-key="9">9</button>
       <button type="button" class="danger" id="moneyClear">Limpar</button>

       <button type="button" class="secondary money-key" data-key="4">4</button>
       <button type="button" class="secondary money-key" data-key="5">5</button>
       <button type="button" class="secondary money-key" data-key="6">6</button>
       <button type="button" class="secondary" id="moneyBack">⌫</button>

       <button type="button" class="secondary money-key" data-key="1">1</button>
       <button type="button" class="secondary money-key" data-key="2">2</button>
       <button type="button" class="secondary money-key" data-key="3">3</button>
       <button type="button" class="secondary" id="moneyFull">Saldo</button>

       <button type="button" class="secondary money-key" data-key="0">0</button>
       <button type="button" class="secondary money-key" data-key="00">00</button>
       <button type="button" class="secondary money-key" data-key=",">,</button>
       <button type="button" class="primary" id="moneyConfirmKey">OK</button>
     </div>
   </div>

   <div class="actions">
     <button type="button" class="secondary" id="cancelReceive">Cancelar</button>
     <button type="button" class="primary" id="confirmReceive">Confirmar recebimento</button>
   </div>
 </div>`;

 const amountEl=document.getElementById('receiveAmount');
 const form=document.getElementById('receiveForm');

 function cleanMoneyText(v){
   v=String(v||'').replace(/[^\d.,]/g,'');
   if(v.includes(',') && v.includes('.')){
     const lastComma=v.lastIndexOf(',');
     const lastDot=v.lastIndexOf('.');
     if(lastComma>lastDot){
       v=v.replace(/\./g,'');
       const parts=v.split(',');
       v=parts.shift()+','+parts.join('');
     }else{
       v=v.replace(/,/g,'');
       const parts=v.split('.');
       v=parts.shift()+'.'+parts.join('');
     }
   }else if((v.match(/,/g)||[]).length>1){
     const p=v.indexOf(',');
     v=v.slice(0,p+1)+v.slice(p+1).replace(/,/g,'');
   }else if((v.match(/\./g)||[]).length>1){
     const p=v.indexOf('.');
     v=v.slice(0,p+1)+v.slice(p+1).replace(/\./g,'');
   }
   return v;
 }

 function parseMoney(v){
   let raw=String(v||'').trim().replace(/\s/g,'');
   if(raw.includes(',')&&raw.includes('.')){
     raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')
       ? raw.replace(/\./g,'').replace(',','.')
       : raw.replace(/,/g,'');
   }else if(raw.includes(',')){
     raw=raw.replace(',','.');
   }
   return Number(raw);
 }

 function appendKey(k){
   if(k===',' || k==='.'){
     if(amountEl.value.includes(',')||amountEl.value.includes('.'))return;
     amountEl.value=(amountEl.value||'0')+',';
   }else{
     amountEl.value=cleanMoneyText((amountEl.value||'')+k);
   }
   amountEl.focus();
   amountEl.setSelectionRange(amountEl.value.length,amountEl.value.length);
 }

 amountEl.value='';
 amountEl.readOnly=false;
 amountEl.disabled=false;

 amountEl.addEventListener('input',()=>{
   const pos=amountEl.selectionStart;
   amountEl.value=cleanMoneyText(amountEl.value);
   try{amountEl.setSelectionRange(Math.min(pos,amountEl.value.length),Math.min(pos,amountEl.value.length));}catch(e){}
 });

 amountEl.addEventListener('keydown',e=>{
   if(e.key==='Enter'){
     e.preventDefault();
     document.getElementById('confirmReceive').click();
   }
 });

 document.querySelectorAll('.money-key').forEach(btn=>{
   btn.addEventListener('click',()=>appendKey(btn.dataset.key));
 });

 document.getElementById('moneyClear').onclick=()=>{
   amountEl.value='';
   amountEl.focus();
 };

 document.getElementById('moneyBack').onclick=()=>{
   amountEl.value=amountEl.value.slice(0,-1);
   amountEl.focus();
 };

 document.getElementById('moneyFull').onclick=()=>{
   amountEl.value=Number(s.receivable||0).toFixed(2).replace('.',',');
   amountEl.focus();
 };

 document.getElementById('moneyConfirmKey').onclick=()=>{
   document.getElementById('confirmReceive').click();
 };

 document.getElementById('cancelReceive').onclick=()=>go('receivables');

 document.getElementById('confirmReceive').onclick=()=>{
   if(!form.reportValidity())return;

   const o=Object.fromEntries(new FormData(form));
   const amount=parseMoney(o.amount);

   if(!Number.isFinite(amount)||amount<=0){
     amountEl.focus();
     return alert('Informe um valor válido. Exemplo: 150,00');
   }

   if(amount>Number(s.receivable||0)+0.009){
     amountEl.focus();
     return alert(`O valor informado é maior que o saldo a receber de ${money(s.receivable)}.`);
   }

   s.received=Number(s.received||0)+amount;
   s.receivable=Math.max(Number(s.total||0)-s.received,0);
   s.status=s.receivable<=0.009?'Recebido':'Pendente';

   s.receipts_log=Array.isArray(s.receipts_log)?s.receipts_log:[];
   s.receipts_log.push({
     id:uid(),
     amount,
     date:o.date,
     method:o.method,
     note:o.note||'',
     operator_id:currentOperator()?.id||'',
     operator_name:currentOperator()?.name||'Não informado'
   });

   logActivity('Recebimento lançado',`${s.customer} - ${money(amount)} - ${o.method}`);
   save();
   go('receivables');
 };

 setTimeout(()=>{
   amountEl.value='';
   amountEl.readOnly=false;
   amountEl.disabled=false;
   amountEl.focus();
 },100);
}

window.deleteSale=id=>{const s=db.sales.find(x=>x.id===id);if(!s||!confirm(`Excluir venda de ${s.customer} no valor de ${money(s.total)}?`))return;if(s.source==='app'){const inv=db.inventory.find(i=>i.product===s.product);if(inv){inv.current=Number(inv.current||0)+s.quantity;inv.sales_out=Math.max(Number(inv.sales_out||0)-s.quantity,0)}const lot=db.lots.find(l=>l.lot===s.lot);if(lot){lot.sold=Math.max(lot.sold-s.quantity,0);lot.balance=lot.base_qty-lot.sold;if(lot.balance>0)lot.status='EM USO'}}db.sales=db.sales.filter(x=>x.id!==id);save();go('sales')}

function sales(){
 title('Histórico de vendas','Abra qualquer venda para ver frete, NF, recebimento e editar.');
 content.innerHTML=`<div class="toolbar"><input id="search" placeholder="Pesquisar cliente, data, NF, produto..."></div><div id="salesBox"></div>`;
 function draw(){const z=search.value.toLowerCase(),r=db.sales.filter(s=>JSON.stringify(s).toLowerCase().includes(z)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));salesBox.innerHTML=table(r,['Data','Cliente','Produto','Qtd.','Total','Saldo','Quem fez a venda','NF','Ação'],s=>[s.date,s.customer,s.product,s.quantity,money(s.total),money(s.receivable),s.operator_name||operatorName(s.operator_id),s.invoice_number||'—',`<button class="secondary" onclick="editSale('${s.id}')">Ver / editar</button> <button class="danger" onclick="deleteSale('${s.id}')">Excluir</button>`])}search.oninput=draw;draw()
}
window.editSale=function(id){
 const s=db.sales.find(x=>x.id===id);
 if(!s)return;
 title('Detalhes da venda',`${s.customer} — ${s.date}`);
 content.innerHTML=`<div class="card">
 <form id="saleEditForm">
   <div class="field"><label>Data</label><input name="date" type="date" value="${esc(s.date)}" required></div>
   <div class="field span2"><label>Cliente</label><input name="customer" list="editCustomerList" value="${esc(s.customer)}" required><datalist id="editCustomerList">${db.customers.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist></div>

   <div class="field"><label>Produto</label><select name="product">${db.products.map(p=>`<option ${p.name===s.product?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
   <div class="field"><label>Quantidade</label><input name="quantity" type="number" min="0" step="1" value="${Number(s.quantity||0)}"></div>
   <div class="field"><label>Preço unitário</label><input name="unit_price" type="number" min="0" step="0.01" value="${Number(s.unit_price||0)}"></div>

   <div class="field"><label>Desconto</label><input name="discount" type="number" min="0" step="0.01" value="${Number(s.discount||0)}"></div>
   <div class="field"><label>Carga / Lote</label><input name="lot" list="editLotList" value="${esc(s.lot||'')}"><datalist id="editLotList">${db.lots.map(l=>`<option value="${esc(l.lot)}">`).join('')}</datalist></div>
   <div class="field"><label>Tipo de entrega</label><select name="delivery_type"><option ${s.delivery_type==='Retirada'?'selected':''}>Retirada</option><option ${s.delivery_type==='Entrega'?'selected':''}>Entrega</option></select></div>

   <div class="field"><label>Forma de pagamento</label><input name="payment_method" value="${esc(s.payment_method||'')}"></div>
   <div class="field"><label>Frete cobrado do cliente</label><input name="freight_charged" type="number" min="0" step="0.01" value="${Number(s.freight_charged||0)}"></div>
   <div class="field"><label>Frete real pago</label><input name="freight_real" type="number" min="0" step="0.01" value="${Number(s.freight_real||0)}"></div>

   <div class="field"><label>Total recebido</label><input name="received" type="number" min="0" step="0.01" value="${Number(s.received||0)}"></div>
   <div class="field"><label>NF / Nota fiscal</label><input name="invoice_number" value="${esc(s.invoice_number||'')}"></div>
   <div class="field"><label>Quem fez a venda</label><input value="${esc(s.operator_name||operatorName(s.operator_id))}" disabled></div>

   <div class="field full"><label>Observações</label><textarea name="sale_notes">${esc(s.sale_notes||'')}</textarea></div>
 </form>

 <div id="saleEditSummary" class="grid" style="margin-top:14px"></div>

 <div class="actions">
   <button class="secondary" id="cancelSaleEdit">Voltar</button>
   <button class="primary" id="saveSaleEdit">Salvar alterações</button>
 </div>
 </div>`;

 const form=document.getElementById('saleEditForm');
 const summary=document.getElementById('saleEditSummary');

 function redrawSummary(){
   const o=Object.fromEntries(new FormData(form));
   const q=Number(o.quantity||0),up=Number(o.unit_price||0),d=Number(o.discount||0),fc=Number(o.freight_charged||0),fr=Number(o.freight_real||0),rv=Number(o.received||0);
   const total=q*up-d+fc;
   summary.innerHTML=
     metric('Total da venda',money(total))+
     metric('Recebido',money(rv))+
     metric('A receber',money(Math.max(total-rv,0)))+
     metric('Diferença do frete',money(fc-fr));
 }
 form.oninput=redrawSummary;
 redrawSummary();

 document.getElementById('cancelSaleEdit').onclick=()=>go('sales');
 document.getElementById('saveSaleEdit').onclick=()=>{
   if(!form.reportValidity())return;
   const o=Object.fromEntries(new FormData(form));
   const oldCustomer=s.customer;
   const oldProduct=s.product;
   const oldQty=Number(s.quantity||0);
   const oldLot=s.lot||'';

   const q=Number(o.quantity||0);
   const up=Number(o.unit_price||0);
   const d=Number(o.discount||0);
   const fc=Number(o.freight_charged||0);
   const fr=Number(o.freight_real||0);
   const rv=Number(o.received||0);
   const total=q*up-d+fc;

   let c=findCustomer(o.customer.trim());
   if(!c){
     c={id:uid(),name:o.customer.trim(),cpf_cnpj:'',phone:'',email:'',address:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',type:'',notes:''};
     db.customers.push(c);
   }

   if(s.source==='app'){
     const oldInv=db.inventory.find(i=>i.product===oldProduct);
     if(oldInv){
       oldInv.current=Number(oldInv.current||0)+oldQty;
       oldInv.sales_out=Math.max(Number(oldInv.sales_out||0)-oldQty,0);
     }
     const oldLotObj=db.lots.find(l=>l.lot===oldLot);
     if(oldLotObj){
       oldLotObj.sold=Math.max(Number(oldLotObj.sold||0)-oldQty,0);
       oldLotObj.balance=Number(oldLotObj.base_qty||0)-Number(oldLotObj.sold||0);
       if(oldLotObj.balance>0)oldLotObj.status='EM USO';
     }
   }

   Object.assign(s,{
     date:o.date,
     customer:c.name,
     product:o.product,
     quantity:q,
     unit_price:up,
     discount:d,
     lot:o.lot||'',
     delivery_type:o.delivery_type,
     payment_method:o.payment_method,
     freight_charged:fc,
     freight_real:fr,
     received:rv,
     total,
     receivable:Math.max(total-rv,0),
     status:Math.max(total-rv,0)<=0.009?'Recebido':'Pendente',
     invoice_number:o.invoice_number||'',
     sale_notes:o.sale_notes||''
   });

   if(s.source==='app'){
     const newInv=db.inventory.find(i=>i.product===s.product);
     if(newInv){
       newInv.current=Number(newInv.current||0)-q;
       newInv.sales_out=Number(newInv.sales_out||0)+q;
     }
     const newLotObj=db.lots.find(l=>l.lot===s.lot);
     if(newLotObj){
       newLotObj.sold=Number(newLotObj.sold||0)+q;
       newLotObj.balance=Number(newLotObj.base_qty||0)-Number(newLotObj.sold||0);
       if(newLotObj.balance<=0)newLotObj.status='ACABOU';
     }
   }

   logActivity('Venda alterada',`${oldCustomer} → ${s.customer} - ${money(total)}`);
   save();
   alert('Venda atualizada com sucesso.');
   go('sales');
 };
}

function products(){
 title('Produtos','Edite as informações que aparecem em vendas, orçamentos e recibos.');
 content.innerHTML=`<div class="toolbar"><button class="primary" onclick="editProduct('NEW')">+ Novo produto</button></div>${table(db.products,['Produto','Descrição','Peso médio','Unidade','Preço','Ação'],p=>[p.name,p.details,p.average_weight||'—',p.unit,money(p.sale_price),`<button class="secondary" onclick="editProduct('${p.id}')">Editar</button>`])}`
}
window.editProduct=id=>{const isNew=id==='NEW',p=isNew?{id:uid(),name:'',details:'',average_weight:'',unit:'saco',sale_price:0,unit_cost:0,notes:''}:db.products.find(x=>x.id===id);if(!p)return;title(isNew?'Novo produto':'Editar produto');content.innerHTML=`<div class="card"><form id="pf">
<div class="field span2"><label>Nome</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Unidade</label><input name="unit" value="${esc(p.unit)}"></div>
<div class="field"><label>Peso médio</label><input name="average_weight" value="${esc(p.average_weight)}" placeholder="Ex.: 25 kg"></div><div class="field"><label>Preço de venda</label><input name="sale_price" type="number" step=".01" value="${p.sale_price}"></div>
<div class="field"><label>Custo unitário</label><input name="unit_cost" type="number" step=".01" value="${p.unit_cost}"></div><div class="field full"><label>Descrição completa</label><textarea name="details">${esc(p.details)}</textarea></div>
<div class="field full"><label>Observações internas</label><textarea name="notes">${esc(p.notes)}</textarea></div></form><div class="actions"><button class="secondary" onclick="go('products')">Cancelar</button><button class="primary" id="sp">Salvar</button></div></div>`;sp.onclick=()=>{if(!pf.reportValidity())return;const old=p.name,o=Object.fromEntries(new FormData(pf));Object.assign(p,o,{sale_price:Number(o.sale_price||0),unit_cost:Number(o.unit_cost||0)});if(isNew)db.products.push(p);else if(old!==p.name){db.sales.forEach(s=>{if(s.product===old)s.product=p.name});db.inventory.forEach(i=>{if(i.product===old)i.product=p.name})}save();go('products')}}

function customers(){
 title('Clientes','Abra e edite os dados completos.');
 content.innerHTML=`<div class="toolbar"><button class="primary" onclick="editCustomer('NEW')">+ Novo cliente</button><input id="cs" placeholder="Pesquisar..."></div><div id="cb"></div>`;
 function draw(){const z=cs.value.toLowerCase(),r=db.customers.filter(c=>JSON.stringify(c).toLowerCase().includes(z)).sort((a,b)=>a.name.localeCompare(b.name));cb.innerHTML=table(r,['Cliente','CPF/CNPJ','Telefone','Cidade','Ação'],c=>[c.name,c.cpf_cnpj||'—',c.phone||'—',c.city||'—',`<button class="secondary" onclick="editCustomer('${c.id}')">Ver / editar</button>`])}cs.oninput=draw;draw()
}
window.editCustomer=id=>{const isNew=id==='NEW',c=isNew?{id:uid(),name:'',cpf_cnpj:'',phone:'',email:'',address:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',type:'',notes:''}:db.customers.find(x=>x.id===id);if(!c)return;title(isNew?'Novo cliente':'Dados do cliente');content.innerHTML=`<div class="card"><form id="cf">
<div class="field span2"><label>Nome / Razão social</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>CPF/CNPJ</label><input name="cpf_cnpj" value="${esc(c.cpf_cnpj)}"></div>
<div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${esc(c.phone)}"></div><div class="field"><label>E-mail</label><input name="email" value="${esc(c.email)}"></div>
<div class="field span2"><label>Endereço</label><input name="address" value="${esc(c.address)}"></div><div class="field"><label>Número</label><input name="number" value="${esc(c.number)}"></div>
<div class="field"><label>Complemento</label><input name="complement" value="${esc(c.complement)}"></div><div class="field"><label>Bairro</label><input name="neighborhood" value="${esc(c.neighborhood)}"></div>
<div class="field"><label>Cidade</label><input name="city" value="${esc(c.city)}"></div><div class="field"><label>Estado</label><input name="state" value="${esc(c.state)}"></div><div class="field"><label>CEP</label><input name="zip" value="${esc(c.zip)}"></div>
<div class="field full"><label>Observações</label><textarea name="notes">${esc(c.notes)}</textarea></div></form><div class="actions"><button class="secondary" onclick="go('customers')">Cancelar</button><button class="primary" id="sc">Salvar</button></div></div>`;sc.onclick=()=>{if(!cf.reportValidity())return;Object.assign(c,Object.fromEntries(new FormData(cf)));if(isNew)db.customers.push(c);save();go('customers')}}

function expenses(){
 title('Gastos','Controle o que já foi pago e o que ainda está a pagar.');
 const pending=db.expenses.filter(e=>e.payment_status==='A pagar');
 const paid=db.expenses.filter(e=>e.payment_status==='Pago');
 const pendingTotal=pending.reduce((a,e)=>a+Number(e.total||0),0);
 const paidTotal=paid.reduce((a,e)=>a+Number(e.total||0),0);

 content.innerHTML=`
 <div class="grid">
   ${metric('A pagar',money(pendingTotal),`${pending.length} lançamento(s) pendente(s)`)}
   ${metric('Já pago',money(paidTotal),`${paid.length} lançamento(s) pago(s)`)}
   ${metric('Total de gastos',money(pendingTotal+paidTotal),`${db.expenses.length} lançamento(s)`)}
   ${metric('Pendências',pending.length,'Itens aguardando pagamento')}
 </div>

 <div class="section card">
   <h2 style="margin-top:0">Lançar novo gasto</h2>
   <form id="gf">
     <div class="field"><label>Data do gasto</label><input name="date" type="date" value="${today()}" required></div>
     <div class="field"><label>Categoria</label><select name="category"><option>Embalagem</option><option>Mão de obra</option><option>Lacres</option><option>Gasolina</option><option>Fita</option><option>Milho</option><option>Manutenção</option><option>Outros</option></select></div>
     <div class="field expense-supplier-field"><label>Fornecedor / Funcionário</label><input name="supplier" id="expenseSupplier" autocomplete="off" placeholder="Toque ou digite para buscar"><div id="expenseSupplierSuggestions" class="autocomplete-list"></div></div>
     <div class="field"><label>Carga</label><input name="lot" list="expenseLotList" placeholder="Toque ou digite para buscar"><datalist id="expenseLotList">${db.lots.map(l=>`<option value="${esc(l.lot)}">`).join('')}</datalist></div>
     <div class="field"><label>Quantidade</label><input name="quantity" type="number" step=".01" value="1"></div>
     <div class="field"><label>Valor total</label><input name="total" type="number" step=".01" required></div>
     <div class="field"><label>Situação</label><select name="payment_status" id="expenseStatus"><option value="Pago">Pago</option><option value="A pagar">A pagar</option></select></div>
     <div class="field"><label>Forma de pagamento</label><select name="paid_method" id="expenseMethod"><option>Pix</option><option>Dinheiro</option><option>TED</option><option>Débito</option><option>Crédito</option><option>Outro</option></select></div>
     <div class="field"><label>Data do pagamento</label><input name="paid_date" id="expensePaidDate" type="date" value="${today()}"></div>
     <div class="field full"><label>Observações</label><input name="notes"></div>
   </form>
   <div class="actions"><button class="primary" id="sg">Salvar gasto</button></div>
 </div>

 <div class="section">
   <h2>Pagamentos a fazer</h2>
   ${table([...pending].sort((a,b)=>String(a.date).localeCompare(String(b.date))),
     ['Data do gasto','Categoria','Fornecedor / Funcionário','Carga','Valor','Status','Ação'],
     e=>[e.date,e.category||'',e.supplier||'',e.lot||'',`<b>${money(e.total)}</b>`,badge('A PAGAR','warn'),`<button class="primary" onclick="payExpense('${e.id}')">Informar pagamento</button>`])}
 </div>

 <div class="section">
   <h2>Histórico de gastos</h2>
   ${table([...db.expenses].sort((a,b)=>String(b.date).localeCompare(String(a.date))),
     ['Data do gasto','Categoria','Fornecedor / Funcionário','Carga','Valor','Situação','Forma','Data do pagamento','Ação'],
     e=>[e.date,e.category||'',e.supplier||'',e.lot||'',money(e.total),
         e.payment_status==='A pagar'?badge('A PAGAR','warn'):badge('PAGO'),
         e.paid_method||'—',e.paid_date||'—',
         `<button class="secondary" onclick="editExpensePayment('${e.id}')">Editar pagamento</button>`])}
 </div>`;

 const statusEl=document.getElementById('expenseStatus');
 const methodEl=document.getElementById('expenseMethod');
 const dateEl=document.getElementById('expensePaidDate');
 const form=document.getElementById('gf');
 const saveBtn=document.getElementById('sg');

 const supplierInput=document.getElementById('expenseSupplier');
 const supplierBox=document.getElementById('expenseSupplierSuggestions');
 const supplierNames=[...new Set([
   ...db.expenses.map(e=>String(e.supplier||'').trim()),
   ...db.lots.map(l=>String(l.supplier||'').trim()),
   ...db.operators.filter(o=>o.active!==false).map(o=>String(o.name||'').trim()),
   ...db.customers.filter(c=>/fornec|funcion/i.test(String(c.type||''))).map(c=>String(c.name||'').trim())
 ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));

 function drawSupplierSuggestions(){
   const q=String(supplierInput.value||'').trim().toLocaleLowerCase('pt-BR');
   const matches=supplierNames.filter(n=>!q||n.toLocaleLowerCase('pt-BR').includes(q)).slice(0,12);
   supplierBox.innerHTML=matches.length
     ? matches.map(n=>`<button type="button" data-value="${esc(n)}">${esc(n)}</button>`).join('')
     : `<div class="autocomplete-empty">Nenhum nome encontrado</div>`;
   supplierBox.classList.add('open');
   supplierBox.querySelectorAll('button').forEach(btn=>{
     btn.onclick=()=>{
       supplierInput.value=btn.dataset.value||'';
       supplierBox.classList.remove('open');
       supplierInput.focus();
     };
   });
 }
 supplierInput.addEventListener('focus',drawSupplierSuggestions);
 supplierInput.addEventListener('input',drawSupplierSuggestions);
 supplierInput.addEventListener('click',drawSupplierSuggestions);
 document.addEventListener('click',e=>{
   if(!e.target.closest('.expense-supplier-field'))supplierBox.classList.remove('open');
 },{once:false});

 function togglePaymentFields(){
   const isPending=statusEl.value==='A pagar';
   methodEl.disabled=isPending;
   dateEl.disabled=isPending;
   if(isPending) dateEl.value='';
   else if(!dateEl.value) dateEl.value=today();
 }
 statusEl.onchange=togglePaymentFields;
 togglePaymentFields();

 saveBtn.onclick=()=>{
   if(!form.reportValidity())return;
   const o=Object.fromEntries(new FormData(form));
   const op=currentOperator();
   const status=o.payment_status||'Pago';
   db.expenses.push({
     id:uid(),...o,
     quantity:Number(o.quantity||0),
     total:Number(o.total||0),
     unit_value:Number(o.quantity||0)?Number(o.total)/Number(o.quantity):0,
     payment_status:status,
     paid_method:status==='Pago'?(o.paid_method||''):'',
     paid_date:status==='Pago'?(o.paid_date||today()):'',
     payment:status==='A pagar'?'A pagar':(o.paid_method||''),
     payment_note:'',
     operator_id:op?.id||'',
     operator_name:op?.name||'Não informado'
   });
   logActivity('Gasto lançado',`${o.category} - ${money(o.total)} - ${status}`);
   save();
   expenses();
 };
}

window.payExpense=function(id){
 const e=db.expenses.find(x=>x.id===id);
 if(!e)return;
 title('Informar pagamento',`${e.supplier||e.category} — ${money(e.total)}`);
 content.innerHTML=`<div class="card">
   <p><b>Gasto:</b> ${esc(e.category||'')}</p>
   <p><b>Fornecedor / Funcionário:</b> ${esc(e.supplier||'—')}</p>
   <p><b>Valor:</b> ${money(e.total)}</p>
   <form id="payExpenseForm">
     <div class="field"><label>Data do pagamento</label><input name="paid_date" type="date" value="${today()}" required></div>
     <div class="field"><label>Forma de pagamento</label><select name="paid_method"><option>Pix</option><option>Dinheiro</option><option>TED</option><option>Débito</option><option>Crédito</option><option>Outro</option></select></div>
     <div class="field full"><label>Observação do pagamento</label><input name="payment_note" value="${esc(e.payment_note||'')}"></div>
   </form>
   <div class="actions"><button class="secondary" onclick="go('expenses')">Cancelar</button><button class="primary" id="confirmPayExpense">Confirmar pagamento</button></div>
 </div>`;

 document.getElementById('confirmPayExpense').onclick=()=>{
   const form=document.getElementById('payExpenseForm');
   if(!form.reportValidity())return;
   const o=Object.fromEntries(new FormData(form));
   e.payment_status='Pago';
   e.paid_date=o.paid_date;
   e.paid_method=o.paid_method;
   e.payment=o.paid_method;
   e.payment_note=o.payment_note||'';
   logActivity('Gasto pago',`${e.category||''} - ${e.supplier||''} - ${money(e.total)} - ${o.paid_method}`);
   save();
   go('expenses');
 };
}

window.editExpensePayment=function(id){
 const e=db.expenses.find(x=>x.id===id);
 if(!e)return;
 title('Editar pagamento do gasto',`${e.supplier||e.category} — ${money(e.total)}`);
 content.innerHTML=`<div class="card">
   <form id="editExpenseForm">
     <div class="field"><label>Situação</label><select name="payment_status"><option value="Pago" ${e.payment_status==='Pago'?'selected':''}>Pago</option><option value="A pagar" ${e.payment_status==='A pagar'?'selected':''}>A pagar</option></select></div>
     <div class="field"><label>Data do pagamento</label><input name="paid_date" type="date" value="${esc(e.paid_date||'')}"></div>
     <div class="field"><label>Forma de pagamento</label><select name="paid_method">${['Pix','Dinheiro','TED','Débito','Crédito','Outro'].map(x=>`<option ${e.paid_method===x?'selected':''}>${x}</option>`).join('')}</select></div>
     <div class="field full"><label>Observação do pagamento</label><input name="payment_note" value="${esc(e.payment_note||'')}"></div>
   </form>
   <div class="actions"><button class="secondary" onclick="go('expenses')">Cancelar</button><button class="primary" id="saveExpensePayment">Salvar alterações</button></div>
 </div>`;

 document.getElementById('saveExpensePayment').onclick=()=>{
   const o=Object.fromEntries(new FormData(document.getElementById('editExpenseForm')));
   e.payment_status=o.payment_status;
   if(o.payment_status==='Pago'){
     e.paid_date=o.paid_date||today();
     e.paid_method=o.paid_method||'';
     e.payment=e.paid_method||'';
   }else{
     e.paid_date='';
     e.paid_method='';
     e.payment='A pagar';
   }
   e.payment_note=o.payment_note||'';
   logActivity('Pagamento de gasto alterado',`${e.category||''} - ${money(e.total)} - ${e.payment_status}`);
   save();
   go('expenses');
 };
}

function inventory(){title('Estoque','Baixa automática conforme as vendas lançadas no app.');content.innerHTML=table(db.inventory,['Produto','Estoque inicial','Entradas','Saídas','Ajustes','Atual','Mínimo','Alerta'],i=>[i.product,i.initial,i.entries,i.sales_out,i.adjustments,i.current,i.minimum||0,badge(Number(i.current)<=Number(i.minimum||0)?'REPOR':'OK',Number(i.current)<=Number(i.minimum||0)?'danger':'')])}

function lots(){
 title('Cargas / Lotes','Adicione a carga que chegou e informe quanto rendeu.');
 content.innerHTML=`<div class="card"><form id="lf"><div class="field"><label>Código da carga</label><input name="lot" placeholder="Ex.: GUAIRA-08" required></div><div class="field"><label>Data de chegada</label><input name="start_date" type="date" value="${today()}" required></div><div class="field"><label>Origem / Fornecedor</label><input name="supplier"></div><div class="field"><label>Quantidade que rendeu (sacos)</label><input name="base_qty" type="number" min="1" required></div><div class="field span2"><label>Observações</label><input name="notes"></div></form><div class="actions"><button class="primary" id="sl">Adicionar carga</button></div></div><div class="section"><h2>Cargas cadastradas</h2>${table(db.lots,['Carga','Chegada','Origem','Rendimento','Vendido','Saldo','Status'],l=>[l.lot,l.start_date,l.supplier,l.base_qty,l.sold,l.balance,badge(l.status,l.status==='ACABOU'?'warn':'')])}</div>`;sl.onclick=()=>{if(!lf.reportValidity())return;const o=Object.fromEntries(new FormData(lf));if(db.lots.some(l=>l.lot.toLowerCase()===o.lot.toLowerCase()))return alert('Essa carga já existe.');const q=Number(o.base_qty);db.lots.push({id:uid(),...o,base_qty:q,sold:0,balance:q,status:'EM USO',revenue:0});save();lots()}}

function quotes(){
 title('Orçamentos','Orçamento completo com dados do cliente e produtos detalhados.');
 content.innerHTML=`<div class="card"><form id="qf"><div class="field span2"><label>Cliente</label><input name="customer" list="qcl" required><datalist id="qcl">${db.customers.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist></div><div class="field"><label>Validade (dias)</label><input name="valid_days" type="number" value="${db.settings.quote_valid_days||7}"></div><div class="field"><label>Forma de pagamento</label><select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>TED</option><option>A combinar</option></select></div><div class="field"><label>Frete</label><input name="freight" type="number" step=".01" value="0"></div><div class="field full"><label>Observações</label><textarea name="notes"></textarea></div></form><div class="section"><h2>Itens</h2><div id="items"></div><button class="secondary" id="ai">+ Adicionar produto</button></div><div class="actions"><button class="primary" id="gq">Gerar orçamento</button></div></div><div id="preview" class="section"></div>`;
 function add(){const p=db.products[0]||{};const id=uid();items.insertAdjacentHTML('beforeend',`<div class="card item" id="${id}" style="margin-bottom:10px"><div class="grid" style="grid-template-columns:2fr 1fr 1fr auto"><div class="field"><label>Produto</label><select class="prod">${db.products.map(x=>`<option>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Quantidade</label><input class="qty" type="number" value="100"></div><div class="field"><label>Preço unitário</label><input class="price" type="number" step=".01" value="${p.sale_price||0}"></div><button class="danger rem" type="button" style="align-self:end">Remover</button><div class="field full"><label>Descrição</label><input class="desc" value="${esc(p.details||p.name||'')}"></div></div></div>`);const box=document.getElementById(id);box.querySelector('.prod').onchange=e=>{const pp=findProduct(e.target.value);if(pp){box.querySelector('.price').value=pp.sale_price;box.querySelector('.desc').value=pp.details}};box.querySelector('.rem').onclick=()=>box.remove()}
 add();ai.onclick=add;gq.onclick=()=>{if(!qf.reportValidity())return;const o=Object.fromEntries(new FormData(qf)),c=findCustomer(o.customer)||{name:o.customer};const it=[...document.querySelectorAll('.item')].map(b=>({product:b.querySelector('.prod').value,description:b.querySelector('.desc').value,quantity:Number(b.querySelector('.qty').value||0),unit_price:Number(b.querySelector('.price').value||0)})).filter(x=>x.quantity>0);const freight=Number(o.freight||0),subtotal=it.reduce((a,x)=>a+x.quantity*x.unit_price,0),q={id:uid(),number:String(db.quotes.length+1).padStart(5,'0'),date:today(),customer:{...c},items:it,valid_days:o.valid_days,payment_method:o.payment_method,freight,notes:o.notes,subtotal,total:subtotal+freight};db.quotes.push(q);save();preview.innerHTML=quoteHtml(q)}
}
function quoteHtml(q){const c=q.customer,rows=q.items.map(x=>`<tr><td>${esc(x.product)}<br><small>${esc(x.description)}</small></td><td>${x.quantity}</td><td>${money(x.unit_price)}</td><td>${money(x.quantity*x.unit_price)}</td></tr>`).join(''),msg=encodeURIComponent(`Orçamento nº ${q.number} - Silagem Baixa Verde\nCliente: ${c.name}\nTotal: ${money(q.total)}`);return `<div class="quote"><div class="quote-head"><img src="${appLogo()}"><div><h2>ORÇAMENTO Nº ${q.number}</h2><b>${esc(companyName())}</b><br><small>${esc(companySlogan())}</small></div></div><p><b>Data:</b> ${q.date}</p>
${db.settings.cpf_cnpj?`<p><b>CPF/CNPJ da empresa:</b> ${esc(db.settings.cpf_cnpj)}</p>`:''}
${db.settings.phone?`<p><b>Telefone:</b> ${esc(db.settings.phone)}</p>`:''}
${db.settings.email?`<p><b>E-mail:</b> ${esc(db.settings.email)}</p>`:''}
${db.settings.address?`<p><b>Endereço:</b> ${esc([db.settings.address,db.settings.city,db.settings.state].filter(Boolean).join(', '))}</p>`:''}
<h3>Dados do cliente</h3><p><b>Nome / Razão social:</b> ${esc(c.name)}</p>${c.cpf_cnpj?`<p><b>CPF/CNPJ:</b> ${esc(c.cpf_cnpj)}</p>`:''}${c.phone?`<p><b>Telefone:</b> ${esc(c.phone)}</p>`:''}${customerAddress(c)?`<p><b>Endereço:</b> ${esc(customerAddress(c))}</p>`:''}<h3>Produtos</h3><div class="table-wrap"><table><thead><tr><th>Produto / descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div><p><b>Frete:</b> ${money(q.freight)}</p><p><b>Pagamento:</b> ${esc(q.payment_method)}</p><p><b>Validade:</b> ${q.valid_days} dias</p>${q.notes?`<p><b>Observações:</b> ${esc(q.notes)}</p>`:''}<div class="quote-total">TOTAL: ${money(q.total)}</div>
${db.settings.document_footer?`<p style="margin-top:24px;color:#6d776e"><small>${esc(db.settings.document_footer)}</small></p>`:''}
<div class="actions"><button class="secondary" onclick="window.print()">Imprimir / PDF</button><a href="https://wa.me/?text=${msg}" target="_blank"><button class="primary">Enviar pelo WhatsApp</button></a></div></div>`}

function receipts(){
 title('Recibos','Recibo completo com os dados da compra e do cliente.');
 const r=db.sales.filter(s=>s.received>0).sort((a,b)=>String(b.date).localeCompare(String(a.date)));content.innerHTML=table(r,['Data','Cliente','Produto','Qtd.','Recebido','Saldo','Ação'],s=>[s.date,s.customer,s.product,s.quantity,money(s.received),money(s.receivable),`<button class="secondary" onclick="receipt('${s.id}')">Gerar recibo</button>`])
}
window.receipt=id=>{const s=db.sales.find(x=>x.id===id),c=findCustomer(s.customer)||{name:s.customer},p=findProduct(s.product)||{},num=String(db.receipts.length+1).padStart(5,'0'),status=s.receivable<=0?'PAGAMENTO QUITADO':'PAGAMENTO PARCIAL',msg=encodeURIComponent(`Recibo nº ${num} - Silagem Baixa Verde\nCliente: ${s.customer}\nRecebido: ${money(s.received)}\nSaldo: ${money(s.receivable)}`);db.receipts.push({id:uid(),number:num,sale_id:id,date:today()});save();content.innerHTML=`<div class="quote"><div class="quote-head"><img src="${appLogo()}"><div><h2>RECIBO Nº ${num}</h2><b>${esc(companyName())}</b><br><small>${esc(companySlogan())}</small></div></div>${db.settings.cpf_cnpj?`<p><b>CPF/CNPJ da empresa:</b> ${esc(db.settings.cpf_cnpj)}</p>`:''}
${db.settings.phone?`<p><b>Telefone:</b> ${esc(db.settings.phone)}</p>`:''}
${db.settings.address?`<p><b>Endereço:</b> ${esc([db.settings.address,db.settings.city,db.settings.state].filter(Boolean).join(', '))}</p>`:''}
<h3>Dados do cliente</h3><p><b>Nome / Razão social:</b> ${esc(c.name)}</p>${c.cpf_cnpj?`<p><b>CPF/CNPJ:</b> ${esc(c.cpf_cnpj)}</p>`:''}${c.phone?`<p><b>Telefone:</b> ${esc(c.phone)}</p>`:''}${customerAddress(c)?`<p><b>Endereço:</b> ${esc(customerAddress(c))}</p>`:''}<h3>Dados da compra</h3><p><b>Data:</b> ${s.date}</p><p><b>Produto:</b> ${esc(s.product)}</p><p><b>Descrição:</b> ${esc(p.details||s.product)}</p><p><b>Quantidade:</b> ${s.quantity}</p><p><b>Preço unitário:</b> ${money(s.unit_price||0)}</p><p><b>Frete cobrado:</b> ${money(s.freight_charged)}</p><p><b>Total da venda:</b> ${money(s.total)}</p>${s.invoice_number?`<p><b>NF:</b> ${esc(s.invoice_number)}</p>`:''}<h3>Confirmação de pagamento</h3><p><b>Valor recebido:</b> ${money(s.received)}</p><p><b>Saldo:</b> ${money(s.receivable)}</p><p><b>Situação:</b> ${status}</p><p>${esc(db.settings.receipt_text||'')}</p>
${db.settings.document_footer?`<p style="margin-top:20px;color:#6d776e"><small>${esc(db.settings.document_footer)}</small></p>`:''}
<div class="actions"><button class="secondary" onclick="window.print()">Imprimir / PDF</button><a href="https://wa.me/?text=${msg}" target="_blank"><button class="primary">Enviar pelo WhatsApp</button></a></div></div>`}

async function start(){
 db=migrate(INITIAL);
 renderNav();
 applySettings();
 setCloudStatus('Conectando...',true);
 const {data:{session}}=await cloudClient.auth.getSession();
 if(session){
   await finishCloudLogin(session);
 }else{
   setCloudStatus('Login necessário',false);
   showCloudLogin();
 }
}
start();
