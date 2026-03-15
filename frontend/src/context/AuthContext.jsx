import { createContext, useContext, useEffect, useState } from 'react'
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  GoogleAuthProvider
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [googleAccessToken, setGoogleAccessToken] = useState(null)

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
          // Initialize new user with default settings
          userData.role = firebaseUser.uid === import.meta.env.VITE_ADMIN_UID ? 'admin' : 'user'
          userData.hasSharedAccess = false
          userData.dailyCap = 5
          userData.usageToday = 0
          userData.totalUsage = 0
          userData.createdAt = serverTimestamp()
          await setDoc(userDocRef, userData)
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
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
