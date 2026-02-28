import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area } from "recharts";
import { supabase } from "./supabase";
import Login from "./Login";

// ─── MATH ─────────────────────────────────────────────────────────────────────
const fv        = (pv, r, n) => pv * Math.pow(1 + r, n);
const fvAnn     = (p, r, n) => r === 0 ? p * n : p * (Math.pow(1 + r, n) - 1) / r;
const moFromPot = (pot, r, y) => { const rm = r/12, n = y*12; return rm===0 ? pot/n : pot*rm/(1-Math.pow(1+rm,-n)); };
const fvISK     = (pv, a, r, n) => { const rn = Math.max(0,r-0.00888); return fv(pv,rn,n)+fvAnn(a,rn,n); };
const fvSE      = (pv, r, n, b) => { const g = fv(pv,r,n); return g - Math.max(0,g-(b??pv))*0.30; };
const fvDK      = (pv, r, n) => fv(pv, r*0.70, n);
const fvASK     = (pv, a, r, n) => { const rn=r*0.83; return fv(pv,rn,n)+fvAnn(a,rn,n); };
const toMYR     = (amt, cur, R) => amt * ({MYR:1,SEK:R.sek,DKK:R.dkk,AUD:R.aud,EUR:R.eur,USD:R.usd,GBP:R.gbp}[cur]??1);
const drawdown  = (pot, mo, r, yrs) => { let b=pot; const rm=r/12, out=[Math.round(b)]; for(let y=1;y<=yrs;y++){for(let m=0;m<12;m++){b=b*(1+rm)-mo;if(b<0)b=0;}out.push(Math.round(b));}return out; };

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const fmtM = n => "RM " + Math.round(n||0).toLocaleString("en-MY");
const fmtD = n => { const a=Math.abs(Math.round(n)).toLocaleString("en-MY"); return (n>=0?"+":"−")+"RM "+a; };
const fmtK = v => v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":String(Math.round(v));

// ─── STYLES ───────────────────────────────────────────────────────────────────
const C = { bg:"#0d0f0e", s1:"#141816", s2:"#1c211e", brd:"#2a302c", gold:"#c9a84c", grn:"#4caf7d", red:"#e07070", amb:"#e09c4c", txt:"#d8e0da", dim:"#6b7a6e", acc:"#7cc4a0" };
const gr = (n,g=12) => ({ display:"grid", gridTemplateColumns:`repeat(${n},1fr)`, gap:g });

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const Mono = ({ color, children, sz=10, style }) =>
  <div style={{ fontFamily:"monospace", fontSize:sz, letterSpacing:"0.13em", textTransform:"uppercase", color, ...(style||{}) }}>{children}</div>;

const Box = ({ children, style }) =>
  <div style={{ background:C.s2, border:`1px solid ${C.brd}`, borderRadius:10, padding:"11px 14px", ...style }}>{children}</div>;

const numStyle = { background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:16, width:"100%", marginTop:2 };
const numStyleFlex = { ...numStyle, flex:1, minWidth:0 };

const Field = ({ lbl, value, onChange, unit, note }) => (
  <Box>
    <Mono color={C.dim}>{lbl}</Mono>
    <input key={value} type="text" inputMode="decimal" defaultValue={value}
      onBlur={e => { const n = parseFloat(e.target.value); onChange(isNaN(n) ? 0 : n); }}
      style={numStyle} />
    {unit && <Mono color={C.dim} sz={9}>{unit}</Mono>}
    {note && <Mono color={C.amb} sz={9}>{note}</Mono>}
  </Box>
);

const CurField = ({ lbl, value, cur, onVal, onCur, note }) => (
  <Box>
    <Mono color={C.dim}>{lbl}</Mono>
    <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:2 }}>
      <input key={value} type="text" inputMode="decimal" defaultValue={value}
        onBlur={e => { const n = parseFloat(e.target.value); onVal(isNaN(n) ? 0 : n); }}
        style={numStyleFlex} />
      <select value={cur} onChange={e => onCur(e.target.value)}
        style={{ background:C.s1, border:`1px solid ${C.brd}`, borderRadius:6, color:C.gold, fontFamily:"monospace", fontSize:11, padding:"3px 6px", cursor:"pointer", outline:"none" }}>
        {["SEK","DKK","MYR","AUD","EUR","USD","GBP"].map(c=><option key={c}>{c}</option>)}
      </select>
    </div>
    {note && <Mono color={C.amb} sz={9}>{note}</Mono>}
  </Box>
);

const Kard = ({ lbl, val, sub, color="#fff" }) => (
  <div style={{ background:C.s1, border:`1px solid ${C.brd}`, borderRadius:12, padding:16 }}>
    <Mono color={C.dim}>{lbl}</Mono>
    <div style={{ fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, color, marginTop:4 }}>{val}</div>
    {sub && <div style={{ fontSize:11, color:C.dim, marginTop:3 }}>{sub}</div>}
  </div>
);

const Pill = ({ label, color }) =>
  <span style={{ display:"inline-flex", padding:"2px 8px", background:`${color}15`, border:`1px solid ${color}40`, borderRadius:6, fontSize:10, color, fontFamily:"monospace", marginRight:5, marginBottom:4 }}>{label}</span>;

const ABox = ({ type, children }) => {
  const m = { ok:{b:"rgba(76,175,125,0.09)",br:"rgba(76,175,125,0.3)",c:C.grn,i:"✓"}, warn:{b:"rgba(224,156,76,0.09)",br:"rgba(224,156,76,0.3)",c:C.amb,i:"△"}, bad:{b:"rgba(224,112,112,0.09)",br:"rgba(224,112,112,0.3)",c:C.red,i:"✗"} }[type];
  return <div style={{ background:m.b, border:`1px solid ${m.br}`, color:m.c, borderRadius:10, padding:"9px 13px", fontSize:12, lineHeight:1.5, display:"flex", gap:8, marginBottom:7 }}><span>{m.i}</span><div>{children}</div></div>;
};

const TL = ({ yr, dot, title, desc }) => (
  <div style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.s2}` }}>
    <span style={{ fontFamily:"monospace", fontSize:11, color:C.gold, minWidth:38, flexShrink:0 }}>{yr}</span>
    <div style={{ width:7, height:7, borderRadius:"50%", background:dot, flexShrink:0, marginTop:4 }} />
    <div><div style={{ fontSize:12, fontWeight:500, color:"#fff" }}>{title}</div><div style={{ fontSize:11, color:C.dim, marginTop:1, lineHeight:1.4 }}>{desc}</div></div>
  </div>
);

const Hr = () => <div style={{ borderTop:`1px solid ${C.brd}`, margin:"24px 0" }} />;

const SecHead = ({ title, pill, top=32 }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, marginTop:top }}>
    <h2 style={{ fontFamily:"Georgia,serif", fontSize:17, fontWeight:700, color:"#fff", margin:0 }}>{title}</h2>
    {pill && <span style={{ fontFamily:"monospace", fontSize:9, padding:"2px 9px", borderRadius:100, border:`1px solid ${C.brd}`, color:C.dim }}>{pill}</span>}
  </div>
);

const FundRow = ({ f, idx, dot, onField, preview }) => (
  <div style={{ marginBottom:8, background:C.s2, border:`1px solid ${C.brd}`, borderRadius:10, padding:"11px 13px" }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
      <div style={{ width:18,height:18,borderRadius:"50%",background:dot,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:C.bg,flexShrink:0 }}>{idx+1}</div>
      <input value={f.name} onChange={e=>onField("name",e.target.value)} placeholder={`Fund ${idx+1} name`}
        style={{ background:"transparent",border:"none",borderBottom:`1px solid ${C.brd}`,outline:"none",color:"#fff",fontSize:13,flex:1,paddingBottom:1 }} />
    </div>
    <div style={gr(3,8)}>
      <div>
        <Mono color={C.dim}>Value</Mono>
        <div style={{ display:"flex",gap:5,alignItems:"center",marginTop:2 }}>
          <input key={f.value} type="text" inputMode="decimal" defaultValue={f.value}
            onBlur={e=>{ const n=parseFloat(e.target.value); onField("value",isNaN(n)?0:n); }}
            style={{ background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:15,flex:1,minWidth:0 }} />
          <select value={f.currency} onChange={e=>onField("currency",e.target.value)}
            style={{ background:C.s1,border:`1px solid ${C.brd}`,borderRadius:5,color:C.gold,fontFamily:"monospace",fontSize:10,padding:"2px 5px",cursor:"pointer",outline:"none" }}>
            {["SEK","DKK","MYR","AUD","EUR","USD","GBP"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Mono color={C.dim}>Cost Basis</Mono>
        <input key={f.cost_basis} type="text" inputMode="decimal" defaultValue={f.cost_basis}
          onBlur={e=>{ const n=parseFloat(e.target.value); onField("cost_basis",isNaN(n)?0:n); }}
          style={{ background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:15,width:"100%",marginTop:2 }} />
        <Mono color={C.dim} sz={9}>{f.currency} — purchase price</Mono>
      </div>
      <div style={{ display:"flex",alignItems:"flex-end" }}>
        {f.value>0
          ? <div style={{ fontSize:11,color:C.dim,lineHeight:1.5 }}>After-tax →<br/><span style={{ color:C.amb,fontSize:13,fontWeight:600 }}>{preview}</span></div>
          : <div style={{ fontSize:11,color:C.brd }}>Enter value</div>}
      </div>
    </div>
  </div>
);

const RefCard = ({ label, body, url, source }) => (
  <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:10,padding:"12px 16px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:6}}>
      <div style={{fontSize:13,fontWeight:600,color:"#fff",lineHeight:1.3}}>{label}</div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{fontFamily:"monospace",fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",color:C.gold,textDecoration:"none",border:`1px solid ${C.gold}40`,borderRadius:5,padding:"3px 8px",flexShrink:0,whiteSpace:"nowrap"}}>
        {source} ↗
      </a>
    </div>
    <div style={{fontSize:12,color:C.dim,lineHeight:1.6}}>{body}</div>
  </div>
);

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  Y: {
    age:44, retire:55, salary:55000,
    alm_bal:80000, alm_age:63,
    itp_bal:250000, itp_sac:0,
    sup_aud:80000,
    isk_bal:150000, isk_mo:3000,
    funds:[
      {name:"Fund 1", value:50000, currency:"SEK", cost_basis:35000},
      {name:"Fund 2", value:0,     currency:"EUR", cost_basis:0},
      {name:"Fund 3", value:0,     currency:"USD", cost_basis:0},
    ],
    stk_val:30000, stk_cur:"SEK", stk_bas:20000,
    prop_val:0, prop_cur:"SEK", prop_bas:0,
    setup_myr:50000,
  },
  P: {
    age:46, retire:55, salary:52000,
    epf:120000,
    dko_bal:180000, dko_sac:0,
    ask_bal:80000, ask_mo:2000,
    funds:[
      {name:"Fund 1", value:60000, currency:"DKK", cost_basis:45000},
      {name:"Fund 2", value:0,     currency:"EUR", cost_basis:0},
      {name:"Fund 3", value:0,     currency:"MYR", cost_basis:0},
    ],
    stk_val:40000, stk_cur:"DKK", stk_bas:30000,
    prop_val:0, prop_cur:"DKK", prop_bas:0,
    setup_myr:50000,
  },
  SH: {
    ret:6, inf:3, tgt:10000, yrs:30,
    sek:0.44, dkk:0.65, aud:2.85, eur:4.90, usd:4.55, gbp:5.80,
  },
};

// ─── ROOT: handles auth state ──────────────────────────────────────────────────
export default function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setChecking(false);
    });
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return (
    <div style={{ background:"#0d0f0e", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#6b7a6e", fontFamily:"monospace", fontSize:11, letterSpacing:"0.1em" }}>
      LOADING…
    </div>
  );

  if (!user) return <Login onLogin={setUser} />;
  return <Planner user={user} onSignOut={() => supabase.auth.signOut()} />;
}

// ─── PLANNER ──────────────────────────────────────────────────────────────────
function Planner({ user, onSignOut }) {
  const [tab, setTab] = useState("inputs");
  const [open, setOpen] = useState({
    y_salary:true, y_pensions:true, y_super:true, y_isk:true,
    y_funds:false, y_stocks:false, y_prop:false,
    p_salary:true, p_pensions:true, p_ask:true,
    p_funds:false, p_stocks:false, p_prop:false,
  });
  const tog = k => setOpen(o => ({...o,[k]:!o[k]}));
  const Sec = ({ id, title, accent, children }) => (
    <div style={{ marginBottom:7, border:`1px solid ${C.brd}`, borderRadius:10, overflow:"hidden" }}>
      <div onClick={()=>tog(id)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 13px",background:C.s2,cursor:"pointer" }}>
        <Mono color={accent||C.acc}>{title}</Mono>
        <span style={{ color:C.dim, fontSize:11 }}>{open[id]?"▲":"▼"}</span>
      </div>
      {open[id] && <div style={{ padding:13, background:C.s1 }}>{children}</div>}
    </div>
  );

  const [Y,  setY]  = useState(DEFAULTS.Y);
  const [P,  setP]  = useState(DEFAULTS.P);
  const [SH, setSH] = useState(DEFAULTS.SH);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSaved, setLastSaved]   = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load shared data from Supabase on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("planner_data")
        .select("*")
        .eq("user_email", "shared")
        .single();

      if (data && data.data) {
        const saved = data.data;
        if (saved.Y)  setY(prev  => ({...DEFAULTS.Y,  ...saved.Y,  funds: saved.Y.funds?.length  ? saved.Y.funds  : DEFAULTS.Y.funds}));
        if (saved.P)  setP(prev  => ({...DEFAULTS.P,  ...saved.P,  funds: saved.P.funds?.length  ? saved.P.funds  : DEFAULTS.P.funds}));
        if (saved.SH) setSH(prev => ({...DEFAULTS.SH, ...saved.SH}));
        if (saved.lastSaved) setLastSaved(saved.lastSaved);
        setSaveStatus("loaded");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
      setDataLoaded(true);
    })();
  }, []);

  // Save shared data to Supabase
  const saveAll = async (yVal, pVal, shVal) => {
    setSaveStatus("saving");
    const ts = new Date().toISOString();
    const payload = { Y: yVal, P: pVal, SH: shVal, lastSaved: ts };

    // Try update first, then insert (upsert by user_email="shared")
    const { data: existing } = await supabase
      .from("planner_data")
      .select("id")
      .eq("user_email", "shared")
      .single();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("planner_data")
        .update({ data: payload, updated_at: ts })
        .eq("user_email", "shared"));
    } else {
      ({ error } = await supabase
        .from("planner_data")
        .insert({ user_email: "shared", data: payload }));
    }

    if (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
    } else {
      setLastSaved(ts);
      setSaveStatus("saved");
    }
    setTimeout(() => setSaveStatus("idle"), 2500);
  };

  const sy  = (k,v) => setY(p  => ({...p,[k]:v}));
  const sp  = (k,v) => setP(p  => ({...p,[k]:v}));
  const ssh = (k,v) => setSH(p => ({...p,[k]:v}));
  const syf = (i,f,v) => setY(p => ({...p,funds:p.funds.map((x,j)=>j===i?{...x,[f]:v}:x)}));
  const spf = (i,f,v) => setP(p => ({...p,funds:p.funds.map((x,j)=>j===i?{...x,[f]:v}:x)}));

  // ─── CALCULATIONS ─────────────────────────────────────────────────────────
  const R   = SH;
  const ret = R.ret/100;
  const rl  = (1+ret)/(1+R.inf/100)-1;
  const toM = (a,c) => toMYR(a,c,R);

  const y_yrs = Y.retire - Y.age;
  const p_yrs = P.retire - P.age;

  const itp_p  = (fv(Y.itp_bal,ret,y_yrs) + fvAnn((Y.salary*0.10+Y.itp_sac)*12,ret,y_yrs)) * R.sek;
  const alm_p  = fv(Y.alm_bal,0.025,Y.alm_age-Y.age) * R.sek;
  const sup_p  = fv(Y.sup_aud,ret,60-Y.age) * R.aud;
  const isk_p  = fvISK(Y.isk_bal,Y.isk_mo*12,ret,y_yrs) * R.sek;
  const yFunds = Y.funds.map(f=>f.value>0?toM(fvSE(f.value,ret,y_yrs,f.cost_basis||f.value),f.currency):0);
  const yFundT = yFunds.reduce((s,v)=>s+v,0);
  const yStk_p = toM(fvSE(Y.stk_val,ret,y_yrs,Y.stk_bas||Y.stk_val),Y.stk_cur);
  const yPropG = toM(fv(Y.prop_val,0.03,y_yrs),Y.prop_cur);
  const yProp  = Y.prop_val>0?yPropG-Math.max(0,yPropG-toM(Y.prop_bas||Y.prop_val,Y.prop_cur))*0.22:0;
  const yInv   = yFundT + yStk_p;
  const yTot   = Math.max(0, itp_p + isk_p + yInv - Y.setup_myr);
  const itp_mo = moFromPot(itp_p,rl,R.yrs);
  const isk_mo = moFromPot(isk_p,rl,R.yrs);
  const yInvMo = moFromPot(yInv,rl,R.yrs);
  const y55    = moFromPot(yTot,rl,R.yrs);
  const sup_mo = moFromPot(sup_p,rl,Math.max(1,R.yrs-5));
  const alm_mo = moFromPot(alm_p,rl,Math.max(1,R.yrs-(Y.alm_age-55)));

  const epf_p  = fv(P.epf,ret,p_yrs) + fvAnn((P.salary*R.dkk)*0.23*12,ret,p_yrs);
  const dko_p  = (fv(P.dko_bal,ret,64-P.age)+fvAnn(P.dko_sac*12,ret,64-P.age))*R.dkk;
  const ask_p  = fvASK(P.ask_bal,P.ask_mo*12,ret,p_yrs)*R.dkk;
  const pFunds = P.funds.map(f=>f.value>0?toM(fvDK(f.value,ret,p_yrs),f.currency):0);
  const pFundT = pFunds.reduce((s,v)=>s+v,0);
  const pStk_p = toM(fvDK(P.stk_val,ret,p_yrs),P.stk_cur);
  const pProp  = toM(fv(P.prop_val,0.03,p_yrs),P.prop_cur);
  const pInv   = pFundT + pStk_p;
  const pTot   = Math.max(0, epf_p + ask_p + pInv - P.setup_myr);
  const epf_mo = moFromPot(epf_p,rl,R.yrs);
  const ask_mo = moFromPot(ask_p,rl,R.yrs);
  const pInvMo = moFromPot(pInv,rl,R.yrs);
  const p55    = moFromPot(pTot,rl,R.yrs);
  const dko_mo = moFromPot(dko_p,rl,Math.max(1,R.yrs-9));

  const yGap  = y55 - R.tgt;
  const pGap  = p55 - R.tgt;
  const comb  = y55 + p55;
  const tgt2  = R.tgt * 2;
  const pct   = Math.min(100,Math.round(comb/tgt2*100));
  const gapT  = comb - tgt2;
  const lump  = (gap,r,y) => { if(gap>=0)return 0; const rm=r/12,n=y*12; return Math.abs(gap)*(1-Math.pow(1+rm,-n))/rm; };

  const ages = Array.from({length:R.yrs+1},(_,i)=>55+i);
  const incomeDat = ages.map(age=>{
    let y=y55,p=p55;
    if(age>=60)y+=sup_mo; if(age>=Y.alm_age)y+=alm_mo;
    if(age>=64)p+=dko_mo; if(age>=67)p+=1000;
    return {age,you:Math.round(y),partner:Math.round(p)};
  });
  const yBal = drawdown(yTot,y55,rl,R.yrs);
  const pBal = drawdown(pTot,p55,rl,R.yrs);
  const balDat = ages.map((age,i)=>({age,you:yBal[i],partner:pBal[i]}));

  const yr = new Date().getFullYear();
  const tst = {background:C.s2,border:`1px solid ${C.brd}`,color:C.txt,fontSize:11};
  const tk  = {fill:C.dim,fontSize:10,fontFamily:"monospace"};
  const DYOU=[C.grn,C.gold,C.acc], DPAR=[C.gold,C.grn,C.acc];

  const saveBtnColor = saveStatus==="saved"||saveStatus==="loaded" ? C.grn : saveStatus==="error" ? C.red : C.dim;
  const saveBtnLabel = saveStatus==="saving"?"Saving…":saveStatus==="saved"?"✓ Saved":saveStatus==="loaded"?"✓ Loaded":saveStatus==="error"?"✗ Error":"💾 Save";

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.txt,fontFamily:"system-ui,sans-serif",fontSize:13}}>

      {/* HEADER */}
      <div style={{padding:"20px 20px 14px",borderBottom:`1px solid ${C.brd}`,background:"linear-gradient(180deg,#111713,transparent)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",maxWidth:1100,margin:"0 auto"}}>
          <div>
            <Mono color={C.gold} sz={10}>FitFIRE · Retirement Planner</Mono>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:900,color:"#fff",lineHeight:1.1,margin:"4px 0 4px"}}>
              Retire at <span style={{color:C.gold}}>55</span> in Malaysia
            </h1>
            <div style={{fontSize:11,color:C.dim}}>AU Super · SE ITP + Allmän + ISK · MY EPF · DK ATP + ASK</div>
            {lastSaved && (
              <div style={{marginTop:4,fontFamily:"monospace",fontSize:9,color:C.dim,letterSpacing:"0.08em"}}>
                LAST SAVED · {new Date(lastSaved).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} at {new Date(lastSaved).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,marginTop:4}}>
            <button onClick={() => saveAll(Y, P, SH)} style={{
              padding:"7px 16px", borderRadius:8, cursor:"pointer",
              border:`1px solid ${saveBtnColor}`,
              background:`${saveBtnColor}18`,
              color:saveBtnColor,
              fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase",
            }}>{saveBtnLabel}</button>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:C.dim}}>{user.email}</div>
              <button onClick={onSignOut} style={{background:"none",border:"none",color:C.dim,fontSize:10,fontFamily:"monospace",cursor:"pointer",textDecoration:"underline",padding:0,marginTop:2}}>sign out</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"16px 16px 80px"}}>

        {/* TABS */}
        <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
          {[["inputs","Inputs"],["forecast","Forecast"],["timeline","Timeline"],["strategy","Strategy"],["refs","References"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${tab===id?C.gold:C.brd}`,background:tab===id?"rgba(201,168,76,0.09)":"transparent",color:tab===id?C.gold:C.dim,fontFamily:"monospace",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer"}}>{lbl}</button>
          ))}
        </div>

        {/* ═══ INPUTS ═══ */}
        {tab==="inputs" && <>
          <SecHead title="🇸🇪 You — Sweden" top={0} />
          <div style={{background:"rgba(76,175,125,0.03)",border:"1px solid rgba(76,175,125,0.12)",borderRadius:12,padding:12,marginBottom:12}}>
            <Sec id="y_salary" title="Personal & Salary" accent={C.grn}>
              <div style={gr(4,9)}>
                <Field lbl="Your Age"             value={Y.age}     onChange={v=>sy("age",v)}     unit="years" />
                <Field lbl="Retire At"            value={Y.retire}  onChange={v=>sy("retire",v)}  unit="years" />
                <Field lbl="Salary SEK/month"     value={Y.salary}  onChange={v=>sy("salary",v)}  unit="SEK gross" />
                <Field lbl="ITP Sacrifice SEK/mo" value={Y.itp_sac} onChange={v=>sy("itp_sac",v)} unit="pre-tax top-up ITPK" />
              </div>
            </Sec>
            <Sec id="y_pensions" title="Allmän Pension + ITP" accent={C.grn}>
              <div style={{marginBottom:8}}>
                <Pill label="Allmän: from age 63" color={C.amb} />
                <Pill label="ITP: from age 55" color={C.grn} />
                <Pill label="SINK abroad: 25%" color={C.dim} />
              </div>
              <div style={gr(3,9)}>
                <Field lbl="Allmän Balance SEK"   value={Y.alm_bal} onChange={v=>sy("alm_bal",v)} unit="Pensionsmyndigheten" note="Grows ~2.5%/yr" />
                <Field lbl="Earliest Draw Age"    value={Y.alm_age} onChange={v=>sy("alm_age",v)} unit="min 63 currently" />
                <Field lbl="ITP/ITPK Balance SEK" value={Y.itp_bal} onChange={v=>sy("itp_bal",v)} unit="Collectum / Alecta" />
              </div>
            </Sec>
            <Sec id="y_super" title="Australian Super" accent={C.amb}>
              <div style={{marginBottom:8}}>
                <Pill label="Locked until 60" color={C.red} />
                <Pill label="Tax-free at 60+" color={C.grn} />
              </div>
              <div style={gr(2,9)}>
                <Field lbl="Super Balance AUD" value={Y.sup_aud} onChange={v=>sy("sup_aud",v)} unit="no new contributions assumed" />
              </div>
            </Sec>
            <Sec id="y_isk" title="Swedish ISK Account" accent={C.acc}>
              <div style={{marginBottom:8}}>
                <Pill label="0.888%/yr schablonintäkt" color={C.acc} />
                <Pill label="Zero exit CGT" color={C.grn} />
                <Pill label="First SEK 150k free" color={C.grn} />
              </div>
              <div style={gr(2,9)}>
                <Field lbl="ISK Balance SEK"    value={Y.isk_bal} onChange={v=>sy("isk_bal",v)} unit="current balance" />
                <Field lbl="Monthly Top-up SEK" value={Y.isk_mo}  onChange={v=>sy("isk_mo",v)}  unit="SEK/month" />
              </div>
            </Sec>
            <Sec id="y_funds" title="Funds — up to 3 (non-ISK depot)" accent={C.dim}>
              <div style={{marginBottom:8}}>
                <Pill label="30% CGT on gain at exit" color={C.red} />
                <Pill label="Use ISK to avoid this" color={C.grn} />
              </div>
              {Y.funds.map((f,i)=><FundRow key={i} f={f} idx={i} dot={DYOU[i]} onField={(fld,v)=>syf(i,fld,v)} preview={f.value>0?fmtM(toMYR(fvSE(f.value,ret,y_yrs,f.cost_basis||f.value),f.currency,R)):""} />)}
            </Sec>
            <Sec id="y_stocks" title="Stocks (non-ISK depot)" accent={C.dim}>
              <div style={{marginBottom:8}}><Pill label="30% CGT on gain at exit" color={C.red} /></div>
              <div style={gr(2,9)}>
                <CurField lbl="Stocks Value" value={Y.stk_val} cur={Y.stk_cur} onVal={v=>sy("stk_val",v)} onCur={v=>sy("stk_cur",v)} note="30% CGT on gain" />
                <Field lbl="Cost Basis" value={Y.stk_bas} onChange={v=>sy("stk_bas",v)} unit={`${Y.stk_cur} purchase price`} />
              </div>
            </Sec>
            <Sec id="y_prop" title="Property" accent={C.dim}>
              <div style={{marginBottom:8}}>
                <Pill label="22% CGT on gain" color={C.amb} />
                <Pill label="3%/yr growth" color={C.dim} />
              </div>
              <div style={gr(2,9)}>
                <CurField lbl="Property Value" value={Y.prop_val} cur={Y.prop_cur} onVal={v=>sy("prop_val",v)} onCur={v=>sy("prop_cur",v)} />
                <CurField lbl="Cost Basis"     value={Y.prop_bas} cur={Y.prop_cur} onVal={v=>sy("prop_bas",v)} onCur={v=>sy("prop_cur",v)} note="Set 0 = no CGT" />
              </div>
            </Sec>
          </div>

          <SecHead title="🇩🇰 Partner — Denmark" />
          <div style={{background:"rgba(201,168,76,0.03)",border:"1px solid rgba(201,168,76,0.12)",borderRadius:12,padding:12,marginBottom:12}}>
            <Sec id="p_salary" title="Personal & Salary" accent={C.gold}>
              <div style={gr(4,9)}>
                <Field lbl="Partner Age"          value={P.age}     onChange={v=>sp("age",v)}     unit="years" />
                <Field lbl="Retire At"            value={P.retire}  onChange={v=>sp("retire",v)}  unit="years" />
                <Field lbl="Salary DKK/month"     value={P.salary}  onChange={v=>sp("salary",v)}  unit="DKK gross" />
                <Field lbl="DK Pension Sacrifice" value={P.dko_sac} onChange={v=>sp("dko_sac",v)} unit="DKK/mo pre-tax" note="~40% tax relief" />
              </div>
            </Sec>
            <Sec id="p_pensions" title="EPF + Danish Occupational Pension" accent={C.gold}>
              <div style={{marginBottom:8}}>
                <Pill label="EPF: age 55" color={C.grn} />
                <Pill label="DK Occ: ~age 64" color={C.amb} />
                <Pill label="ATP: locked ~67" color={C.red} />
              </div>
              <div style={gr(2,9)}>
                <Field lbl="EPF Balance MYR"          value={P.epf}     onChange={v=>sp("epf",v)}     unit="accessible at 55" note="+23% salary contribution modelled" />
                <Field lbl="DK Occupational Pen DKK"  value={P.dko_bal} onChange={v=>sp("dko_bal",v)} unit="from PensionsInfo.dk" />
              </div>
            </Sec>
            <Sec id="p_ask" title="Danish Aktiesparekonto (ASK)" accent={C.gold}>
              <div style={{marginBottom:8}}>
                <Pill label="17% annual mark-to-market" color={C.amb} />
                <Pill label="DKK 166,200 limit 2025" color={C.dim} />
              </div>
              <div style={gr(2,9)}>
                <Field lbl="ASK Balance DKK"    value={P.ask_bal} onChange={v=>sp("ask_bal",v)} unit="DKK" />
                <Field lbl="Monthly Top-up DKK" value={P.ask_mo}  onChange={v=>sp("ask_mo",v)}  unit="DKK/month" />
              </div>
            </Sec>
            <Sec id="p_funds" title="Funds — up to 3 (regular depot)" accent={C.dim}>
              <div style={{marginBottom:8}}>
                <Pill label="~30% annual drag (27/42%)" color={C.red} />
                <Pill label="Use ASK instead (17%)" color={C.grn} />
              </div>
              {P.funds.map((f,i)=><FundRow key={i} f={f} idx={i} dot={DPAR[i]} onField={(fld,v)=>spf(i,fld,v)} preview={f.value>0?fmtM(toMYR(fvDK(f.value,ret,p_yrs),f.currency,R)):""} />)}
            </Sec>
            <Sec id="p_stocks" title="Stocks (regular depot)" accent={C.dim}>
              <div style={{marginBottom:8}}><Pill label="~30% annual drag" color={C.red} /></div>
              <div style={gr(2,9)}>
                <CurField lbl="Stocks Value" value={P.stk_val} cur={P.stk_cur} onVal={v=>sp("stk_val",v)} onCur={v=>sp("stk_cur",v)} note="~30% drag modelled" />
                <Field lbl="Cost Basis" value={P.stk_bas} onChange={v=>sp("stk_bas",v)} unit={P.stk_cur} />
              </div>
            </Sec>
            <Sec id="p_prop" title="Property" accent={C.dim}>
              <div style={{marginBottom:8}}>
                <Pill label="DK Primary: CGT Exempt" color={C.grn} />
                <Pill label="3%/yr growth" color={C.dim} />
              </div>
              <div style={gr(2,9)}>
                <CurField lbl="Property Value" value={P.prop_val} cur={P.prop_cur} onVal={v=>sp("prop_val",v)} onCur={v=>sp("prop_cur",v)} note="Full CGT exempt (parcelhusregel)" />
                <CurField lbl="Cost Basis"     value={P.prop_bas} cur={P.prop_cur} onVal={v=>sp("prop_bas",v)} onCur={v=>sp("prop_cur",v)} />
              </div>
            </Sec>
          </div>

          <SecHead title="Shared Assumptions" />
          <div style={gr(4,9)}>
            <Field lbl="Return % p.a."     value={SH.ret} onChange={v=>ssh("ret",v)} unit="% nominal" />
            <Field lbl="Inflation % p.a."  value={SH.inf} onChange={v=>ssh("inf",v)} unit="%" />
            <Field lbl="Target MYR/month"  value={SH.tgt} onChange={v=>ssh("tgt",v)} unit="per person" />
            <Field lbl="Retirement Years"  value={SH.yrs} onChange={v=>ssh("yrs",v)} unit="post-retirement" />
          </div>
          <div style={{...gr(3,9),marginTop:9}}>
            <Field lbl="SEK → MYR" value={SH.sek} onChange={v=>ssh("sek",v)} />
            <Field lbl="DKK → MYR" value={SH.dkk} onChange={v=>ssh("dkk",v)} />
            <Field lbl="AUD → MYR" value={SH.aud} onChange={v=>ssh("aud",v)} />
            <Field lbl="EUR → MYR" value={SH.eur} onChange={v=>ssh("eur",v)} />
            <Field lbl="USD → MYR" value={SH.usd} onChange={v=>ssh("usd",v)} />
            <Field lbl="GBP → MYR" value={SH.gbp} onChange={v=>ssh("gbp",v)} />
          </div>

          <SecHead title="🇲🇾 Malaysia Setup Costs" pill="deducted from pot at retirement" />
          <div style={{background:"rgba(201,168,76,0.03)",border:"1px solid rgba(201,168,76,0.12)",borderRadius:12,padding:12,marginBottom:12}}>
            <div style={{fontSize:12,color:C.dim,marginBottom:10,lineHeight:1.6}}>
              One-off costs deducted from each person's retirement pot — property deposit, furniture, shipping, car, legal fees, etc.
            </div>
            <div style={gr(2,9)}>
              <Field lbl="Your Setup Costs (MYR)"     value={Y.setup_myr} onChange={v=>sy("setup_myr",v)} unit="MYR — deducted from your pot at age 55"      note={`Reduces your monthly income by ~${fmtM(moFromPot(Y.setup_myr,rl,R.yrs))}/mo`} />
              <Field lbl="Partner Setup Costs (MYR)"  value={P.setup_myr} onChange={v=>sp("setup_myr",v)} unit="MYR — deducted from partner's pot at age 55"  note={`Reduces partner income by ~${fmtM(moFromPot(P.setup_myr,rl,R.yrs))}/mo`} />
            </div>
          </div>
        </>}

        {/* ═══ FORECAST ═══ */}
        {tab==="forecast" && <>
          <SecHead title="Asset Pots at Retirement (After Tax)" top={0} />
          <div style={gr(4,9)}>
            <Kard lbl="🇸🇪 ITP at 55"          val={fmtM(itp_p)}  sub="Accessible immediately"        color={C.grn} />
            <Kard lbl="🇸🇪 ISK at 55"          val={fmtM(isk_p)}  sub="After 0.888% annual drag"       color={C.grn} />
            <Kard lbl="🇸🇪 Funds (30% CGT)"    val={fmtM(yFundT)} sub={Y.funds.filter(f=>f.value>0).map(f=>f.name).join(" · ")||"none"} color={C.amb} />
            <Kard lbl="🇦🇺 Super at 60 🔒"     val={fmtM(sup_p)}  sub="Locked 5 yrs post-retirement"   color={C.red} />
          </div>
          {Y.funds.some(f=>f.value>0) && (
            <div style={{background:C.s2,border:`1px solid ${C.brd}`,borderRadius:9,padding:"10px 14px",marginTop:7}}>
              <Mono color={C.dim}>Your Funds Breakdown</Mono>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:6}}>
                {Y.funds.map((f,i)=>f.value>0&&<div key={i} style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:DYOU[i]}}/>
                  <span style={{fontSize:12,color:C.dim}}>{f.name}</span>
                  <span style={{fontSize:13}}> → {fmtM(yFunds[i])}</span>
                </div>)}
              </div>
            </div>
          )}
          <div style={{...gr(4,9),marginTop:9}}>
            <Kard lbl="🇲🇾 EPF at 55"         val={fmtM(epf_p)}  sub="Accessible immediately"         color={C.grn} />
            <Kard lbl="🇩🇰 ASK at 55 (17%)"   val={fmtM(ask_p)}  sub="Annual tax drag applied"         color={C.gold} />
            <Kard lbl="🇩🇰 Funds (~30% drag)" val={fmtM(pFundT)} sub={P.funds.filter(f=>f.value>0).map(f=>f.name).join(" · ")||"none"} color={C.amb} />
            <Kard lbl="🇩🇰 DK Occ. at 64 🔒" val={fmtM(dko_p)}  sub="Locked ~9 yrs post-retirement"   color={C.red} />
          </div>

          <Hr />
          <SecHead title="Monthly Income at Age 55" />
          <div style={gr(4,9)}>
            <Kard lbl="You — ITP"          val={fmtM(itp_mo)} sub={`${R.yrs} yr drawdown`} color={C.grn} />
            <Kard lbl="You — ISK"          val={fmtM(isk_mo)} sub={`${R.yrs} yr drawdown`} color={C.grn} />
            <Kard lbl="You — Funds+Stocks" val={fmtM(yInvMo)} sub="after-tax drawdown"     color={C.amb} />
            <Kard lbl="You — Total at 55"  val={fmtM(y55)}    color={yGap>=0?C.grn:C.red} />
          </div>
          {Y.setup_myr>0&&<div style={{background:"rgba(224,112,112,0.06)",border:"1px solid rgba(224,112,112,0.2)",borderRadius:9,padding:"9px 14px",marginTop:6,fontSize:12,color:C.red,display:"flex",justifyContent:"space-between"}}><span>🇲🇾 Your setup costs deducted</span><strong>−{fmtM(Y.setup_myr)} (≈ −{fmtM(moFromPot(Y.setup_myr,rl,R.yrs))}/mo)</strong></div>}
          <div style={{...gr(4,9),marginTop:9}}>
            <Kard lbl="Partner — EPF"          val={fmtM(epf_mo)} sub={`${R.yrs} yr drawdown`} color={C.grn} />
            <Kard lbl="Partner — ASK"          val={fmtM(ask_mo)} sub="after-tax drawdown"     color={C.gold} />
            <Kard lbl="Partner — Funds+Stocks" val={fmtM(pInvMo)} sub="after-tax drawdown"     color={C.amb} />
            <Kard lbl="Partner — Total at 55"  val={fmtM(p55)}    color={pGap>=0?C.grn:C.red} />
          </div>
          {P.setup_myr>0&&<div style={{background:"rgba(224,112,112,0.06)",border:"1px solid rgba(224,112,112,0.2)",borderRadius:9,padding:"9px 14px",marginTop:6,fontSize:12,color:C.red,display:"flex",justifyContent:"space-between"}}><span>🇲🇾 Partner setup costs deducted</span><strong>−{fmtM(P.setup_myr)} (≈ −{fmtM(moFromPot(P.setup_myr,rl,R.yrs))}/mo)</strong></div>}

          {/* COMBINED */}
          <div style={{background:"linear-gradient(135deg,rgba(201,168,76,0.06),rgba(76,175,125,0.04))",border:"1px solid rgba(201,168,76,0.25)",borderRadius:14,padding:22,textAlign:"center",marginTop:16}}>
            <div style={{display:"flex",justifyContent:"center",gap:36,flexWrap:"wrap",marginBottom:14}}>
              <div><div style={{fontFamily:"Georgia,serif",fontSize:38,fontWeight:900,color:C.gold,lineHeight:1}}>{fmtM(comb)}</div><Mono color={C.dim}>Combined Monthly at 55</Mono></div>
              <div><div style={{fontFamily:"Georgia,serif",fontSize:38,fontWeight:900,color:C.grn,lineHeight:1}}>{fmtM(tgt2)}</div><Mono color={C.dim}>Target (RM {R.tgt.toLocaleString()} each)</Mono></div>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:100,background:gapT>=0?"rgba(76,175,125,0.15)":"rgba(224,112,112,0.15)",color:gapT>=0?C.grn:C.red,fontFamily:"monospace",fontSize:11}}>
              {gapT>=0?"✓ Surplus "+fmtD(gapT)+"/month":"✗ Shortfall "+fmtD(gapT)+"/month"}
            </div>
            <div style={{maxWidth:440,margin:"14px auto 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.dim,marginBottom:4}}><span>Progress to target</span><span>{pct}%</span></div>
              <div style={{height:6,background:C.s2,borderRadius:4,overflow:"hidden"}}>
                <div style={{width:pct+"%",height:"100%",background:"linear-gradient(90deg,#c9a84c,#4caf7d)",borderRadius:4}} />
              </div>
            </div>
          </div>

          <SecHead title="Gap Analysis" pill="per person" />
          <div style={gr(2,9)}>
            {[
              {who:"You",    gap:yGap, lines:[["ITP",itp_mo],["ISK",isk_mo],["Funds+Stocks",yInvMo]], bonus:[["Super at 60",sup_mo,C.amb],[`Allmän at ${Y.alm_age}`,alm_mo,C.acc]], lmp:lump(yGap,rl,R.yrs)},
              {who:"Partner",gap:pGap, lines:[["EPF",epf_mo],["ASK",ask_mo],["Funds+Stocks",pInvMo]], bonus:[["DK Occ ~64",dko_mo,C.amb],["ATP ~67",1000,C.red]],              lmp:lump(pGap,rl,R.yrs)},
            ].map(d=>(
              <div key={d.who} style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:12,padding:16}}>
                <Mono color={C.dim}>{d.who} vs RM {R.tgt.toLocaleString()} target</Mono>
                <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:700,color:d.gap>=0?C.grn:C.red,marginTop:4}}>{fmtD(d.gap)}/mo</div>
                <div style={{marginTop:10,fontSize:12,color:C.dim,lineHeight:1.9}}>{d.lines.map(([l,v])=><div key={l}>{l}: <span style={{color:C.txt}}>{fmtM(v)}</span></div>)}</div>
                <div style={{marginTop:7,paddingTop:7,borderTop:`1px solid ${C.brd}`,fontSize:11,lineHeight:1.8}}>
                  <Mono color={C.dim} sz={9}>Future unlocks</Mono>
                  {d.bonus.map(([l,v,col])=><div key={l} style={{color:col}}>+{fmtM(v)}/mo — {l}</div>)}
                </div>
                {d.lmp>0&&<div style={{marginTop:9,padding:"8px 11px",background:"rgba(224,112,112,0.07)",border:"1px solid rgba(224,112,112,0.2)",borderRadius:7,fontSize:12,color:C.red}}>Extra lump sum needed: <strong>{fmtM(d.lmp)}</strong></div>}
              </div>
            ))}
          </div>

          <Hr />
          <SecHead title="Income Projection" />
          <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:12,padding:16,marginBottom:10}}>
            <Mono color={C.dim}>Monthly Income MYR · Ages 55–{55+R.yrs}</Mono>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={incomeDat} margin={{top:8,right:8,left:0,bottom:0}}>
                <XAxis dataKey="age" stroke={C.brd} tick={tk} />
                <YAxis stroke={C.brd} tick={tk} tickFormatter={fmtK} width={55} />
                <Tooltip formatter={v=>fmtM(v)} contentStyle={tst} labelStyle={{color:C.gold}} />
                <Legend wrapperStyle={{fontFamily:"monospace",fontSize:10}} />
                <ReferenceLine y={R.tgt} stroke={C.red} strokeDasharray="4 4" label={{value:"Target",fill:C.red,fontSize:9}} />
                <Line type="monotone" dataKey="you"     stroke={C.grn}  strokeWidth={2} dot={false} name="You" />
                <Line type="monotone" dataKey="partner" stroke={C.gold} strokeWidth={2} dot={false} name="Partner" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:12,padding:16}}>
            <Mono color={C.dim}>Portfolio Balance Drawdown MYR · Ages 55–{55+R.yrs}</Mono>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={balDat} margin={{top:8,right:8,left:0,bottom:0}}>
                <XAxis dataKey="age" stroke={C.brd} tick={tk} />
                <YAxis stroke={C.brd} tick={tk} tickFormatter={fmtK} width={55} />
                <Tooltip formatter={v=>fmtM(v)} contentStyle={tst} labelStyle={{color:C.gold}} />
                <Legend wrapperStyle={{fontFamily:"monospace",fontSize:10}} />
                <Area type="monotone" dataKey="you"     stroke={C.grn}  fill="rgba(76,175,125,0.07)"  strokeWidth={2} dot={false} name="Your Portfolio" />
                <Area type="monotone" dataKey="partner" stroke={C.gold} fill="rgba(201,168,76,0.07)"  strokeWidth={2} dot={false} name="Partner Portfolio" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* ═══ TIMELINE ═══ */}
        {tab==="timeline" && (
          <div style={gr(2,14)}>
            <div>
              <Mono color={C.grn} sz={10}>🇸🇪 You</Mono>
              <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:12,padding:"4px 12px",marginTop:8}}>
                <TL yr={yr}                              dot={C.grn}  title="Today — Build aggressively"         desc={`${y_yrs} yrs to retirement. Max ITP sacrifice, fill ISK monthly, avoid non-ISK depot.`} />
                <TL yr={yr+Math.max(0,55-Y.age)}        dot={C.gold} title="Age 55 — Retire to Malaysia"        desc="Activate ITP drawdown. Notify Collectum 3–6 months prior. Apply SINK." />
                <TL yr={yr+Math.max(0,57-Y.age)}        dot={C.grn}  title="Age 57 — Exit Swedish Tax Residency" desc="Notify Skatteverket. Apply for SINK status for ITP and Allmän payments." />
                <TL yr={yr+Math.max(0,59-Y.age)}        dot={C.amb}  title="Age 59 — Super TTR Stream"          desc="Draw 4–10% of super p.a. before full unlock at 60." />
                <TL yr={yr+Math.max(0,60-Y.age)}        dot={C.amb}  title="Age 60 — AU Super Unlocks 🎯"       desc={`Full tax-free access. Pot: ${fmtM(sup_p)}. Adds ${fmtM(sup_mo)}/month.`} />
                <TL yr={yr+Math.max(0,Y.alm_age-Y.age)} dot={C.acc}  title={`Age ${Y.alm_age} — Allmän Pension`} desc={`Adds ${fmtM(alm_mo)}/mo. SINK 25%.`} />
              </div>
            </div>
            <div>
              <Mono color={C.gold} sz={10}>🇩🇰 Partner</Mono>
              <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:12,padding:"4px 12px",marginTop:8}}>
                <TL yr={yr}                         dot={C.grn}  title="Today — Maximise EPF & ASK"        desc={`${p_yrs} yrs to retirement. Fill ASK to DKK 166,200/yr. Preserve EPF.`} />
                <TL yr={yr+Math.max(0,50-P.age)}    dot={C.amb}  title="Age 50 — EPF Akaun 50 Access"      desc="Optional partial withdrawal. Better to compound to 55." />
                <TL yr={yr+Math.max(0,55-P.age)}    dot={C.gold} title="Age 55 — Retire · Akaun 55 🎯"     desc={`EPF full access. Draw ${fmtM(epf_mo)}/mo. ASK accessible. Malaysian citizen — no visa needed.`} />
                <TL yr={yr+Math.max(0,64-P.age)}    dot={C.amb}  title="Age ~64 — DK Occupational Pension"  desc={`Adds ${fmtM(dko_mo)}/mo. Danish withholding ~25%.`} />
                <TL yr={yr+Math.max(0,67-P.age)}    dot={C.red}  title="Age ~67 — Danish ATP"               desc="Hard-locked until state pension age. Late-life bonus only." />
              </div>
            </div>
          </div>
        )}

        {/* ═══ STRATEGY ═══ */}
        {tab==="strategy" && (
          <div style={gr(2,12)}>
            <div>
              <Mono color={C.grn} sz={10}>🇸🇪 For You</Mono>
              <div style={{marginTop:8}}>
                <ABox type="warn"><strong>Bridge the super gap (55–60).</strong> ITP + ISK must fund RM {R.tgt.toLocaleString()}/mo for 5 years. Target pot ≥ {fmtM(R.tgt*12*5)} before retiring.</ABox>
                <ABox type="ok"><strong>ISK over regular depot — always.</strong> 0.888%/yr vs 30% CGT at exit. First SEK 150k completely free.</ABox>
                <ABox type="ok"><strong>Add ITP salary sacrifice now.</strong> Pre-tax, accessible at 55, compounds in pension wrapper. Even SEK 1,000–2,000/month extra matters over {y_yrs} years.</ABox>
                <ABox type="warn"><strong>Time your non-ISK sales.</strong> Sell before Swedish tax residency ends, or convert depot to ISK while still resident.</ABox>
                <ABox type="ok"><strong>Swedish SINK (25%).</strong> ITP and Allmän payments abroad taxed at flat 25%. Apply to Skatteverket before moving.</ABox>
              </div>
            </div>
            <div>
              <Mono color={C.gold} sz={10}>🇩🇰 For Partner</Mono>
              <div style={{marginTop:8}}>
                <ABox type="warn"><strong>Bridge the DK pension gap (55–64).</strong> EPF + ASK must cover everything for 9 years. Target EPF ≥ RM 650,000. Max ASK to DKK 166,200/yr.</ABox>
                <ABox type="ok"><strong>ASK is Denmark's ISK equivalent.</strong> 17% annual tax vs 27–42% on regular accounts. Max it every year.</ABox>
                <ABox type="ok"><strong>DK salary sacrifice.</strong> ~40% income tax relief today. Powerful over {p_yrs} years of compounding.</ABox>
                <ABox type="bad"><strong>Never rely on ATP for age-55.</strong> Locked until ~67. Treat as a late-life bonus only.</ABox>
              </div>
              <Mono color={C.dim} sz={10} style={{marginTop:16}}>Cross-Border</Mono>
              <div style={{marginTop:8}}>
                <ABox type="ok"><strong>Malaysia exempt from foreign-sourced income.</strong> Pension and investment income from SE, DK, AU generally not subject to Malaysian tax.</ABox>
                <ABox type="ok"><strong>AU super at 60 is fully tax-free.</strong> No Malaysian tax. A {fmtM(sup_p)} pot unlocking 5 years in.</ABox>
                <ABox type="warn"><strong>Get a cross-border tax specialist.</strong> One consultation (RM 3–8k) on SE-MY, DK-MY, AU-MY treaties can save many times its cost.</ABox>
              </div>
            </div>
          </div>
        )}

        {/* ═══ REFERENCES ═══ */}
        {tab==="refs" && (
          <div>
            <SecHead title="Sources & References" top={0} pill="verify annually" />
            <div style={{fontSize:12,color:C.dim,marginBottom:20,lineHeight:1.7,maxWidth:720}}>
              All tax rates, pension rules and access ages used in this planner are sourced from the official authorities listed below. Check each source at least once a year, particularly around January.
            </div>
            {[
              { section:"🇸🇪 Sweden", items:[
                {label:"ISK Schablonintäkt Rate (0.888% for 2025)",body:"Set annually based on statslåneränta + 1%. Check each November for the following year's rate.",url:"https://www.skatteverket.se/privat/sparandeinvesteringar/investeringssparkonto.4.5fc8c94513259a4ba1d800040743.html",source:"Skatteverket"},
                {label:"Capital Gains Tax — Funds & Stocks (30%)",body:"Kapitalvinst on sale of securities outside ISK taxed at 30% on nominal gain.",url:"https://www.skatteverket.se/privat/sparandeinvesteringar/vardepapper/aktierochfonder.4.5fc8c94513259a4ba1d800041243.html",source:"Skatteverket"},
                {label:"Property CGT (22%)",body:"Vinst vid försäljning av privatbostad taxed at 22%. Uppskov rules may apply if reinvesting.",url:"https://www.skatteverket.se/privat/fastigheterochbostad/forsaljningavbostad.4.5fc8c94513259a4ba1d800037483.html",source:"Skatteverket"},
                {label:"SINK — Special Income Tax for Non-Residents (25%)",body:"Flat 25% withholding on ITP and Allmän pension for non-residents. Apply via form SKV 4350.",url:"https://www.skatteverket.se/privat/skatter/arbeteochinkomst/sink.4.7be5268414bea064694ca59.html",source:"Skatteverket"},
                {label:"Allmän Pension — Earliest Access Age",body:"Earliest draw age raised to 63 from 2023, rising to 64 in 2026.",url:"https://www.pensionsmyndigheten.se/for-pensionarer/nar-kan-jag-ta-ut-pension/nar-kan-jag-ta-ut-allman-pension",source:"Pensionsmyndigheten"},
                {label:"ITP / ITPK — Occupational Pension Rules",body:"ITP accessed from age 55 via Collectum. ITPK can be drawn as lump sum or monthly from 55.",url:"https://www.collectum.se/",source:"Collectum"},
              ]},
              { section:"🇩🇰 Denmark", items:[
                {label:"Aktiesparekonto (ASK) — 17% Annual Tax",body:"17% flat tax annually on unrealised and realised gains. Limit DKK 166,200 for 2025.",url:"https://www.skat.dk/borger/aktiesparekonto",source:"Skat.dk"},
                {label:"Share Income Tax — Regular Depot (27%/42%)",body:"27% up to DKK 67,500; 42% above. Modelled as ~30% blended drag.",url:"https://www.skat.dk/borger/aktier-og-investeringer/aktier-og-udbytte",source:"Skat.dk"},
                {label:"Danish Occupational Pension Access Age",body:"Most pensions accessible 3–5 years before folkepensionsalder (~age 62–64). Verify with PensionsInfo.",url:"https://www.pensionsinfo.dk/",source:"PensionsInfo.dk"},
                {label:"ATP — Locked Until Folkepensionsalder (~67)",body:"Hard-locked until state pension age. Cannot be accessed early under any circumstances.",url:"https://www.atp.dk/",source:"ATP.dk"},
                {label:"Property — Primary Residence CGT Exempt",body:"Exempt under parcelhusreglen if lot ≤ 1,400m² and you have lived there.",url:"https://www.skat.dk/borger/ejendomme-og-bolig/salg-af-ejendom",source:"Skat.dk"},
              ]},
              { section:"🇲🇾 Malaysia", items:[
                {label:"EPF — Full Access at Age 55",body:"Akaun 55 fully accessible from age 55. Historical dividend ~5–6%/yr.",url:"https://www.kwsp.gov.my/en/member/withdrawal/age-55",source:"KWSP / EPF"},
                {label:"Malaysia Foreign-Sourced Income Exemption",body:"Foreign-sourced income generally exempt under s.127 Income Tax Act 1967. Verify with LHDN.",url:"https://www.hasil.gov.my/",source:"LHDN / IRB Malaysia"},
                {label:"Residential Status & Tax Residency Rules",body:"Tax resident if present ≥ 182 days in a calendar year.",url:"https://www.hasil.gov.my/en/individual/individual-life-cycle/how-do-i-determine-my-tax-residency-status/",source:"LHDN / IRB Malaysia"},
              ]},
              { section:"🇦🇺 Australia", items:[
                {label:"Superannuation Preservation Age (60)",body:"Full unrestricted access from age 60 on retirement. Taxed component tax-free for non-residents at 60+.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/when-you-can-access-your-super",source:"ATO"},
                {label:"Transition to Retirement (TTR)",body:"Draw 4–10% of super p.a. as income stream from preservation age. Earnings taxed at 15% in TTR phase.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/transition-to-retirement",source:"ATO"},
                {label:"Non-Resident Withholding on Super",body:"Lump sum withdrawals by non-residents taxed at 35% on taxable component. Tax-free component remains free.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/non-resident-members",source:"ATO"},
              ]},
              { section:"🌐 Double Tax Treaties", items:[
                {label:"Sweden–Malaysia Tax Treaty",body:"In force. Pension income sourced in Sweden paid to Malaysian residents may be taxable only in Malaysia — but SINK election changes this.",url:"https://www.skatteverket.se/omoss/internationellt/skatteavtal/skatteavtalsforteckning.4.dfe345a107ebcc9baf80005898.html",source:"Skatteverket"},
                {label:"Denmark–Malaysia Tax Treaty",body:"In force. May reduce Danish withholding below 25% on pension payments. Review Article 18 (Pensions).",url:"https://www.skat.dk/erhverv/international-handel-og-samarbejde/dobbeltbeskatningsaftaler",source:"Skat.dk"},
                {label:"Australia–Malaysia Tax Treaty",body:"In force. Super and pension income treatment varies. ATO guidance for non-residents applies.",url:"https://www.ato.gov.au/individuals-and-families/international-tax/in-detail/treaties/tax-treaties/",source:"ATO"},
              ]},
            ].map(({ section, items }) => (
              <div key={section}>
                <SecHead title={section} top={16} />
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
                  {items.map((r,i) => <RefCard key={i} {...r} />)}
                </div>
              </div>
            ))}
            <div style={{background:C.s2,border:`1px solid ${C.brd}`,borderRadius:12,padding:16,fontSize:12,color:C.dim,lineHeight:1.7,marginTop:16}}>
              <span style={{color:C.amb,fontWeight:600}}>⚠ Disclaimer</span> — This planner is for personal planning only and does not constitute financial, legal or tax advice. Always verify with official sources or a qualified adviser before making financial decisions.
            </div>
          </div>
        )}

        <div style={{marginTop:36,textAlign:"center",fontFamily:"monospace",fontSize:9,color:C.dim,letterSpacing:"0.08em",borderTop:`1px solid ${C.brd}`,paddingTop:14}}>
          FitFIRE · Illustrative only · Not financial advice · Tax rules accurate as of 2025<br/>
          SE ISK: 0.888%/yr · SE non-ISK: 30% CGT · DK ASK: 17% · DK depot: ~30% drag · AU super: tax-free at 60+
        </div>
      </div>
    </div>
  );
}
