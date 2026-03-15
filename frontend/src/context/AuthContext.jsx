import { createContext, useContext, useEffect, useState } from 'react'
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  GoogleAuthProvider
} from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [googleAccessToken, setGoogleAccessToken] = useState(null)
  const [preauthToast, setPreauthToast] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch or create user profile in Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid)
        const userDoc = await getDoc(userDocRef)
        
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          lastLogin: serverTimestamp(),
        }

        if (!userDoc.exists()) {
          // Initialize new user — check pre-authorization first
          userData.role = firebaseUser.uid === import.meta.env.VITE_ADMIN_UID ? 'admin' : 'user'
          userData.usageToday = 0
          userData.totalUsage = 0
          userData.createdAt = serverTimestamp()

          const preauthQ = query(
            collection(db, 'preauthorized_emails'),
            where('email', '==', (firebaseUser.email || '').toLowerCase()),
            limit(1)
          )
          const preauthSnap = await getDocs(preauthQ)
          if (!preauthSnap.empty) {
            const preauthDoc = preauthSnap.docs[0]
            const preauth = preauthDoc.data()
            userData.hasSharedAccess = preauth.sharedKeyEnabled !== false
            userData.dailyCap = preauth.dailyCap || 20
            await deleteDoc(preauthDoc.ref)
            await setDoc(userDocRef, userData)
            setPreauthToast(true)
            setTimeout(() => setPreauthToast(false), 5000)
          } else {
            userData.hasSharedAccess = false
            userData.dailyCap = 5
            await setDoc(userDocRef, userData)
          }
        } else {
          // Update last login
          const updates = { lastLogin: serverTimestamp() }
          
          // CRITICAL: If this user is the admin (matches env), ensure they have the admin role
          // even if they were created before the env variable was set.
          if (firebaseUser.uid === import.meta.env.VITE_ADMIN_UID && userDoc.data().role !== 'admin') {
            updates.role = 'admin'
          }

          await setDoc(userDocRef, updates, { merge: true })
          const existingData = userDoc.data()
          Object.assign(userData, existingData, updates)
        }
        
        setUser(userData)
      } else {
        setUser(null)
        setGoogleAccessToken(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const token = credential.accessToken
      setGoogleAccessToken(token)
      return result.user
    } catch (error) {
      console.error("Login failed:", error)
      throw error
    }
  }

  const logout = () => signOut(auth)

  const value = {
    user,
    loading,
    loginWithGoogle,
    logout,
    googleAccessToken,
    isAdmin: user?.role === 'admin'
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
      {preauthToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-semibold flex items-center gap-2 pointer-events-none">
          <span>✅</span> Welcome! AI access has been pre-configured for you.
        </div>
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
