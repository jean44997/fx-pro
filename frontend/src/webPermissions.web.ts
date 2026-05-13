import { setupWebPush } from "./webPush";

async function requestCameraPermission() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

async function checkPlatformAuthenticator() {
  if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
    return false;
  }

  try {
    return Boolean(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}

export async function requestWebInstallPermissions(): Promise<boolean> {
  const push = await setupWebPush().catch(() => false);
  const camera = await requestCameraPermission().catch(() => false);
  const authenticator = await checkPlatformAuthenticator().catch(() => false);

  return push || camera || authenticator;
}
