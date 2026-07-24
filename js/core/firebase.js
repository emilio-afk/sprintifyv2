// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// ⚠️ Considera mover esto a variables de entorno para despliegues públicos.
const firebaseConfig = {
  apiKey: "AIzaSyCdpDoEf5aNIDmnQhWcFh8VIPLVDbWfFDY",
  authDomain: "sprintify-815c6.firebaseapp.com",
  projectId: "sprintify-815c6",
  storageBucket: "sprintify-815c6.firebasestorage.app",
  messagingSenderId: "48796270891",
  appId: "1:48796270891:web:09e5b34332d3b86aee856e",
  databaseURL: "https://sprintify-815c6-default-rtdb.firebaseio.com/",
  measurementId: "G-KRP4927VYS",
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Singleton para RTDB
let rtdbInstance = null;
export function getRtdb() {
  if (!rtdbInstance) {
    rtdbInstance = getDatabase(app);
  }
  return rtdbInstance;
}

// “Namespace” de datos. La transformación a Tablero Astrolab usa un namespace
// PROPIO y aislado, para no leer ni ensuciar los datos del Sprintify legado
// (que sigue en "sprintify-shared-project" en la rama main).
const appId = "astrolab-tablero-v1";

export const listsCollection = collection(db, `artifacts/${appId}/public/data/taskLists`);
export const tasksCollection = collection(db, `artifacts/${appId}/public/data/tasks`);
export const epicsCollection = collection(db, `artifacts/${appId}/public/data/epics`);
export const profilesCollection = collection(db, `artifacts/${appId}/public/data/profiles`);
export const handbookCollection = collection(db, `artifacts/${appId}/public/data/handbook`);
export const themesCollection = collection(db, `artifacts/${appId}/public/data/themes`);

// --- Tablero Astrolab ---
// Capa superior (flexible: período u objetivo). Los Carriles (=themes) apuntan aquí vía parentId.
export const programsCollection = collection(db, `artifacts/${appId}/public/data/programs`);
// Corte semanal ("estado del lunes") por frente. Habilita historia.
export const weeklySnapshotsCollection = collection(
  db,
  `artifacts/${appId}/public/data/weeklySnapshots`
);
