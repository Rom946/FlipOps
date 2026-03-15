import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LogIn, Sparkles, ShieldCheck, Zap, ArrowRight, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { loginWithGoogle, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  
  const from = location.state?.from?.pathname || "/"

  if (user) {
    return <Navigate to={from} replace />
  }

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await loginWithGoogle()
    } catch (err) {
      if (err.code === 'auth/configuration-not-found') {
        setError('Google login is not enabled in your Firebase Console. See the instructions below.')
      } else {
        setError('Authentication failed: ' + err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background blobs for depth */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animae-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 mb-6 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Zap className="w-10 h-10 text-white fill-white/20" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white mb-2 italic">
            Flip<span className="text-blue-500">Ops</span>
          </h1>
          <p className="text-slate-400 font-medium text-lg leading-relaxed">
            AI-Powered Wallapop Arbitrage Engine
          </p>
        </div>

        <div className="card border-slate-800/50 bg-slate-900/50 backdrop-blur-xl p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="space-y-4">
              <FeatureItem 
                icon={<Sparkles className="w-5 h-5 text-amber-400" />} 
                title="AI Negotiation" 
                desc="Automated charming messages to sellers" 
              />
              <FeatureItem 
                icon={<BarChart3 className="w-5 h-5 text-blue-400" />} 
                title="Profit Analytics" 
                desc="Live P&L tracking and capital metrics" 
              />
              <FeatureItem 
                icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} 
                title="Secure Pipeline" 
                desc="Cloud-synced deal tracking & inventory" 
              />
            </div>

            <div className="pt-4">
              <button 
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-white hover:bg-slate-100 text-slate-950 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 group relative overflow-hidden shadow-xl shadow-white/5"
              >
                {loading ? (
                  <div className="spinner w-5 h-5 border-2 border-slate-950/30 border-t-slate-950" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                    <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </>
                )}
              </button>
              
              {error && (
                <p className="text-red-400 text-sm mt-4 text-center font-medium bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-slate-500 text-sm">
          By signing in you agree to our <span className="text-slate-300 underline cursor-pointer">Terms</span> and <span className="text-slate-300 underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}

function FeatureItem({ icon, title, desc }) {
  return (
    <div className="flex items-start gap-4 group">
      <div className="mt-1 p-2 rounded-lg bg-white/5 border border-white/5 group-hover:bg-white/10 group-hover:border-white/10 transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  )
}
