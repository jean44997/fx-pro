import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import type { User } from "./auth";

const PREF = "pref_biometric";
const PASSKEY_ID = "fxpro_passkey_id";

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  return bytesToBase64Url(new Uint8Array(buffer));
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function enableBiometricLogin(user?: User | null): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !("PublicKeyCredential" in window) || !navigator.credentials) {
      return { ok: false, message: "Ce navigateur ne supporte pas encore les passkeys." };
    }
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
    if (!available) return { ok: false, message: "Aucune biométrie/passkey disponible sur cet appareil." };

    const challenge = randomBytes();
    const userId = randomBytes();
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "FX Pro" },
        user: {
          id: userId,
          name: user?.email || "user@fxpro.local",
          displayName: user?.name || "FX Pro user",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { ok: false, message: "Passkey non créée." };
    await AsyncStorage.setItem(PASSKEY_ID, bufferToBase64Url(credential.rawId));
    await AsyncStorage.setItem(PREF, "1");
    return { ok: true, message: "Connexion biométrique activée pour cet appareil." };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) {
    return { ok: false, message: "Configure d'abord Face ID ou une empreinte dans les réglages du téléphone." };
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Activer la connexion biométrique FX Pro",
    cancelLabel: "Annuler",
    disableDeviceFallback: false,
  });
  await AsyncStorage.setItem(PREF, result.success ? "1" : "0");
  return { ok: result.success, message: result.success ? "Connexion biométrique activée." : "Authentification annulée." };
}

export async function disableBiometricLogin() {
  await AsyncStorage.setItem(PREF, "0");
}

export async function verifyBiometricLogin(): Promise<boolean> {
  const pref = await AsyncStorage.getItem(PREF);
  if (pref !== "1") return true;

  if (Platform.OS === "web") {
    const id = await AsyncStorage.getItem(PASSKEY_ID);
    if (!id || typeof window === "undefined" || !navigator.credentials) return true;
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(),
        allowCredentials: [{ type: "public-key", id: base64UrlToBytes(id) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return Boolean(credential);
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Déverrouiller FX Pro",
    cancelLabel: "Annuler",
    disableDeviceFallback: false,
  });
  return result.success;
}
