import { doc, getDocFromServer, onSnapshot, type DocumentSnapshot, type FirestoreError } from "firebase/firestore";
import { getFirebaseClientServices } from "@/lib/firebase/client";

function authorizationDocument(uid: string) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  return doc(services.firestore, "authz", uid);
}

export function watchSessionAuthorization(uid: string, next: (snapshot: DocumentSnapshot) => void, error: (cause: FirestoreError) => void) {
  // The server may confirm unchanged cached data with a metadata-only event.
  return onSnapshot(authorizationDocument(uid), { includeMetadataChanges: true }, next, error);
}

export function readServerAuthorization(uid: string) {
  return getDocFromServer(authorizationDocument(uid));
}
