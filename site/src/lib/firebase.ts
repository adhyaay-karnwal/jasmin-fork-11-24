"use client";

// Public web config for the tryjasmine-app Firebase project. These values identify the project;
// access is enforced by Firebase Auth and the Firestore rules in site/firebase/firestore.rules.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: "AIzaSyB1xEmsU0KoeZQ4j6-tC1u2sSejFaEFi7Y",
  authDomain: "tryjasmine-app.firebaseapp.com",
  projectId: "tryjasmine-app",
  appId: "1:344581839748:web:c4364f38f9e4e7d855dbd1",
  messagingSenderId: "344581839748",
  storageBucket: "tryjasmine-app.firebasestorage.app",
};

let app: FirebaseApp | undefined;
export function firebase(): { auth: Auth; db: Firestore } {
  app ??= getApps()[0] ?? initializeApp(config);
  return { auth: getAuth(app), db: getFirestore(app) };
}
