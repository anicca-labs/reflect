// @openapi-internal — dev-only helper, not callable from production clients
import { getFirebaseAccessToken, sendFcmMessage } from '../_shared/firebase.ts';

const DEFAULT_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'reflect-8e62d';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const { fcm_token, firebase_project_id } = await req.json();
  if (!fcm_token) return new Response('Missing fcm_token', { status: 400 });

  const projectId = firebase_project_id ?? DEFAULT_PROJECT_ID;
  const accessToken = await getFirebaseAccessToken(projectId);
  const result = await sendFcmMessage(fcm_token, projectId, accessToken, {
    title: 'Reflect',
    body: '🧪 Test push — pipeline is working.',
  });

  if (!result.ok) return new Response(result.error ?? 'FCM error', { status: 500 });
  return new Response('ok');
});
