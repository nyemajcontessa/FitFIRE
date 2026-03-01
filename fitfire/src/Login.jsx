import { useState } from 'react'
import { supabase } from './supabase'

const C = {
  bg:"#080c0b", s1:"#0e1412", s2:"#141c19", brd:"#1f2e29", brd2:"#2a3d37",
  teal:"#2dd4bf", copper:"#d97706", ivory:"#f0ebe0", ivoryD:"#9ba89f", dim:"#4a5e57",
  red:"#f87171",
}
const F = {
  serif:"'Playfair Display', 'Didot', 'Georgia', serif",
  sans:"'DM Sans', 'Helvetica Neue', sans-serif",
  mono:"'DM Mono', 'Fira Code', 'Courier New', monospace",
}

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); }
    else { onLogin(data.user) }
  }

  return (
    <div style={{
      background:C.bg, minHeight:'100vh',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:F.sans,
      backgroundImage:`radial-gradient(ellipse at 20% 50%, ${C.teal}08 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, ${C.copper}06 0%, transparent 50%)`,
    }}>
      <div style={{width:'100%', maxWidth:400, padding:40}}>

        {/* Wordmark */}
        <div style={{marginBottom:48}}>
          <div style={{marginBottom:8}}>
            <span style={{fontFamily:F.serif, fontSize:36, fontWeight:700, color:C.ivory, letterSpacing:'-0.02em'}}>Fit</span>
            <span style={{fontFamily:F.serif, fontSize:36, fontWeight:700, color:C.teal,  letterSpacing:'-0.02em'}}>FIRE</span>
          </div>
          <div style={{fontFamily:F.mono, fontSize:8, color:C.dim, letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:6}}>
            Retirement Intelligence
          </div>
          <div style={{width:32, height:1, background:C.teal, opacity:0.4}}/>
          <div style={{fontFamily:F.serif, fontSize:13, color:C.ivoryD, marginTop:10, lineHeight:1.6}}>
            Private access — SE · DK · AU · MY
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:12}}>
            <div style={{fontFamily:F.mono, fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:C.dim, marginBottom:8}}>Email</div>
            <input
              type="email" value={email} onChange={e=>setEmail(e.target.value)} required
              placeholder="your@email.com"
              style={{
                width:'100%', background:C.s1, border:`1px solid ${C.brd}`,
                borderBottom:`1px solid ${C.brd2}`, borderRadius:2,
                padding:'12px 14px', color:C.ivory, fontSize:14,
                outline:'none', fontFamily:F.sans, boxSizing:'border-box',
              }}
            />
          </div>

          <div style={{marginBottom:24}}>
            <div style={{fontFamily:F.mono, fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:C.dim, marginBottom:8}}>Password</div>
            <input
              type="password" value={password} onChange={e=>setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{
                width:'100%', background:C.s1, border:`1px solid ${C.brd}`,
                borderBottom:`1px solid ${C.brd2}`, borderRadius:2,
                padding:'12px 14px', color:C.ivory, fontSize:14,
                outline:'none', fontFamily:F.sans, boxSizing:'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              borderLeft:`2px solid ${C.red}`, padding:'10px 14px',
              background:`${C.red}08`, color:C.red,
              fontSize:12, marginBottom:20, fontFamily:F.sans,
              lineHeight:1.5,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'13px',
            border:`1px solid ${loading ? C.dim : C.teal}40`,
            background: loading ? 'transparent' : `${C.teal}12`,
            color: loading ? C.dim : C.teal,
            fontFamily:F.mono, fontSize:9, letterSpacing:'0.2em',
            textTransform:'uppercase', cursor:loading?'default':'pointer',
            borderRadius:2, transition:'all 0.2s',
          }}>
            {loading ? 'Authenticating…' : 'Access Portfolio'}
          </button>
        </form>

        <div style={{marginTop:32, fontFamily:F.mono, fontSize:8, color:C.dim, letterSpacing:'0.1em', lineHeight:1.8}}>
          ACCESS IS BY INVITATION ONLY<br/>
          CONTACT THE ACCOUNT HOLDER FOR CREDENTIALS
        </div>
      </div>
    </div>
  )
}
