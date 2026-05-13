import { setupWebPush } from "./webPush";

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
  await checkPlatformAuthenticator().catch(() => false);

  return push;
}
