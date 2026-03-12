// auth.js
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  setDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, profilesCollection } from "../core/firebase.js";

let loginPromise = null;

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function shouldFallbackToRedirect(error) {
  return new Set([
    "auth/popup-blocked",
    "auth/web-storage-unsupported",
    "auth/operation-not-supported-in-this-environment",
  ]).has(error?.code);
}

async function persistUserProfile(user) {
  if (!user) return;
  try {
    await setDoc(
      doc(profilesCollection, user.uid),
      {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[AUTH] Error al guardar perfil:", err);
  }
}

export function handleAuth(state, onLogin, onLogout) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.user = user;
      onLogin(user);
      persistUserProfile(user);
    } else {
      state.user = null;
      onLogout();
    }
  });
}

export async function login() {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const provider = createGoogleProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (shouldFallbackToRedirect(error)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  })();

  try {
    await loginPromise;
  } finally {
    loginPromise = null;
  }
}

export function logout() {
  return signOut(auth);
}

// OAuth Token Client — Calendar (scopes mínimos)
export function getCalendarAccessToken() {
  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: "48796270891-b8ntkuu928apb61htrqblkft9q3u2dk8.apps.googleusercontent.com",
        scope:
          "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
        callback: (tokenResponse) => {
          if (tokenResponse?.access_token) return resolve(tokenResponse.access_token);
          reject(new Error("No se recibió token de acceso de Google."));
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}
