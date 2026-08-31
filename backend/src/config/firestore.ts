import "./firebase.js";

import { getFirestore } from "firebase-admin/firestore";

export const db = getFirestore();
