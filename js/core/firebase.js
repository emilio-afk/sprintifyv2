// firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

// ⚠️ Considera mover esto a variables de entorno para despliegues públicos.
const firebaseConfig = {
  apiKey: 'AIzaSyCdpDoEf5aNIDmnQhWcFh8VIPLVDbWfFDY',
  authDomain: 'sprintify-815c6.firebaseapp.com',
  projectId: 'sprintify-815c6',
  storageBucket: 'sprintify-815c6.firebasestorage.app',
  messagingSenderId: '48796270891',
  appId: '1:48796270891:web:09e5b34332d3b86aee856e',
  databaseURL: 'https://sprintify-815c6-default-rtdb.firebaseio.com/',
  measurementId: 'G-KRP4927VYS',
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

// “Namespace” de datos compartidos (un solo appId)
const appId = 'sprintify-shared-project';

export const listsCollection = collection(db, `artifacts/${appId}/public/data/taskLists`);
export const tasksCollection = collection(db, `artifacts/${appId}/public/data/tasks`);
export const epicsCollection = collection(db, `artifacts/${appId}/public/data/epics`);
export const profilesCollection = collection(db, `artifacts/${appId}/public/data/profiles`);
export const handbookCollection = collection(db, `artifacts/${appId}/public/data/handbook`);
export const themesCollection = collection(db, `artifacts/${appId}/public/data/themes`);
