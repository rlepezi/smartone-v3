import React, { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export const LoginPage = () => {
  const location = useLocation();
  const { login, user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Única fuente de navegación tras el login: cuando el AuthContext ya tiene al usuario con su
  // perfil cargado. Navegar a mano justo después de signIn (antes de que onAuthStateChanged
  // termine) hacía que la ruta protegida viera `user = null` y rebotara al login.
  if (!authLoading && user) {
    return <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      // Éxito: el botón queda en "Ingresando..." hasta que el redirect de arriba tome el control.
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
        setError("Credenciales incorrectas. Verifique su correo y contraseña.");
      } else {
        setError("Ocurrió un error al iniciar sesión. Intente nuevamente.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-card p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-dark via-primary to-sage flex items-center justify-center text-white font-extrabold mx-auto shadow-md shadow-primary/20 text-lg">
            S1
          </div>
          <div>
            <div className="flex items-center justify-center">
              <span className="text-xl font-bold text-primary tracking-tight">SMART</span>
              <span className="text-xl font-black text-carbon-dark tracking-tight ml-0.5">ONE</span>
            </div>
            <p className="text-xs text-slate-400">Ingreso a la plataforma de acreditación</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-carbon-dark mb-1.5">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.cl"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-carbon-dark mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (authLoading && Boolean(user))}
            className="w-full py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </div>
  );
};