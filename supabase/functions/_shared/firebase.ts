import * as jose from 'https://esm.sh/jose@5';

function getCredentials(projectId: string): { clientEmail: string; privateKey: string } {
  const stgProjectId = Deno.env.get('FIREBASE_PROJECT_ID_STG');
  const isStg = stgProjectId && projectId === stgProjectId;
  return {
    clientEmail: isStg
      ? Deno.env.get('FIREBASE_CLIENT_EMAIL_STG')!
      : Deno.env.get('FIREBASE_CLIENT_EMAIL')!,
    privateKey: isStg
      ? Deno.env.get('FIREBASE_PRIVATE_KEY_STG')!.replace(/\\n/g, '\n')
      : Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n'),
  };
}

export async function getFirebaseAccessToken(projectId: string): Promise<string> {
  const { clientEmail, privateKey } = getCredentials(projectId);
  const pk = await jose.importPKCS8(privateKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(pk);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const { access_token } = await res.json();
  return access_token;
}

export async function sendFcmMessage(
  fcmToken: string,
  projectId: string,
  accessToken: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
  options?: { collapseId?: string },
): Promise<{ ok: boolean; unregistered?: boolean; error?: string }> {
  // A stable collapseId dedupes redundant deliveries of the *same* logical
  // notification. FCM guarantees at-least-once delivery, so a device that was
  // offline/in Doze can receive one copy while asleep and a second copy on
  // reconnect. Without these fields Android renders each copy as its own tray
  // entry; with them the OS keeps at most one.
  //   - android.collapse_key: FCM drops older undelivered copies while offline.
  //   - android.notification.tag: the OS replaces an already-shown notification.
  //   - apns-collapse-id: the iOS equivalent of tag.
  const collapseId = options?.collapseId;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification,
        android: {
          ...(collapseId ? { collapse_key: collapseId } : {}),
          notification: {
            channel_id: 'default',
            sound: 'default',
            ...(collapseId ? { tag: collapseId } : {}),
          },
        },
        apns: {
          ...(collapseId ? { headers: { 'apns-collapse-id': collapseId } } : {}),
          payload: { aps: { sound: 'default' } },
        },
        ...(data ? { data } : {}),
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return {
      ok: false,
      unregistered: err.includes('UNREGISTERED') || res.status === 404,
      error: err,
    };
  }
  return { ok: true };
}
