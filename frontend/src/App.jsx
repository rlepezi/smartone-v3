import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { MandantesListPage } from "./pages/mandantes/MandantesListPage";
import { MandanteFormPage } from "./pages/mandantes/MandanteFormPage";
import { MiMandantePage } from "./pages/mandantes/MiMandantePage";
import { UsuariosListPage } from "./pages/usuarios/UsuariosListPage";
import { UsuarioFormPage } from "./pages/usuarios/UsuarioFormPage";
import { UsuarioDetailPage } from "./pages/usuarios/UsuarioDetailPage";
import { ProyectosListPage } from "./pages/proyectos/ProyectosListPage";
import { ProyectoFormPage } from "./pages/proyectos/ProyectoFormPage";
import { EmpresasListPage } from "./pages/empresas/EmpresasListPage";
import { EmpresaFormPage } from "./pages/empresas/EmpresaFormPage";
import { EmpresaDetailPage } from "./pages/empresas/EmpresaDetailPage";
import { PersonasListPage } from "./pages/personas/PersonasListPage";
import { PersonaFormPage } from "./pages/personas/PersonaFormPage";
import { PersonaDetailPage } from "./pages/personas/PersonaDetailPage";
import { RecursosListPage } from "./pages/recursos/RecursosListPage";
import { RecursoFormPage } from "./pages/recursos/RecursoFormPage";
import { RecursoDetailPage } from "./pages/recursos/RecursoDetailPage";
import { PerfilesParticipacionListPage } from "./pages/perfiles-participacion/PerfilesParticipacionListPage";
import { PerfilParticipacionFormPage } from "./pages/perfiles-participacion/PerfilParticipacionFormPage";
import { PerfilParticipacionDetailPage } from "./pages/perfiles-participacion/PerfilParticipacionDetailPage";
import { ConfigurarRequerimientosPage } from "./pages/perfiles-participacion/ConfigurarRequerimientosPage";
import { RespaldosPage } from "./pages/respaldos/RespaldosPage";
import { PerfilesRecursoListPage } from "./pages/perfiles-recurso/PerfilesRecursoListPage";
import { PerfilRecursoFormPage } from "./pages/perfiles-recurso/PerfilRecursoFormPage";
import { ParticipacionesListPage } from "./pages/participaciones/ParticipacionesListPage";
import { RequerimientosListPage } from "./pages/requerimientos/RequerimientosListPage";
import { RequerimientoFormPage } from "./pages/requerimientos/RequerimientoFormPage";
import { ExpedientesListPage } from "./pages/expedientes/ExpedientesListPage";
import { ExpedienteFormPage } from "./pages/expedientes/ExpedienteFormPage";
import { ExpedienteDetailPage } from "./pages/expedientes/ExpedienteDetailPage";
import { EvaluarExpedientePage } from "./pages/expedientes/EvaluarExpedientePage";
import { EvaluacionesListPage } from "./pages/evaluaciones/EvaluacionesListPage";
import { ParticipacionDetailPage } from "./pages/participaciones/ParticipacionDetailPage";
import { ProyectoDetailPage } from "./pages/proyectos/ProyectoDetailPage";
import { ReportesPage } from "./pages/reportes/ReportesPage";
import { AcreditacionWizardPage } from "./pages/acreditaciones/AcreditacionWizardPage";
import { ReemplazarAcreditacionWizardPage } from "./pages/acreditaciones/ReemplazarAcreditacionWizardPage";

// Módulos operacionales: abiertos a todos los roles del catálogo EXCEPTO
// admin_comercial (su alcance es exclusivamente Mandante + Usuario).
const ROLES_OPERACIONAL = ["superadmin", "mandante_admin", "mandante_lector", "evaluador"];
const ROLES_EMPRESAS = [...ROLES_OPERACIONAL, "admin_comercial"];

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Login público */}
          <Route path="/login" element={<LoginPage />} />

          {/* Rutas protegidas */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    
                    {/* Módulo Mandantes (SmartApplication: superadmin y
                        admin_comercial) */}
                    <Route
                      path="/mandantes"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "admin_comercial"]}>
                          <MandantesListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/mandantes/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "admin_comercial"]}>
                          <MandanteFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/mandantes/:id"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "admin_comercial"]}>
                          <MandanteFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* "Mi Mandante" — autogestión acotada, distinta del
                        módulo Mandantes (exclusivo de superadmin) */}
                    <Route
                      path="/mi-mandante"
                      element={
                        <ProtectedRoute allowedRoles={["mandante_admin", "mandante_lector"]}>
                          <MiMandantePage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Usuarios (superadmin / mandante_admin /
                        admin_comercial — cada uno con su propio alcance) */}
                    {/* Respaldo y restauración de la base de datos: exclusivo de superadmin */}
                    <Route
                      path="/respaldos"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin"]}>
                          <RespaldosPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/usuarios"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <UsuariosListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/usuarios/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <UsuarioFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/usuarios/:id"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <UsuarioDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/usuarios/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <UsuarioFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Wizard de Acreditación — atajo que orquesta los
                        servicios existentes, mismos roles que ya pueden
                        crear Participación/Expediente hoy */}
                    <Route
                      path="/acreditaciones/nueva"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <AcreditacionWizardPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Wizard de Reemplazar Acreditación — mueve una
                        Persona/Maquinaria/Empresa de un Proyecto a otro
                        vía el endpoint transaccional acreditacionService.
                        reemplazar, mismos roles de escritura que
                        Participación/Asignación/Expediente. */}
                    <Route
                      path="/acreditaciones/reemplazar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <ReemplazarAcreditacionWizardPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Proyectos (lectura abierta a todos los roles
                        operacionales — admin_comercial excluido) */}
                    <Route
                      path="/proyectos"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ProyectosListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/proyectos/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <ProyectoFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/proyectos/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ProyectoDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/proyectos/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <ProyectoFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Empresas: roles operacionales y admin_comercial (que lee,
                        crea, edita y gestiona sus Mandantes; el alcance por
                        Mandante lo aplica el backend) */}
                    <Route
                      path="/empresas"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_EMPRESAS}>
                          <EmpresasListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/empresas/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <EmpresaFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/empresas/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_EMPRESAS}>
                          <EmpresaDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/empresas/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin", "admin_comercial"]}>
                          <EmpresaFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Personas (catálogo global, lectura abierta a
                        roles operacionales) */}
                    <Route
                      path="/personas"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <PersonasListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/personas/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PersonaFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/personas/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <PersonaDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/personas/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PersonaFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Recursos (catálogo global, lectura abierta a
                        roles operacionales) */}
                    <Route
                      path="/recursos"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <RecursosListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/recursos/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <RecursoFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/recursos/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <RecursoDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/recursos/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <RecursoFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Perfiles de Participación (aislado por Mandante) */}
                    <Route
                      path="/perfiles-participacion"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <PerfilesParticipacionListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-participacion/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PerfilParticipacionFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-participacion/:id/requerimientos"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ConfigurarRequerimientosPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-participacion/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <PerfilParticipacionDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-participacion/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PerfilParticipacionFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Perfiles de Recurso (aislado por Mandante) */}
                    <Route
                      path="/perfiles-recurso"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <PerfilesRecursoListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-recurso/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PerfilRecursoFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/perfiles-recurso/:id/editar"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <PerfilRecursoFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Participaciones (aislado por Mandante) */}
                    <Route
                      path="/participaciones"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ParticipacionesListPage />
                        </ProtectedRoute>
                      }
                    />
                    {/* Toda Participación nueva nace en el wizard de Acreditación */}
                    <Route path="/participaciones/nuevo" element={<Navigate to="/acreditaciones/nueva" replace />} />
                    <Route
                      path="/participaciones/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ParticipacionDetailPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Requerimientos (catálogo global) */}
                    <Route
                      path="/requerimientos"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <RequerimientosListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/requerimientos/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <RequerimientoFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/requerimientos/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <RequerimientoFormPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Expedientes (aislado por Mandante) */}
                    <Route
                      path="/expedientes"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ExpedientesListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/expedientes/nuevo"
                      element={
                        <ProtectedRoute allowedRoles={["superadmin", "mandante_admin"]}>
                          <ExpedienteFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/expedientes/:id"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ExpedienteDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/expedientes/:id/evaluar"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <EvaluarExpedientePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/expedientes/:id/evaluar/persona/:personaId"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <EvaluarExpedientePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/expedientes/:id/evaluar/recurso/:recursoId"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <EvaluarExpedientePage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Vista global de Evaluaciones (cruza todos los Expedientes en alcance, no una puntual) */}
                    <Route
                      path="/evaluaciones"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <EvaluacionesListPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Módulo Reportes (100% lectura, mismo alcance que Expediente) */}
                    <Route
                      path="/reportes"
                      element={
                        <ProtectedRoute allowedRoles={ROLES_OPERACIONAL}>
                          <ReportesPage />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;