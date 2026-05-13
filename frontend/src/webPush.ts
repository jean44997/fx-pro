export async function setupWebPush(_authToken?: string | null): Promise<boolean> {
  return false;
}

export async function syncWebPushToken(_authToken?: string | null): Promise<boolean> {
  return false;
}

export async function showWebNotification(
  _title: string,
  _body: string,
  _data?: Record<string, unknown>
): Promise<boolean> {
  return false;
}
