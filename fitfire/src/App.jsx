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

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
// Palette: deep obsidian bg, teal accent, copper highlight, ivory text
const C = {
  bg:    "#080c0b",   // near-black with green undertone
  s1:    "#0e1412",   // card background
  s2:    "#141c19",   // elevated surface
  s3:    "#1a2421",   // input surface
  brd:   "#1f2e29",   // border
  brd2:  "#2a3d37",   // brighter border for hover

  teal:  "#2dd4bf",   // primary accent — vivid teal
  teal2: "#14b8a6",   // teal darker
  tealD: "rgba(45,212,191,0.08)", // teal tint bg

  copper:"#d97706",   // copper/amber
  copperL:"#f59e0b",  // copper light
  copperD:"rgba(217,119,6,0.1)",

  ivory: "#f0ebe0",   // warm ivory — main text
  ivoryD:"#9ba89f",   // muted ivory — secondary text
  dim:   "#4a5e57",   // very muted

  grn:   "#4ade80",   // success green
  red:   "#f87171",   // error red
  warn:  "#fb923c",   // warning orange
};

const F = {
  serif: "'Playfair Display', 'Didot', 'Georgia', serif",
  sans:  "'DM Sans', 'Helvetica Neue', sans-serif",
  mono:  "'DM Mono', 'Fira Code', 'Courier New', monospace",
};

const gr = (n,g=12) => ({ display:"grid", gridTemplateColumns:`repeat(${n},1fr)`, gap:g });

// ─── GOOGLE FONTS INJECTION ───────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("ff-fonts")) {
  const l = document.createElement("link");
  l.id = "ff-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;900&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(l);
}

// ─── BASE COMPONENTS ──────────────────────────────────────────────────────────

const Label = ({ children, color, sz=9, style }) => (
  <div style={{ fontFamily:F.mono, fontSize:sz, letterSpacing:"0.15em", textTransform:"uppercase", color:color||C.ivoryD, ...(style||{}) }}>{children}</div>
);

const Box = ({ children, style, accent }) => (
  <div style={{
    background:C.s1,
    border:`1px solid ${accent ? C.brd2 : C.brd}`,
    borderLeft: accent ? `2px solid ${accent}` : `1px solid ${C.brd}`,
    borderRadius:2,
    padding:"12px 14px",
    transition:"border-color 0.15s",
    ...style
  }}>{children}</div>
);

const numStyle = { background:"transparent", border:"none", outline:"none", color:C.ivory, fontSize:17, fontFamily:F.serif, width:"100%", marginTop:4, letterSpacing:"0.01em" };
const numStyleFlex = { ...numStyle, flex:1, minWidth:0 };

const Field = ({ lbl, value, onChange, unit, note }) => (
  <Box>
    <Label>{lbl}</Label>
    <input key={value} type="text" inputMode="decimal" defaultValue={value}
      onBlur={e => { const n = parseFloat(e.target.value); onChange(isNaN(n) ? 0 : n); }}
      style={numStyle} />
    {unit && <Label sz={8} style={{marginTop:3,color:C.dim}}>{unit}</Label>}
    {note && <Label sz={8} style={{marginTop:3,color:C.copper}}>{note}</Label>}
  </Box>
);

const CurField = ({ lbl, value, cur, onVal, onCur, note }) => (
  <Box>
    <Label>{lbl}</Label>
    <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4 }}>
      <input key={value} type="text" inputMode="decimal" defaultValue={value}
        onBlur={e => { const n = parseFloat(e.target.value); onVal(isNaN(n) ? 0 : n); }}
        style={numStyleFlex} />
      <select value={cur} onChange={e => onCur(e.target.value)} style={{
        background:C.s3, border:`1px solid ${C.brd2}`, borderRadius:2,
        color:C.teal, fontFamily:F.mono, fontSize:10, padding:"4px 8px",
        cursor:"pointer", outline:"none", letterSpacing:"0.1em"
      }}>
        {["SEK","DKK","MYR","AUD","EUR","USD","GBP"].map(c=><option key={c}>{c}</option>)}
      </select>
    </div>
    {note && <Label sz={8} style={{marginTop:3,color:C.copper}}>{note}</Label>}
  </Box>
);

// Metric card — the key display element
const Kard = ({ lbl, val, sub, color }) => (
  <div style={{
    background:C.s1, border:`1px solid ${C.brd}`, borderRadius:2,
    padding:"16px 18px", position:"relative", overflow:"hidden",
  }}>
    <div style={{
      position:"absolute", top:0, left:0, right:0, height:2,
      background: color || C.teal, opacity:0.6,
    }}/>
    <Label sz={8}>{lbl}</Label>
    <div style={{ fontFamily:F.serif, fontSize:22, fontWeight:700, color:color||C.ivory, marginTop:8, lineHeight:1 }}>{val}</div>
    {sub && <div style={{ fontFamily:F.mono, fontSize:9, color:C.dim, marginTop:6, letterSpacing:"0.08em" }}>{sub}</div>}
  </div>
);

const Tag = ({ label, color }) => (
  <span style={{
    display:"inline-flex", padding:"3px 8px",
    background:`${color||C.teal}12`,
    border:`1px solid ${color||C.teal}30`,
    borderRadius:1, fontSize:9, color:color||C.teal,
    fontFamily:F.mono, marginRight:5, marginBottom:5,
    letterSpacing:"0.1em", textTransform:"uppercase",
  }}>{label}</span>
);

const ABox = ({ type, children }) => {
  const m = {
    ok:   { b:`${C.grn}08`,   br:`${C.grn}25`,   c:C.grn,  i:"↗" },
    warn: { b:`${C.warn}08`,  br:`${C.warn}25`,   c:C.warn, i:"△" },
    bad:  { b:`${C.red}08`,   br:`${C.red}25`,    c:C.red,  i:"✕" },
  }[type];
  return (
    <div style={{ background:m.b, borderLeft:`2px solid ${m.c}`, color:m.c, borderRadius:1, padding:"10px 14px", fontSize:12, lineHeight:1.6, display:"flex", gap:10, marginBottom:8, fontFamily:F.sans }}>
      <span style={{fontFamily:F.mono,flexShrink:0,marginTop:1}}>{m.i}</span>
      <div style={{color:C.ivoryD}}>{children}</div>
    </div>
  );
};

const TL = ({ yr, dot, title, desc }) => (
  <div style={{ display:"flex", gap:14, padding:"12px 0", borderBottom:`1px solid ${C.brd}` }}>
    <span style={{ fontFamily:F.mono, fontSize:11, color:C.copper, minWidth:42, flexShrink:0, paddingTop:2 }}>{yr}</span>
    <div style={{ width:6, height:6, borderRadius:"50%", background:dot, flexShrink:0, marginTop:5, boxShadow:`0 0 8px ${dot}` }} />
    <div>
      <div style={{ fontSize:13, fontWeight:500, color:C.ivory, fontFamily:F.sans, lineHeight:1.3 }}>{title}</div>
      <div style={{ fontSize:11, color:C.ivoryD, marginTop:3, lineHeight:1.5, fontFamily:F.sans }}>{desc}</div>
    </div>
  </div>
);

const Hr = () => <div style={{ borderTop:`1px solid ${C.brd}`, margin:"28px 0" }} />;

const SecHead = ({ title, pill, top=36 }) => (
  <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:14, marginTop:top }}>
    <h2 style={{ fontFamily:F.serif, fontSize:18, fontWeight:700, color:C.ivory, margin:0, letterSpacing:"-0.01em" }}>{title}</h2>
    {pill && <span style={{ fontFamily:F.mono, fontSize:8, padding:"2px 8px", borderRadius:1, border:`1px solid ${C.brd2}`, color:C.dim, letterSpacing:"0.12em", textTransform:"uppercase" }}>{pill}</span>}
  </div>
);

const FundRow = ({ f, idx, dot, onField, preview }) => (
  <div style={{ marginBottom:6, background:C.s1, border:`1px solid ${C.brd}`, borderLeft:`2px solid ${dot}`, borderRadius:2, padding:"12px 14px" }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
      <span style={{ fontFamily:F.mono, fontSize:9, color:dot, letterSpacing:"0.1em" }}>FUND {idx+1}</span>
      <input value={f.name} onChange={e=>onField("name",e.target.value)} placeholder={`Fund name`}
        style={{ background:"transparent", border:"none", borderBottom:`1px solid ${C.brd}`, outline:"none", color:C.ivory, fontSize:13, flex:1, paddingBottom:3, fontFamily:F.sans }} />
    </div>
    <div style={gr(3,8)}>
      <div>
        <Label sz={8}>Value</Label>
        <div style={{ display:"flex",gap:6,alignItems:"center",marginTop:4 }}>
          <input key={f.value} type="text" inputMode="decimal" defaultValue={f.value}
            onBlur={e=>{ const n=parseFloat(e.target.value); onField("value",isNaN(n)?0:n); }}
            style={{ background:"transparent",border:"none",outline:"none",color:C.ivory,fontSize:15,flex:1,minWidth:0,fontFamily:F.serif }} />
          <select value={f.currency} onChange={e=>onField("currency",e.target.value)}
            style={{ background:C.s3,border:`1px solid ${C.brd2}`,borderRadius:1,color:C.teal,fontFamily:F.mono,fontSize:9,padding:"3px 6px",cursor:"pointer",outline:"none",letterSpacing:"0.1em" }}>
            {["SEK","DKK","MYR","AUD","EUR","USD","GBP"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label sz={8}>Cost Basis</Label>
        <input key={f.cost_basis} type="text" inputMode="decimal" defaultValue={f.cost_basis}
          onBlur={e=>{ const n=parseFloat(e.target.value); onField("cost_basis",isNaN(n)?0:n); }}
          style={{ background:"transparent",border:"none",outline:"none",color:C.ivory,fontSize:15,width:"100%",marginTop:4,fontFamily:F.serif }} />
        <Label sz={8} style={{marginTop:3,color:C.dim}}>{f.currency} — purchase price</Label>
      </div>
      <div style={{ display:"flex",alignItems:"flex-end" }}>
        {f.value>0
          ? <div><Label sz={8}>After-tax projection</Label><div style={{ fontFamily:F.serif,fontSize:16,color:C.copper,marginTop:4,fontWeight:600 }}>{preview}</div></div>
          : <div style={{ fontFamily:F.mono,fontSize:9,color:C.dim,letterSpacing:"0.1em" }}>ENTER VALUE</div>}
      </div>
    </div>
  </div>
);

const RefCard = ({ label, body, url, source }) => (
  <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:2,padding:"14px 16px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}>
      <div style={{fontSize:13,fontWeight:600,color:C.ivory,lineHeight:1.4,fontFamily:F.sans}}>{label}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{
        fontFamily:F.mono,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",
        color:C.teal,textDecoration:"none",border:`1px solid ${C.teal}30`,
        borderRadius:1,padding:"3px 8px",flexShrink:0,whiteSpace:"nowrap"
      }}>{source} ↗</a>
    </div>
    <div style={{fontSize:12,color:C.ivoryD,lineHeight:1.7,fontFamily:F.sans}}>{body}</div>
  </div>
);

const Toggle = ({ label, value, onChange, note }) => (
  <div style={{
    display:"flex", alignItems:"center", justifyContent:"space-between",
    background: value ? C.tealD : C.s1,
    border:`1px solid ${value ? C.teal+"40" : C.brd}`,
    borderRadius:2, padding:"10px 14px", marginBottom:6,
    transition:"all 0.2s", cursor:"pointer",
  }} onClick={()=>onChange(!value)}>
    <div>
      <div style={{fontSize:12,color:value?C.ivory:C.ivoryD,fontWeight:value?500:400,fontFamily:F.sans}}>{label}</div>
      {note && <div style={{fontSize:9,color:value?C.teal:C.dim,marginTop:2,fontFamily:F.mono,letterSpacing:"0.08em",textTransform:"uppercase"}}>{note}</div>}
    </div>
    <div style={{
      width:40, height:22, borderRadius:11, flexShrink:0,
      background:value?C.teal:"transparent",
      border:`1px solid ${value?C.teal:C.brd2}`,
      position:"relative", transition:"all 0.25s",
    }}>
      <div style={{
        position:"absolute", top:3, left:value?19:3,
        width:14, height:14, borderRadius:"50%",
        background:value?C.bg:C.dim,
        transition:"all 0.25s",
        boxShadow: value?`0 0 6px ${C.teal}80`:"none",
      }}/>
    </div>
  </div>
);

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  Y: {
    age:44, retire:55, salary:55000,
    alm_bal:80000, alm_age:63,       alm_active:true,
    itp_bal:250000, itp_sac:0,       itp_active:true,  itp_contrib:true,
    sup_aud:80000,                    sup_active:true,
    isk_bal:150000, isk_mo:3000,     isk_active:true,  isk_contrib:true,
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
    epf:120000,                       epf_active:true,  epf_contrib:false,
    dko_bal:180000, dko_sac:0,       dko_active:true,  dko_contrib:true,
    ask_bal:80000, ask_mo:2000,      ask_active:true,  ask_contrib:true,
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

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return (
    <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:F.mono, fontSize:10, color:C.dim, letterSpacing:"0.2em" }}>INITIALISING</div>
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

  // Collapsible section — defined inside Planner to access open/tog
  const Sec = ({ id, title, accent, children }) => (
    <div style={{ marginBottom:6, border:`1px solid ${open[id]?C.brd2:C.brd}`, borderRadius:2, overflow:"hidden", transition:"border-color 0.2s" }}>
      <div onClick={()=>tog(id)} style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"11px 16px", background:open[id]?C.s2:C.s1, cursor:"pointer",
        borderLeft:`2px solid ${accent||C.teal}`,
      }}>
        <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:accent||C.teal }}>{title}</span>
        <span style={{ color:C.dim, fontSize:10, fontFamily:F.mono }}>{open[id]?"▲":"▼"}</span>
      </div>
      {open[id] && <div style={{ padding:"14px 16px", background:C.s1 }}>{children}</div>}
    </div>
  );

  const [Y,  setY]  = useState(DEFAULTS.Y);
  const [P,  setP]  = useState(DEFAULTS.P);
  const [SH, setSH] = useState(DEFAULTS.SH);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSaved, setLastSaved]   = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("planner_data").select("*").eq("user_email","shared").single();
      if (data?.data) {
        const s = data.data;
        if (s.Y)  setY(p => ({...DEFAULTS.Y,  ...s.Y,  funds: s.Y.funds?.length  ? s.Y.funds  : DEFAULTS.Y.funds}));
        if (s.P)  setP(p => ({...DEFAULTS.P,  ...s.P,  funds: s.P.funds?.length  ? s.P.funds  : DEFAULTS.P.funds}));
        if (s.SH) setSH(p => ({...DEFAULTS.SH,...s.SH}));
        if (s.lastSaved) setLastSaved(s.lastSaved);
        setSaveStatus("loaded"); setTimeout(()=>setSaveStatus("idle"),2000);
      }
    })();
  }, []);

  const saveAll = async (yVal, pVal, shVal) => {
    setSaveStatus("saving");
    const ts = new Date().toISOString();
    const payload = { Y:yVal, P:pVal, SH:shVal, lastSaved:ts };
    const { data:existing } = await supabase.from("planner_data").select("id").eq("user_email","shared").single();
    let error;
    if (existing) {
      ({error} = await supabase.from("planner_data").update({data:payload,updated_at:ts}).eq("user_email","shared"));
    } else {
      ({error} = await supabase.from("planner_data").insert({user_email:"shared",data:payload}));
    }
    if (error) { setSaveStatus("error"); } else { setLastSaved(ts); setSaveStatus("saved"); }
    setTimeout(()=>setSaveStatus("idle"),2500);
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

  const itp_p  = Y.itp_active ? (fv(Y.itp_bal,ret,y_yrs) + (Y.itp_contrib  ? fvAnn((Y.salary*0.10+Y.itp_sac)*12,ret,y_yrs) : 0)) * R.sek : 0;
  const alm_p  = Y.alm_active ? fv(Y.alm_bal,0.025,Y.alm_age-Y.age) * R.sek : 0;
  const sup_p  = Y.sup_active ? fv(Y.sup_aud,ret,60-Y.age) * R.aud : 0;
  const isk_p  = Y.isk_active ? fvISK(Y.isk_bal, Y.isk_contrib ? Y.isk_mo*12 : 0, ret,y_yrs) * R.sek : 0;
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

  const epf_p  = P.epf_active ? (fv(P.epf,ret,p_yrs) + (P.epf_contrib ? fvAnn((P.salary*R.dkk)*0.23*12,ret,p_yrs) : 0)) : 0;
  const dko_p  = P.dko_active ? (fv(P.dko_bal,ret,64-P.age) + (P.dko_contrib ? fvAnn(P.dko_sac*12,ret,64-P.age) : 0))*R.dkk : 0;
  const ask_p  = P.ask_active ? fvASK(P.ask_bal, P.ask_contrib ? P.ask_mo*12 : 0, ret,p_yrs)*R.dkk : 0;
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

  // Chart styles
  const chartTooltip = {
    background:C.s2, border:`1px solid ${C.brd2}`,
    borderRadius:2, fontFamily:F.mono, fontSize:10, color:C.ivory,
  };
  const chartTick = { fill:C.dim, fontSize:9, fontFamily:F.mono };
  const DYOU=[C.teal, C.copper, C.grn];
  const DPAR=[C.copper, C.teal, C.grn];

  // Save button state
  const sCol = saveStatus==="saved"||saveStatus==="loaded" ? C.grn : saveStatus==="error" ? C.red : C.ivoryD;
  const sLbl = saveStatus==="saving"?"SAVING…":saveStatus==="saved"?"✓ SAVED":saveStatus==="loaded"?"✓ LOADED":saveStatus==="error"?"✕ ERROR":"SAVE";

  const TABS = [["inputs","Inputs"],["forecast","Forecast"],["timeline","Timeline"],["strategy","Strategy"],["refs","References"]];

  return (
    <div style={{background:C.bg, minHeight:"100vh", color:C.ivory, fontFamily:F.sans, fontSize:13}}>

      {/* ── HEADER ── */}
      <div style={{
        borderBottom:`1px solid ${C.brd}`,
        background:`linear-gradient(180deg, #0a100e 0%, ${C.bg} 100%)`,
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{maxWidth:1160,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {/* Wordmark */}
          <div style={{display:"flex",alignItems:"baseline",gap:16}}>
            <div>
              <span style={{fontFamily:F.serif,fontSize:22,fontWeight:700,color:C.ivory,letterSpacing:"-0.02em"}}>Fit</span>
              <span style={{fontFamily:F.serif,fontSize:22,fontWeight:700,color:C.teal,letterSpacing:"-0.02em"}}>FIRE</span>
            </div>
            <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.15em",textTransform:"uppercase",paddingBottom:2}}>
              Retirement Intelligence
            </div>
          </div>

          {/* Right side */}
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {lastSaved && (
              <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.1em",textAlign:"right",lineHeight:1.6}}>
                <div style={{color:C.dim,textTransform:"uppercase"}}>Last saved</div>
                <div style={{color:C.ivoryD}}>{new Date(lastSaved).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} · {new Date(lastSaved).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            )}
            <button onClick={()=>saveAll(Y,P,SH)} style={{
              padding:"8px 20px", borderRadius:1, cursor:"pointer",
              border:`1px solid ${sCol}40`,
              background:`${sCol}10`,
              color:sCol, fontFamily:F.mono, fontSize:9,
              letterSpacing:"0.15em", textTransform:"uppercase",
              transition:"all 0.2s",
            }}>{sLbl}</button>
            <div style={{width:1,height:28,background:C.brd}}/>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:F.mono,fontSize:9,color:C.ivoryD,letterSpacing:"0.05em"}}>{user.email}</div>
              <button onClick={onSignOut} style={{background:"none",border:"none",color:C.dim,fontSize:9,fontFamily:F.mono,cursor:"pointer",padding:0,marginTop:2,letterSpacing:"0.08em",textDecoration:"underline",textDecorationColor:C.brd}}>sign out</button>
            </div>
          </div>
        </div>

        {/* Hero band */}
        <div style={{borderTop:`1px solid ${C.brd}`,borderBottom:`1px solid ${C.brd}`,background:`linear-gradient(90deg, ${C.teal}06 0%, transparent 60%)`}}>
          <div style={{maxWidth:1160,margin:"0 auto",padding:"10px 24px",display:"flex",alignItems:"baseline",gap:24,flexWrap:"wrap"}}>
            <h1 style={{fontFamily:F.serif,fontSize:15,fontWeight:700,color:C.ivory,margin:0,letterSpacing:"-0.01em"}}>
              Retire at <span style={{color:C.teal}}>55</span> · Kuala Lumpur
            </h1>
            <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.12em",textTransform:"uppercase"}}>
              SE · DK · AU · MY
            </div>
            <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.12em",textTransform:"uppercase",marginLeft:"auto"}}>
              {pct}% of target · Combined {fmtM(comb)}/mo
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{maxWidth:1160,margin:"0 auto",padding:"0 24px",display:"flex",gap:0}}>
          {TABS.map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{
              padding:"12px 20px", border:"none", background:"transparent",
              color: tab===id ? C.teal : C.dim,
              fontFamily:F.mono, fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase",
              cursor:"pointer", borderBottom: tab===id?`2px solid ${C.teal}`:"2px solid transparent",
              transition:"all 0.15s", marginBottom:-1,
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:1160,margin:"0 auto",padding:"28px 24px 100px"}}>

        {/* ═══ INPUTS ═══ */}
        {tab==="inputs" && <>
          {/* Section header */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:28}}>
            <div style={{borderLeft:`2px solid ${C.teal}`,paddingLeft:16}}>
              <Label sz={8} style={{color:C.teal,marginBottom:6}}>Sweden — You</Label>
              <div style={{fontFamily:F.serif,fontSize:13,color:C.ivoryD}}>{Y.retire-Y.age} years to retirement · ITP + ISK + Allmän + Super</div>
            </div>
            <div style={{borderLeft:`2px solid ${C.copper}`,paddingLeft:16}}>
              <Label sz={8} style={{color:C.copper,marginBottom:6}}>Denmark / Malaysia — Partner</Label>
              <div style={{fontFamily:F.serif,fontSize:13,color:C.ivoryD}}>{P.retire-P.age} years to retirement · EPF + ASK + DK Occupational</div>
            </div>
          </div>

          <div style={gr(2,20)}>
            {/* YOU */}
            <div>
              <Sec id="y_salary" title="Personal & Salary" accent={C.teal}>
                <div style={gr(2,9)}>
                  <Field lbl="Age" value={Y.age} onChange={v=>sy("age",v)} unit="years" />
                  <Field lbl="Target Retirement Age" value={Y.retire} onChange={v=>sy("retire",v)} unit="years" />
                  <Field lbl="Monthly Salary" value={Y.salary} onChange={v=>sy("salary",v)} unit="SEK gross" />
                  <Field lbl="ITP Salary Sacrifice" value={Y.itp_sac} onChange={v=>sy("itp_sac",v)} unit="SEK/mo pre-tax" />
                </div>
              </Sec>
              <Sec id="y_pensions" title="Allmän + ITP" accent={C.teal}>
                <div style={{marginBottom:10}}>
                  <Tag label="Allmän from 63" color={C.warn} />
                  <Tag label="ITP from 55" color={C.teal} />
                  <Tag label="SINK 25% abroad" color={C.ivoryD} />
                </div>
                <Toggle label="Include Allmän Pension" value={Y.alm_active} onChange={v=>sy("alm_active",v)} note={Y.alm_active?"Included in forecast":"Excluded from forecast"} />
                <Toggle label="Include ITP / ITPK" value={Y.itp_active} onChange={v=>sy("itp_active",v)} note={Y.itp_active?"Included in forecast":"Excluded from forecast"} />
                {Y.itp_active && <Toggle label="Ongoing employer contributions" value={Y.itp_contrib} onChange={v=>sy("itp_contrib",v)} note={Y.itp_contrib?"10% salary + sacrifice modelled":"Balance growth only"} />}
                <div style={{...gr(3,9),marginTop:10}}>
                  <Field lbl="Allmän Balance" value={Y.alm_bal} onChange={v=>sy("alm_bal",v)} unit="SEK · Pensionsmyndigheten" note="~2.5%/yr growth" />
                  <Field lbl="Draw From Age" value={Y.alm_age} onChange={v=>sy("alm_age",v)} unit="min 63 currently" />
                  <Field lbl="ITP/ITPK Balance" value={Y.itp_bal} onChange={v=>sy("itp_bal",v)} unit="SEK · Collectum" />
                </div>
              </Sec>
              <Sec id="y_super" title="Australian Super" accent={C.warn}>
                <div style={{marginBottom:10}}>
                  <Tag label="Locked until 60" color={C.red} />
                  <Tag label="Tax-free at 60+" color={C.grn} />
                </div>
                <Toggle label="Include Australian Super" value={Y.sup_active} onChange={v=>sy("sup_active",v)} note={Y.sup_active?"Unlocks at age 60":"Excluded from forecast"} />
                <div style={{...gr(1,9),marginTop:10}}>
                  <Field lbl="Super Balance" value={Y.sup_aud} onChange={v=>sy("sup_aud",v)} unit="AUD · no new contributions assumed" />
                </div>
              </Sec>
              <Sec id="y_isk" title="Swedish ISK" accent={C.teal}>
                <div style={{marginBottom:10}}>
                  <Tag label="0.888%/yr drag" color={C.teal} />
                  <Tag label="Zero exit CGT" color={C.grn} />
                </div>
                <Toggle label="Include ISK" value={Y.isk_active} onChange={v=>sy("isk_active",v)} note={Y.isk_active?"Included in forecast":"Excluded"} />
                {Y.isk_active && <Toggle label="Monthly top-ups" value={Y.isk_contrib} onChange={v=>sy("isk_contrib",v)} note={Y.isk_contrib?"Contributions modelled":"Balance growth only"} />}
                <div style={{...gr(2,9),marginTop:10}}>
                  <Field lbl="ISK Balance" value={Y.isk_bal} onChange={v=>sy("isk_bal",v)} unit="SEK" />
                  {Y.isk_active && Y.isk_contrib && <Field lbl="Monthly Top-up" value={Y.isk_mo} onChange={v=>sy("isk_mo",v)} unit="SEK/month" />}
                </div>
              </Sec>
              <Sec id="y_funds" title="Funds — Non-ISK Depot" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="30% CGT at exit" color={C.red} /></div>
                {Y.funds.map((f,i)=><FundRow key={i} f={f} idx={i} dot={DYOU[i]} onField={(fld,v)=>syf(i,fld,v)} preview={f.value>0?fmtM(toMYR(fvSE(f.value,ret,y_yrs,f.cost_basis||f.value),f.currency,R)):""} />)}
              </Sec>
              <Sec id="y_stocks" title="Stocks — Non-ISK" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="30% CGT at exit" color={C.red} /></div>
                <div style={gr(2,9)}>
                  <CurField lbl="Stocks Value" value={Y.stk_val} cur={Y.stk_cur} onVal={v=>sy("stk_val",v)} onCur={v=>sy("stk_cur",v)} />
                  <Field lbl="Cost Basis" value={Y.stk_bas} onChange={v=>sy("stk_bas",v)} unit={Y.stk_cur} />
                </div>
              </Sec>
              <Sec id="y_prop" title="Property" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="22% CGT" color={C.warn} /><Tag label="3%/yr growth" color={C.dim} /></div>
                <div style={gr(2,9)}>
                  <CurField lbl="Property Value" value={Y.prop_val} cur={Y.prop_cur} onVal={v=>sy("prop_val",v)} onCur={v=>sy("prop_cur",v)} />
                  <CurField lbl="Cost Basis" value={Y.prop_bas} cur={Y.prop_cur} onVal={v=>sy("prop_bas",v)} onCur={v=>sy("prop_cur",v)} />
                </div>
              </Sec>
            </div>

            {/* PARTNER */}
            <div>
              <Sec id="p_salary" title="Personal & Salary" accent={C.copper}>
                <div style={gr(2,9)}>
                  <Field lbl="Age" value={P.age} onChange={v=>sp("age",v)} unit="years" />
                  <Field lbl="Target Retirement Age" value={P.retire} onChange={v=>sp("retire",v)} unit="years" />
                  <Field lbl="Monthly Salary" value={P.salary} onChange={v=>sp("salary",v)} unit="DKK gross" />
                  <Field lbl="DK Pension Sacrifice" value={P.dko_sac} onChange={v=>sp("dko_sac",v)} unit="DKK/mo pre-tax" note="~40% tax relief" />
                </div>
              </Sec>
              <Sec id="p_pensions" title="EPF + DK Occupational" accent={C.copper}>
                <div style={{marginBottom:10}}>
                  <Tag label="EPF at 55" color={C.grn} />
                  <Tag label="DK Occ ~64" color={C.warn} />
                  <Tag label="ATP locked ~67" color={C.red} />
                </div>
                <Toggle label="Include EPF" value={P.epf_active} onChange={v=>sp("epf_active",v)} note={P.epf_active?"Included in forecast":"Excluded"} />
                {P.epf_active && <Toggle label="Ongoing EPF contributions" value={P.epf_contrib} onChange={v=>sp("epf_contrib",v)} note={P.epf_contrib?"23% salary modelled":"Balance growth only"} />}
                <Toggle label="Include DK Occupational Pension" value={P.dko_active} onChange={v=>sp("dko_active",v)} note={P.dko_active?"Unlocks ~age 64":"Excluded"} />
                {P.dko_active && <Toggle label="Ongoing DK contributions" value={P.dko_contrib} onChange={v=>sp("dko_contrib",v)} note={P.dko_contrib?"Sacrifice contributions modelled":"Balance growth only"} />}
                <div style={{...gr(2,9),marginTop:10}}>
                  <Field lbl="EPF Balance" value={P.epf} onChange={v=>sp("epf",v)} unit="MYR · accessible at 55" note={P.epf_contrib?"+23% salary modelled":"Growth only"} />
                  <Field lbl="DK Occupational Balance" value={P.dko_bal} onChange={v=>sp("dko_bal",v)} unit="DKK · PensionsInfo.dk" />
                </div>
              </Sec>
              <Sec id="p_ask" title="Danish Aktiesparekonto (ASK)" accent={C.copper}>
                <div style={{marginBottom:10}}>
                  <Tag label="17% annual tax" color={C.warn} />
                  <Tag label="DKK 166,200 limit" color={C.dim} />
                </div>
                <Toggle label="Include ASK" value={P.ask_active} onChange={v=>sp("ask_active",v)} note={P.ask_active?"Included in forecast":"Excluded"} />
                {P.ask_active && <Toggle label="Monthly top-ups" value={P.ask_contrib} onChange={v=>sp("ask_contrib",v)} note={P.ask_contrib?"Contributions modelled":"Balance growth only"} />}
                <div style={{...gr(2,9),marginTop:10}}>
                  <Field lbl="ASK Balance" value={P.ask_bal} onChange={v=>sp("ask_bal",v)} unit="DKK" />
                  {P.ask_active && P.ask_contrib && <Field lbl="Monthly Top-up" value={P.ask_mo} onChange={v=>sp("ask_mo",v)} unit="DKK/month" />}
                </div>
              </Sec>
              <Sec id="p_funds" title="Funds — Regular Depot" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="~30% annual drag" color={C.red} /></div>
                {P.funds.map((f,i)=><FundRow key={i} f={f} idx={i} dot={DPAR[i]} onField={(fld,v)=>spf(i,fld,v)} preview={f.value>0?fmtM(toMYR(fvDK(f.value,ret,p_yrs),f.currency,R)):""} />)}
              </Sec>
              <Sec id="p_stocks" title="Stocks — Depot" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="~30% drag" color={C.red} /></div>
                <div style={gr(2,9)}>
                  <CurField lbl="Stocks Value" value={P.stk_val} cur={P.stk_cur} onVal={v=>sp("stk_val",v)} onCur={v=>sp("stk_cur",v)} />
                  <Field lbl="Cost Basis" value={P.stk_bas} onChange={v=>sp("stk_bas",v)} unit={P.stk_cur} />
                </div>
              </Sec>
              <Sec id="p_prop" title="Property" accent={C.dim}>
                <div style={{marginBottom:8}}><Tag label="CGT Exempt" color={C.grn} /><Tag label="3%/yr growth" color={C.dim} /></div>
                <div style={gr(2,9)}>
                  <CurField lbl="Property Value" value={P.prop_val} cur={P.prop_cur} onVal={v=>sp("prop_val",v)} onCur={v=>sp("prop_cur",v)} note="Full CGT exempt (parcelhusregel)" />
                  <CurField lbl="Cost Basis" value={P.prop_bas} cur={P.prop_cur} onVal={v=>sp("prop_bas",v)} onCur={v=>sp("prop_cur",v)} />
                </div>
              </Sec>
            </div>
          </div>

          {/* Shared Assumptions */}
          <Hr />
          <SecHead title="Shared Assumptions" top={0} />
          <div style={gr(4,12)}>
            <Field lbl="Return % p.a." value={SH.ret} onChange={v=>ssh("ret",v)} unit="% nominal" />
            <Field lbl="Inflation % p.a." value={SH.inf} onChange={v=>ssh("inf",v)} unit="%" />
            <Field lbl="Target MYR/month" value={SH.tgt} onChange={v=>ssh("tgt",v)} unit="per person" />
            <Field lbl="Retirement Duration" value={SH.yrs} onChange={v=>ssh("yrs",v)} unit="years" />
          </div>
          <div style={{...gr(6,12),marginTop:12}}>
            {[["SEK","sek"],["DKK","dkk"],["AUD","aud"],["EUR","eur"],["USD","usd"],["GBP","gbp"]].map(([cur,key])=>(
              <Field key={key} lbl={`${cur} → MYR`} value={SH[key]} onChange={v=>ssh(key,v)} />
            ))}
          </div>

          <Hr />
          <SecHead title="Malaysia — Setup Costs" pill="deducted at retirement" top={0} />
          <div style={{
            background:`linear-gradient(135deg, ${C.copper}06 0%, transparent 100%)`,
            border:`1px solid ${C.copper}20`, borderRadius:2, padding:16, marginBottom:12
          }}>
            <div style={{fontSize:12,color:C.ivoryD,marginBottom:12,lineHeight:1.8,fontFamily:F.sans}}>
              One-off costs deducted from each person's pot at retirement — deposit, furniture, shipping, car, legal fees.
            </div>
            <div style={gr(2,12)}>
              <Field lbl="Your Setup Costs" value={Y.setup_myr} onChange={v=>sy("setup_myr",v)} unit="MYR" note={`≈ −${fmtM(moFromPot(Y.setup_myr,rl,R.yrs))}/mo income impact`} />
              <Field lbl="Partner Setup Costs" value={P.setup_myr} onChange={v=>sp("setup_myr",v)} unit="MYR" note={`≈ −${fmtM(moFromPot(P.setup_myr,rl,R.yrs))}/mo income impact`} />
            </div>
          </div>
        </>}

        {/* ═══ FORECAST ═══ */}
        {tab==="forecast" && <>

          {/* Combined hero */}
          <div style={{
            background:`linear-gradient(135deg, ${C.teal}08 0%, ${C.copper}06 100%)`,
            border:`1px solid ${C.brd2}`, borderRadius:2,
            padding:"28px 32px", marginBottom:24,
            display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:20,
          }}>
            <div>
              <Label sz={8} style={{color:C.dim,marginBottom:8}}>Combined Monthly Income at Age 55</Label>
              <div style={{fontFamily:F.serif,fontSize:52,fontWeight:900,color:C.ivory,lineHeight:1,letterSpacing:"-0.02em"}}>{fmtM(comb)}</div>
              <div style={{fontFamily:F.mono,fontSize:10,color:gapT>=0?C.grn:C.red,marginTop:10,letterSpacing:"0.08em"}}>
                {gapT>=0 ? `↗ Surplus ${fmtD(gapT)}/mo vs target` : `↘ Shortfall ${fmtD(gapT)}/mo vs target`}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <Label sz={8} style={{color:C.dim,marginBottom:8}}>Target Progress</Label>
              <div style={{fontFamily:F.serif,fontSize:44,fontWeight:700,color:pct>=100?C.grn:C.copper,lineHeight:1}}>{pct}%</div>
              <div style={{fontFamily:F.mono,fontSize:9,color:C.dim,marginTop:8}}>RM {R.tgt.toLocaleString()} each · {R.yrs} yr horizon</div>
              <div style={{width:200,height:4,background:C.s3,borderRadius:2,marginTop:10,overflow:"hidden",marginLeft:"auto"}}>
                <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.teal},${C.grn})`,borderRadius:2,transition:"width 0.5s"}}/>
              </div>
            </div>
          </div>

          {/* Asset pots */}
          <SecHead title="Asset Pots at Retirement" top={0} />
          <div style={gr(4,10)}>
            <Kard lbl="🇸🇪 ITP at 55"       val={fmtM(itp_p)}  sub="Accessible immediately"      color={C.teal} />
            <Kard lbl="🇸🇪 ISK at 55"       val={fmtM(isk_p)}  sub="0.888% drag applied"          color={C.teal} />
            <Kard lbl="🇸🇪 Funds (30% CGT)" val={fmtM(yFundT)} sub={Y.funds.filter(f=>f.value>0).map(f=>f.name).join(" · ")||"—"} color={C.copper} />
            <Kard lbl="🇦🇺 Super at 60 🔒"  val={fmtM(sup_p)}  sub="Locked 5 yrs post-retirement" color={C.warn} />
          </div>
          <div style={{...gr(4,10),marginTop:10}}>
            <Kard lbl="🇲🇾 EPF at 55"       val={fmtM(epf_p)}  sub="Accessible immediately"       color={C.grn} />
            <Kard lbl="🇩🇰 ASK at 55"       val={fmtM(ask_p)}  sub="17% tax drag applied"          color={C.copper} />
            <Kard lbl="🇩🇰 Funds (~30%)"    val={fmtM(pFundT)} sub={P.funds.filter(f=>f.value>0).map(f=>f.name).join(" · ")||"—"} color={C.warn} />
            <Kard lbl="🇩🇰 DK Occ. at 64 🔒" val={fmtM(dko_p)} sub="Locked ~9 yrs"                color={C.warn} />
          </div>

          <Hr />
          {/* Monthly income breakdown */}
          <SecHead title="Monthly Income Breakdown" />
          <div style={gr(2,16)}>
            {/* YOU */}
            <div>
              <div style={{borderLeft:`2px solid ${C.teal}`,paddingLeft:14,marginBottom:14}}>
                <Label sz={8} style={{color:C.teal}}>You — at age 55</Label>
                <div style={{fontFamily:F.serif,fontSize:32,fontWeight:700,color:yGap>=0?C.ivory:C.red,marginTop:4}}>{fmtM(y55)}<span style={{fontSize:14,color:C.dim,fontFamily:F.mono,marginLeft:8}}>/mo</span></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["ITP",itp_mo,C.teal],["ISK",isk_mo,C.teal],["Funds + Stocks",yInvMo,C.copper]].map(([l,v,col])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:C.s1,border:`1px solid ${C.brd}`,borderRadius:2}}>
                    <span style={{fontFamily:F.mono,fontSize:9,color:C.ivoryD,letterSpacing:"0.1em",textTransform:"uppercase"}}>{l}</span>
                    <span style={{fontFamily:F.serif,fontSize:15,color:col,fontWeight:600}}>{fmtM(v)}</span>
                  </div>
                ))}
                {Y.setup_myr>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:`${C.red}08`,border:`1px solid ${C.red}20`,borderRadius:2}}>
                  <span style={{fontFamily:F.mono,fontSize:9,color:C.red,letterSpacing:"0.1em",textTransform:"uppercase"}}>Setup costs deducted</span>
                  <span style={{fontFamily:F.serif,fontSize:13,color:C.red}}>−{fmtM(Y.setup_myr)}</span>
                </div>}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:C.s2,border:`1px solid ${yGap>=0?C.teal+"40":C.red+"40"}`,borderRadius:2,marginTop:2}}>
                  <span style={{fontFamily:F.mono,fontSize:9,color:C.ivoryD,letterSpacing:"0.1em",textTransform:"uppercase"}}>vs RM {R.tgt.toLocaleString()} target</span>
                  <span style={{fontFamily:F.serif,fontSize:15,color:yGap>=0?C.grn:C.red,fontWeight:700}}>{fmtD(yGap)}/mo</span>
                </div>
                <div style={{padding:"10px 14px",background:`${C.warn}08`,border:`1px solid ${C.warn}20`,borderRadius:2}}>
                  <Label sz={8} style={{color:C.dim,marginBottom:4}}>Future unlocks</Label>
                  <div style={{fontFamily:F.mono,fontSize:9,color:C.warn,lineHeight:1.9}}>
                    + {fmtM(sup_mo)}/mo — Super at 60<br/>
                    + {fmtM(alm_mo)}/mo — Allmän at {Y.alm_age}
                  </div>
                </div>
              </div>
            </div>

            {/* PARTNER */}
            <div>
              <div style={{borderLeft:`2px solid ${C.copper}`,paddingLeft:14,marginBottom:14}}>
                <Label sz={8} style={{color:C.copper}}>Partner — at age 55</Label>
                <div style={{fontFamily:F.serif,fontSize:32,fontWeight:700,color:pGap>=0?C.ivory:C.red,marginTop:4}}>{fmtM(p55)}<span style={{fontSize:14,color:C.dim,fontFamily:F.mono,marginLeft:8}}>/mo</span></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["EPF",epf_mo,C.grn],["ASK",ask_mo,C.copper],["Funds + Stocks",pInvMo,C.copper]].map(([l,v,col])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:C.s1,border:`1px solid ${C.brd}`,borderRadius:2}}>
                    <span style={{fontFamily:F.mono,fontSize:9,color:C.ivoryD,letterSpacing:"0.1em",textTransform:"uppercase"}}>{l}</span>
                    <span style={{fontFamily:F.serif,fontSize:15,color:col,fontWeight:600}}>{fmtM(v)}</span>
                  </div>
                ))}
                {P.setup_myr>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:`${C.red}08`,border:`1px solid ${C.red}20`,borderRadius:2}}>
                  <span style={{fontFamily:F.mono,fontSize:9,color:C.red,letterSpacing:"0.1em",textTransform:"uppercase"}}>Setup costs deducted</span>
                  <span style={{fontFamily:F.serif,fontSize:13,color:C.red}}>−{fmtM(P.setup_myr)}</span>
                </div>}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:C.s2,border:`1px solid ${pGap>=0?C.copper+"40":C.red+"40"}`,borderRadius:2,marginTop:2}}>
                  <span style={{fontFamily:F.mono,fontSize:9,color:C.ivoryD,letterSpacing:"0.1em",textTransform:"uppercase"}}>vs RM {R.tgt.toLocaleString()} target</span>
                  <span style={{fontFamily:F.serif,fontSize:15,color:pGap>=0?C.grn:C.red,fontWeight:700}}>{fmtD(pGap)}/mo</span>
                </div>
                <div style={{padding:"10px 14px",background:`${C.warn}08`,border:`1px solid ${C.warn}20`,borderRadius:2}}>
                  <Label sz={8} style={{color:C.dim,marginBottom:4}}>Future unlocks</Label>
                  <div style={{fontFamily:F.mono,fontSize:9,color:C.warn,lineHeight:1.9}}>
                    + {fmtM(dko_mo)}/mo — DK Occ. at ~64<br/>
                    + RM 1,000/mo — ATP at ~67
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Hr />
          <SecHead title="Income Projection" />
          <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:2,padding:"20px 16px",marginBottom:12}}>
            <Label sz={8} style={{marginBottom:16}}>Monthly Income MYR · Ages 55–{55+R.yrs}</Label>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={incomeDat} margin={{top:8,right:16,left:0,bottom:0}}>
                <XAxis dataKey="age" stroke={C.brd} tick={chartTick} />
                <YAxis stroke={C.brd} tick={chartTick} tickFormatter={fmtK} width={55} />
                <Tooltip formatter={v=>fmtM(v)} contentStyle={chartTooltip} labelStyle={{color:C.copper}} />
                <Legend wrapperStyle={{fontFamily:F.mono,fontSize:9,letterSpacing:"0.1em"}} />
                <ReferenceLine y={R.tgt} stroke={C.red} strokeDasharray="3 3" label={{value:"Target",fill:C.red,fontSize:9,fontFamily:F.mono}} />
                <Line type="monotone" dataKey="you"     stroke={C.teal}   strokeWidth={2} dot={false} name="You" />
                <Line type="monotone" dataKey="partner" stroke={C.copper} strokeWidth={2} dot={false} name="Partner" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderRadius:2,padding:"20px 16px"}}>
            <Label sz={8} style={{marginBottom:16}}>Portfolio Balance Drawdown MYR · Ages 55–{55+R.yrs}</Label>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={balDat} margin={{top:8,right:16,left:0,bottom:0}}>
                <XAxis dataKey="age" stroke={C.brd} tick={chartTick} />
                <YAxis stroke={C.brd} tick={chartTick} tickFormatter={fmtK} width={55} />
                <Tooltip formatter={v=>fmtM(v)} contentStyle={chartTooltip} labelStyle={{color:C.copper}} />
                <Legend wrapperStyle={{fontFamily:F.mono,fontSize:9,letterSpacing:"0.1em"}} />
                <Area type="monotone" dataKey="you"     stroke={C.teal}   fill={`${C.teal}10`}   strokeWidth={2} dot={false} name="Your Portfolio" />
                <Area type="monotone" dataKey="partner" stroke={C.copper} fill={`${C.copper}10`} strokeWidth={2} dot={false} name="Partner Portfolio" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* ═══ TIMELINE ═══ */}
        {tab==="timeline" && (
          <div style={gr(2,24)}>
            <div>
              <div style={{borderLeft:`2px solid ${C.teal}`,paddingLeft:14,marginBottom:16}}>
                <Label sz={8} style={{color:C.teal}}>Sweden — You</Label>
              </div>
              <TL yr={yr}                               dot={C.teal}   title="Today — Build aggressively"           desc={`${y_yrs} yrs to retirement. Max ITP sacrifice, fill ISK, avoid non-ISK depot.`} />
              <TL yr={yr+Math.max(0,55-Y.age)}          dot={C.copper} title="Age 55 — Retire to Malaysia"          desc="Activate ITP drawdown. Notify Collectum 3–6 months prior. Apply SINK." />
              <TL yr={yr+Math.max(0,57-Y.age)}          dot={C.teal}   title="Age 57 — Exit Swedish Tax Residency"  desc="Notify Skatteverket. Apply for SINK for ITP and Allmän payments." />
              <TL yr={yr+Math.max(0,59-Y.age)}          dot={C.warn}   title="Age 59 — Super TTR Stream"            desc="Draw 4–10% of super p.a. before full unlock at 60." />
              <TL yr={yr+Math.max(0,60-Y.age)}          dot={C.grn}    title="Age 60 — AU Super Unlocks"            desc={`Full tax-free access. ${fmtM(sup_p)} pot. Adds ${fmtM(sup_mo)}/month.`} />
              <TL yr={yr+Math.max(0,Y.alm_age-Y.age)}   dot={C.teal}   title={`Age ${Y.alm_age} — Allmän Pension`}  desc={`Adds ${fmtM(alm_mo)}/mo. SINK 25%.`} />
            </div>
            <div>
              <div style={{borderLeft:`2px solid ${C.copper}`,paddingLeft:14,marginBottom:16}}>
                <Label sz={8} style={{color:C.copper}}>Denmark / Malaysia — Partner</Label>
              </div>
              <TL yr={yr}                            dot={C.copper} title="Today — Maximise EPF & ASK"         desc={`${p_yrs} yrs to retirement. Fill ASK to DKK 166,200/yr. Preserve EPF.`} />
              <TL yr={yr+Math.max(0,50-P.age)}       dot={C.warn}   title="Age 50 — EPF Akaun 50 Access"       desc="Optional partial withdrawal. Better to compound to 55." />
              <TL yr={yr+Math.max(0,55-P.age)}       dot={C.grn}    title="Age 55 — Retire · Akaun 55"         desc={`Full EPF access. Draw ${fmtM(epf_mo)}/mo. Malaysian citizen — no visa needed.`} />
              <TL yr={yr+Math.max(0,64-P.age)}       dot={C.warn}   title="Age ~64 — DK Occupational Pension"  desc={`Adds ${fmtM(dko_mo)}/mo. ~25% Danish withholding.`} />
              <TL yr={yr+Math.max(0,67-P.age)}       dot={C.red}    title="Age ~67 — Danish ATP"               desc="Hard-locked until state pension age. Late-life bonus only." />
            </div>
          </div>
        )}

        {/* ═══ STRATEGY ═══ */}
        {tab==="strategy" && (
          <div style={gr(2,24)}>
            <div>
              <div style={{borderLeft:`2px solid ${C.teal}`,paddingLeft:14,marginBottom:16}}>
                <Label sz={8} style={{color:C.teal}}>Sweden — You</Label>
              </div>
              <ABox type="warn"><strong>Bridge the super gap (55–60).</strong> ITP + ISK must fund RM {R.tgt.toLocaleString()}/mo for 5 years before super unlocks. Target pot ≥ {fmtM(R.tgt*12*5)}.</ABox>
              <ABox type="ok"><strong>ISK over regular depot — always.</strong> 0.888%/yr vs 30% CGT at exit. First SEK 150k free. Never open a non-ISK depot while Swedish resident.</ABox>
              <ABox type="ok"><strong>Add ITP salary sacrifice now.</strong> Pre-tax, accessible at 55. Even SEK 1,000/month compounds significantly over {y_yrs} years.</ABox>
              <ABox type="warn"><strong>Time your non-ISK disposals.</strong> Sell before residency ends to offset losses, or convert to ISK while still resident.</ABox>
              <ABox type="ok"><strong>Apply for SINK before moving.</strong> ITP and Allmän taxed at flat 25% vs progressive Swedish rates. Apply via Skatteverket form SKV 4350.</ABox>
            </div>
            <div>
              <div style={{borderLeft:`2px solid ${C.copper}`,paddingLeft:14,marginBottom:16}}>
                <Label sz={8} style={{color:C.copper}}>Denmark / Malaysia — Partner</Label>
              </div>
              <ABox type="warn"><strong>Bridge the DK gap (55–64).</strong> EPF + ASK must cover 9 years alone. Target EPF ≥ RM 650,000. Max ASK to DKK 166,200/yr.</ABox>
              <ABox type="ok"><strong>ASK is Denmark's ISK equivalent.</strong> 17% annual tax vs 27–42% on depot. Max it every year without exception.</ABox>
              <ABox type="ok"><strong>DK salary sacrifice is powerful.</strong> ~40% income tax relief at source. Even with delayed unlock, the compounding over {p_yrs} years is substantial.</ABox>
              <ABox type="bad"><strong>Never plan around ATP at 55.</strong> Locked until ~67. Model it as a late-life bonus only, never a core income source.</ABox>
              <Hr />
              <Label sz={8} style={{color:C.dim,marginBottom:10}}>Cross-Border</Label>
              <ABox type="ok"><strong>Malaysia's foreign-sourced income exemption.</strong> Pension and investment income from SE, DK, AU generally not subject to Malaysian tax — a structural advantage most expats underuse.</ABox>
              <ABox type="ok"><strong>AU super at 60 is fully tax-free.</strong> No Malaysian tax. The {fmtM(sup_p)} pot unlocks 5 years into retirement — plan for a deliberate step-up in lifestyle spending.</ABox>
              <ABox type="warn"><strong>Engage a cross-border tax specialist.</strong> One session (RM 3–8k) covering SE–MY, DK–MY, AU–MY treaties pays for itself many times over.</ABox>
            </div>
          </div>
        )}

        {/* ═══ REFERENCES ═══ */}
        {tab==="refs" && (
          <div>
            <div style={{borderLeft:`2px solid ${C.teal}`,paddingLeft:16,marginBottom:24}}>
              <Label sz={8} style={{color:C.teal,marginBottom:6}}>Sources & References</Label>
              <div style={{fontFamily:F.serif,fontSize:13,color:C.ivoryD,maxWidth:640,lineHeight:1.8}}>
                All tax rates, pension rules and access ages are sourced from official authorities. Verify annually — particularly in January when Sweden and Denmark publish rate updates.
              </div>
            </div>

            {[
              { section:"Sweden", color:C.teal, items:[
                {label:"ISK Schablonintäkt Rate (0.888% for 2025)",body:"Set annually based on statslåneränta + 1%. Check each November for the following year's rate.",url:"https://www.skatteverket.se/privat/sparandeinvesteringar/investeringssparkonto.4.5fc8c94513259a4ba1d800040743.html",source:"Skatteverket"},
                {label:"Capital Gains Tax — Funds & Stocks (30%)",body:"Kapitalvinst on sale of securities outside ISK taxed at 30% on nominal gain.",url:"https://www.skatteverket.se/privat/sparandeinvesteringar/vardepapper/aktierochfonder.4.5fc8c94513259a4ba1d800041243.html",source:"Skatteverket"},
                {label:"Property CGT (22%)",body:"Vinst vid försäljning av privatbostad taxed at 22%. Uppskov rules may apply if reinvesting.",url:"https://www.skatteverket.se/privat/fastigheterochbostad/forsaljningavbostad.4.5fc8c94513259a4ba1d800037483.html",source:"Skatteverket"},
                {label:"SINK — Non-Resident Tax (25%)",body:"Flat 25% withholding on ITP and Allmän pension for non-residents. Apply via form SKV 4350.",url:"https://www.skatteverket.se/privat/skatter/arbeteochinkomst/sink.4.7be5268414bea064694ca59.html",source:"Skatteverket"},
                {label:"Allmän Pension — Earliest Access",body:"Minimum draw age raised to 63 from 2023, rising to 64 in 2026.",url:"https://www.pensionsmyndigheten.se/for-pensionarer/nar-kan-jag-ta-ut-pension/nar-kan-jag-ta-ut-allman-pension",source:"Pensionsmyndigheten"},
                {label:"ITP / ITPK Rules",body:"ITP accessed from age 55 via Collectum. ITPK can be drawn as lump sum or monthly from 55.",url:"https://www.collectum.se/",source:"Collectum"},
              ]},
              { section:"Denmark", color:C.copper, items:[
                {label:"Aktiesparekonto (ASK) — 17% Annual Tax",body:"17% flat tax annually on unrealised and realised gains. Limit DKK 166,200 for 2025.",url:"https://www.skat.dk/borger/aktiesparekonto",source:"Skat.dk"},
                {label:"Share Income Tax — Depot (27%/42%)",body:"27% up to DKK 67,500; 42% above. Modelled as ~30% blended drag.",url:"https://www.skat.dk/borger/aktier-og-investeringer/aktier-og-udbytte",source:"Skat.dk"},
                {label:"Occupational Pension Access Age",body:"Most pensions accessible 3–5 years before folkepensionsalder (~age 62–64). Verify with PensionsInfo.",url:"https://www.pensionsinfo.dk/",source:"PensionsInfo.dk"},
                {label:"ATP — Locked Until ~67",body:"Hard-locked until state pension age. No early access under any circumstances.",url:"https://www.atp.dk/",source:"ATP.dk"},
                {label:"Property — Primary Residence CGT Exempt",body:"Exempt under parcelhusreglen if lot ≤ 1,400m² and occupied as primary residence.",url:"https://www.skat.dk/borger/ejendomme-og-bolig/salg-af-ejendom",source:"Skat.dk"},
              ]},
              { section:"Malaysia", color:C.grn, items:[
                {label:"EPF — Full Access at Age 55",body:"Akaun 55 fully accessible from age 55. Historical dividend ~5–6%/yr.",url:"https://www.kwsp.gov.my/en/member/withdrawal/age-55",source:"KWSP / EPF"},
                {label:"Foreign-Sourced Income Exemption",body:"Foreign-sourced income generally exempt under s.127 Income Tax Act 1967. Verify with LHDN as rules may change.",url:"https://www.hasil.gov.my/",source:"LHDN / IRB Malaysia"},
                {label:"Residential Status & Tax Residency",body:"Tax resident if present ≥ 182 days in a calendar year. Review annually if splitting time between countries.",url:"https://www.hasil.gov.my/en/individual/individual-life-cycle/how-do-i-determine-my-tax-residency-status/",source:"LHDN / IRB Malaysia"},
              ]},
              { section:"Australia", color:C.warn, items:[
                {label:"Superannuation Preservation Age (60)",body:"Full unrestricted access from age 60. Taxed component tax-free for non-residents at 60+.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/when-you-can-access-your-super",source:"ATO"},
                {label:"Transition to Retirement (TTR)",body:"Draw 4–10% of super p.a. from preservation age. Earnings taxed at 15% in TTR phase.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/transition-to-retirement",source:"ATO"},
                {label:"Non-Resident Withholding on Super",body:"Lump sum withdrawals by non-residents taxed at 35% on taxable component. Tax-free component remains free.",url:"https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/non-resident-members",source:"ATO"},
              ]},
              { section:"Double Tax Treaties", color:C.ivoryD, items:[
                {label:"Sweden–Malaysia Treaty",body:"In force. Pension sourced in Sweden paid to Malaysian residents may be taxable only in Malaysia — SINK election changes this. Verify with adviser.",url:"https://www.skatteverket.se/omoss/internationellt/skatteavtal/skatteavtalsforteckning.4.dfe345a107ebcc9baf80005898.html",source:"Skatteverket"},
                {label:"Denmark–Malaysia Treaty",body:"In force. May reduce Danish withholding below 25% on pensions. Review Article 18.",url:"https://www.skat.dk/erhverv/international-handel-og-samarbejde/dobbeltbeskatningsaftaler",source:"Skat.dk"},
                {label:"Australia–Malaysia Treaty",body:"In force. Super and pension treatment varies. ATO guidance for non-residents applies.",url:"https://www.ato.gov.au/individuals-and-families/international-tax/in-detail/treaties/tax-treaties/",source:"ATO"},
              ]},
            ].map(({ section, color, items }) => (
              <div key={section} style={{marginBottom:28}}>
                <div style={{borderLeft:`2px solid ${color}`,paddingLeft:12,marginBottom:12}}>
                  <Label sz={8} style={{color}}>{section}</Label>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {items.map((r,i) => <RefCard key={i} {...r} />)}
                </div>
              </div>
            ))}

            <div style={{background:C.s1,border:`1px solid ${C.brd}`,borderLeft:`2px solid ${C.warn}`,borderRadius:2,padding:16,fontSize:12,color:C.ivoryD,lineHeight:1.8,fontFamily:F.sans}}>
              <span style={{color:C.warn,fontFamily:F.mono,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase"}}>Disclaimer</span><br/>
              This planner is for personal planning only. It does not constitute financial, legal or tax advice. Always verify with official sources or a qualified cross-border adviser before making financial decisions.
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{marginTop:48,paddingTop:16,borderTop:`1px solid ${C.brd}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.1em"}}>
            FITFIRE · ILLUSTRATIVE ONLY · NOT FINANCIAL ADVICE
          </div>
          <div style={{fontFamily:F.mono,fontSize:8,color:C.dim,letterSpacing:"0.08em"}}>
            SE ISK 0.888% · SE CGT 30% · DK ASK 17% · DK DEPOT ~30% · AU SUPER TAX-FREE AT 60+
          </div>
        </div>
      </div>
    </div>
  );
}
