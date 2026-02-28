import { useState } from 'react'
import { supabase } from './supabase'

const C = { bg:"#0d0f0e", s1:"#141816", s2:"#1c211e", brd:"#2a302c", gold:"#c9a84c", grn:"#4caf7d", red:"#e07070", txt:"#d8e0da", dim:"#6b7a6e" }

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
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onLogin(data.user)
    }
  }

  return (
    <div style={{ background:C.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:400, padding:32 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', color:C.gold, textTransform:'uppercase', marginBottom:8 }}>
            FitFIRE · Retirement Planner
          </div>
          <h1 style={{ fontFamily:'Georgia,serif', fontSize:32, fontWeight:900, color:'#fff', lineHeight:1.1 }}>
            Retire at <span style={{ color:C.gold }}>55</span>
          </h1>
          <div style={{ fontSize:12, color:C.dim, marginTop:8 }}>in Malaysia</div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontFamily:'monospace', fontSize:9, letterSpacing:'0.13em', textTransform:'uppercase', color:C.dim, marginBottom:6 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@email.com"
              style={{ width:'100%', background:C.s2, border:`1px solid ${C.brd}`, borderRadius:10, padding:'12px 14px', color:'#fff', fontSize:14, outline:'none', fontFamily:'system-ui,sans-serif' }}
            />
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontFamily:'monospace', fontSize:9, letterSpacing:'0.13em', textTransform:'uppercase', color:C.dim, marginBottom:6 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width:'100%', background:C.s2, border:`1px solid ${C.brd}`, borderRadius:10, padding:'12px 14px', color:'#fff', fontSize:14, outline:'none', fontFamily:'system-ui,sans-serif' }}
            />
          </div>

          {error && (
            <div style={{ background:'rgba(224,112,112,0.1)', border:'1px solid rgba(224,112,112,0.3)', borderRadius:8, padding:'10px 14px', color:C.red, fontSize:12, marginBottom:16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background:loading?C.dim:C.gold, color:C.bg, fontFamily:'monospace', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, cursor:loading?'default':'pointer', transition:'background 0.2s' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:24, fontSize:11, color:C.dim }}>
          Contact the account holder to get access
        </div>
      </div>
    </div>
  )
}
