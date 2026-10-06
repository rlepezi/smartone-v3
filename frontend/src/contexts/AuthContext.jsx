import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Hay un usuario de Auth pero todavía falta cargar su perfil: mientras tanto el estado
        // es "cargando", NO "sin sesión". Sin esto, tras un login `loading` seguía en false con
        // `user` en null y las rutas protegidas rebotaban al login (el "pestañeo").
        setLoading(true);
        try {
          // Obtener perfil complementario desde Firestore
          const docRef = doc(db, "usuarios", firebaseUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUser(firebaseUser);
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData,
            });
          } else {
            // Usuario en Auth pero sin perfil en Firestore
            setUser(firebaseUser);
            setProfile(null);
          }
        } catch (error) {
          console.error("Error al cargar perfil de usuario:", error);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  const value = {
    user,
    profile,
    loading,
    login,
    logout,
    isSuperAdmin: profile?.rol === "superadmin",
    isEvaluador: profile?.rol === "evaluador",
    isMandanteUser: ["mandante_admin", "mandante_lector"].includes(profile?.rol),
    mandanteId: profile?.mandanteId || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de un AuthProvider");
  }
  return context;
};