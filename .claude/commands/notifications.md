---
name: notifications
description: Set up or debug push notifications using expo-notifications + Firebase Cloud Messaging
---

## How the stack fits together

```
Firebase Cloud Messaging (FCM)
  ↓ delivers to device
expo-notifications (local handling, permissions, badge)
  ↓ token registered via
push_notification tool (database MCP) → stores token in DB
  ↓ server sends via
Supabase Edge Function → FCM HTTP v1 API
```

## Required Doppler vars

- `FIREBASE_SERVER_KEY` — FCM server key (Edge Function only, never in app)
- Firebase config vars already managed by the firebase MCP

## Setup steps

1. **Request permissions**

```ts
const { status } = await Notifications.requestPermissionsAsync();
if (status !== 'granted') return;
```

2. **Register token** — call the `push_notification` MCP tool with the device token and user ID to store it in the database

3. **Listen for foreground notifications**

```ts
Notifications.addNotificationReceivedListener((notification) => { ... });
```

4. **Handle taps** (background/quit)

```ts
Notifications.addNotificationResponseReceivedListener((response) => {
  // navigate using expo-router
  router.push(response.notification.request.content.data.route);
});
```

5. **Firebase messaging** — use `@react-native-firebase/messaging` for data-only (background) messages:

```ts
messaging().setBackgroundMessageHandler(async (remoteMessage) => { ... });
```

## Rules

- Always request permissions before registering a token
- Store tokens via the `push_notification` database MCP tool — never directly in Zustand
- Data-only messages use Firebase messaging; visible notifications use expo-notifications
- Re-register token on every app launch — tokens rotate; stale tokens cause silent failures
- Test on physical device only — simulators do not receive push notifications
