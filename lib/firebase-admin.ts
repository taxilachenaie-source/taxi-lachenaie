import {
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getMessaging } from "firebase-admin/messaging";

const firebaseAdminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: applicationDefault(),
        projectId: "taxi-lachenaie-d4afd",
      });

export const firebaseAdminMessaging =
  getMessaging(firebaseAdminApp);