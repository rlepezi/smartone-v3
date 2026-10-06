import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { auth } from "../config/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [rol, setRol] = useState(null);
  const [mandanteId, setMandanteId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRol(null);
        setMandanteId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Los custom claims (rol, mandanteId) son la única fuente de
        // verdad de permisos — mismos nombres que usa el backend en
        // authMiddleware.js (ver auditoría Fase A).
        const resultado = await firebaseUser.getIdTokenResult();
        setUser(firebaseUser);
        setRol(resultado.claims.rol || null);
        setMandanteId(resultado.claims.mandanteId || null);
      } catch (error) {
        console.error("Error al leer los custom claims:", error);
        setUser(firebaseUser);
        setRol(null);
        setMandanteId(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const value = { user, rol, mandanteId, loading, login, logout };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
}
