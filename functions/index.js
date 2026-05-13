const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendTransactionNotification = onDocumentCreated("fxpro_notifications/{notifId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const notification = snap.data();
  const userId = notification.user_id;
  if (!userId) return;

  const tokenSnap = await admin.firestore().doc(`fxpro_push_tokens/${userId}`).get();
  const token = tokenSnap.get("token");
  if (!token) {
    logger.info("No FCM token for user", { userId });
    return;
  }

  const notifId = notification.notif_id || event.params.notifId;
  const title = notification.title || "FX Pro";
  const body = notification.body || "Nouvelle notification";
  const type = notification.type || "transaction";
  const data = {
    notif_id: String(notifId),
    txn_id: String(notification.txn_id || ""),
    type: String(type),
    url: "/notifications",
  };

  try {
    if (/^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token)) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          title,
          body,
          data,
          sound: "default",
          priority: "high",
          channelId: "default",
        }),
      });
      if (!response.ok) {
        logger.error("Expo push failed", { userId, notifId, status: response.status, text: await response.text() });
      }
      return;
    }

    await admin.messaging().send({
      token,
      notification: { title, body },
      data,
      webpush: {
        fcmOptions: {
          link: "/notifications",
        },
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: String(notifId),
          renotify: false,
          requireInteraction: false,
          vibrate: [100, 50, 100],
        },
      },
      android: {
        priority: "high",
        notification: {
          channelId: "default",
          color: "#00FFFF",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });
  } catch (error) {
    logger.error("Failed to send transaction notification", { userId, notifId, error });
  }
});
