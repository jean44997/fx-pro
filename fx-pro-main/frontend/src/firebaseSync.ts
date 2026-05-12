import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "./firebase";

type FirebaseProfile = {
  user_id?: string;
  email?: string;
  name?: string;
  phone?: string;
  role?: string;
  auth_provider?: string;
};

export async function syncFirebaseEmailAuth(
  email: string,
  password: string,
  profile?: FirebaseProfile | string,
): Promise<string | null> {
  try {
    let credential;
    try {
      credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch {
      credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    }

    const profileData = typeof profile === "string" ? { name: profile } : profile || {};
    const displayName = profileData.name || credential.user.displayName || "";

    if (displayName && credential.user.displayName !== displayName) {
      await updateProfile(credential.user, { displayName }).catch(() => {});
    }

    await setDoc(
      doc(firebaseDb, "users", credential.user.uid),
      {
        uid: credential.user.uid,
        app_user_id: profileData.user_id || null,
        email: (profileData.email || email).trim().toLowerCase(),
        name: displayName,
        phone: profileData.phone || "",
        role: profileData.role || "user",
        auth_provider: profileData.auth_provider || "jwt",
        updated_at: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {});

    return credential.user.uid;
  } catch {
    return null;
  }
}

export async function clearFirebaseSession() {
  try {
    await signOut(firebaseAuth);
  } catch {}
}
