/**
 * Uso (mismo patrón que seedDatosPrueba.js):
 *   USE_EMULATOR=true node src/scripts/seedSuperAdmin.js   (emuladores)
 *   SMARTONE_ENV=qa node src/scripts/seedSuperAdmin.js     (proyecto QA)
 *   SMARTONE_ENV=prod node src/scripts/seedSuperAdmin.js --confirmar-prod
 *       (producción)
 */

// Ambiente: SMARTONE_ENV=qa | prod (prod exige --confirmar-prod) o
// USE_EMULATOR=true. Ver ./ambiente.js.
const {iniciarAmbiente} = require("./ambiente");
const {admin} = iniciarAmbiente({escribe: true});

const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const SUPER_ADMIN = {
  email: "clepez@gmail.com",
  password: "Roger#20",
  nombre: "Super",
  apellido: "Admin",
  rol: "superadmin",
  mandanteId: null,
  estado: "activo",
};

/**
 * Crea (o reutiliza) el usuario Super Admin en Firebase Auth y Firestore.
 * @return {Promise<void>}
 */
async function createSuperAdmin() {
  console.log("🚀 Iniciando aprovisionamiento de Super Admin...");

  try {
    let userRecord;

    // 1. Verificar o crear en Auth
    try {
      userRecord = await admin.auth().getUserByEmail(SUPER_ADMIN.email);
      console.log(
          `ℹ️ El usuario ${SUPER_ADMIN.email} ya existía en Auth ` +
          `(UID: ${userRecord.uid})`,
      );
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({
          email: SUPER_ADMIN.email,
          password: SUPER_ADMIN.password,
          displayName: `${SUPER_ADMIN.nombre} ${SUPER_ADMIN.apellido}`,
        });
        console.log(`✅ Usuario creado en Auth con UID: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    // 2. Custom Claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      rol: SUPER_ADMIN.rol,
      mandanteId: null,
    });
    console.log(
        "✅ Custom Claims configurados " +
        "({ rol: 'superadmin', mandanteId: null })",
    );

    // 3. Documento en Firestore
    const userDocRef = db.collection("usuarios").doc(userRecord.uid);
    await userDocRef.set(
        {
          email: SUPER_ADMIN.email,
          nombre: SUPER_ADMIN.nombre,
          apellido: SUPER_ADMIN.apellido,
          rol: SUPER_ADMIN.rol,
          mandanteId: null,
          estado: SUPER_ADMIN.estado,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
    );

    console.log(`✅ Documento creado en coleccion 'usuarios/${userRecord.uid}'`);
    console.log("\n🎉 Super Admin listo:");
    console.log(`📧 Email: ${SUPER_ADMIN.email}`);
    console.log(`🔑 Contraseña: ${SUPER_ADMIN.password}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error al provisionar:", err);
    process.exit(1);
  }
}

createSuperAdmin();
