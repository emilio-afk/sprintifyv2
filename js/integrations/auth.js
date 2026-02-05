// auth.js
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  setDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, profilesCollection } from "../core/firebase.js";

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
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.user = user;
      await persistUserProfile(user);
      onLogin(user);
    } else {
      state.user = null;
      onLogout();
    }
  });
}

// Login con popup (evita redirect)
export async function login() {
  const { signInWithPopup } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
  );
  await signInWithPopup(auth, new GoogleAuthProvider());
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
