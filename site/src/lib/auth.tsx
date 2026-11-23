"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebase } from "./firebase";

/** undefined while Firebase restores the session, null when signed out. */
export function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(firebase().auth, setUser), []);
  return user;
}

/** Create the profile document on first sign-in. */
export async function ensureProfile(user: User) {
  const { db } = firebase();
  const ref = doc(db, "users", user.uid);
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, { email: user.email ?? "", plan: "open-source", createdAt: serverTimestamp() });
  }
}

/** Firebase error codes in words a person can act on. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "That email and password don't match an account.",
    "auth/invalid-email": "That doesn't look like an email address.",
    "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
    "auth/weak-password": "Use at least 6 characters.",
    "auth/popup-closed-by-user": "The Google window was closed before signing in.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/configuration-not-found": "Sign-in isn't switched on for this site yet.",
    "auth/operation-not-allowed": "This sign-in method isn't switched on yet.",
    "auth/unauthorized-domain": "Sign-in isn't allowed from this domain yet.",
  };
  return map[code] ?? "Something went wrong. Try again.";
}
