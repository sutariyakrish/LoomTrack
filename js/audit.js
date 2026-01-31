import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/**
 * Save action log (append-only)
 */
export async function logAudit(
  factoryId,
  action,
  entity,
  entityId,
  details
) {
  await addDoc(collection(db, "audit_logs"), {
    factoryId,
    action,
    entity,
    entityId,
    details,
    performedBy: auth.currentUser.uid,
    performedAt: serverTimestamp()
  });
}
