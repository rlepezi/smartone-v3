import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export const storageService = {
  async subirEvidencia(expedienteId, archivo) {
    const nombreObjeto = `${Date.now()}_${archivo.name}`;
    const path = `expedientes/${expedienteId}/evidencias/${nombreObjeto}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, archivo);
    const url = await getDownloadURL(storageRef);
    return { url, nombre: archivo.name, tipo: archivo.type };
  },

  async subirLogoMandante(mandanteId, archivo) {
    const partes = archivo.name.split(".");
    const extension = partes.length > 1 ? partes.pop().toLowerCase() : "png";
    const path = `mandantes/${mandanteId}/logo.${extension}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, archivo);
    const url = await getDownloadURL(storageRef);
    return { url };
  },

  async subirLogoEmpresa(empresaId, archivo) {
    const partes = archivo.name.split(".");
    const extension = partes.length > 1 ? partes.pop().toLowerCase() : "png";
    const path = `empresas/${empresaId}/logo.${extension}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, archivo);
    const url = await getDownloadURL(storageRef);
    return { url };
  },
};
