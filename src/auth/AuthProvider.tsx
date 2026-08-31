import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";

import { auth } from "../config/firebase";
import { normalizeInvitationEmail } from "../store/projectInvitations";
import {
  syncSignedInUserProfileToCloud,
  UserDisplayNameSyncError,
} from "../services/userProfile/userDisplayName";
import { unregisterCurrentDeviceForPush } from "../services/notifications/pushNotifications";
import { normalizeUserDisplayName } from "../types/userProfile";

export class SignUpProfileError extends Error {
  readonly stage: "displayName" | "firebaseProfile" | "cloudProfile";

  constructor(
    stage: "displayName" | "firebaseProfile" | "cloudProfile",
    message: string,
  ) {
    super(message);
    this.name = "SignUpProfileError";
    this.stage = stage;
  }
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(email: string, password: string) {
        // Match invitation discovery: trim + lowercase before Firebase Auth.
        await signInWithEmailAndPassword(
          auth,
          normalizeInvitationEmail(email),
          password,
        );
      },
      async signUp(email: string, password: string, displayName: string) {
        const normalizedName = normalizeUserDisplayName(displayName);

        if (!normalizedName) {
          throw new SignUpProfileError(
            "displayName",
            "Enter a valid full name.",
          );
        }

        const credential = await createUserWithEmailAndPassword(
          auth,
          normalizeInvitationEmail(email),
          password,
        );

        try {
          await updateProfile(credential.user, {
            displayName: normalizedName,
          });
        } catch {
          throw new SignUpProfileError(
            "firebaseProfile",
            "Your account was created, but your name could not be saved. You can update it from Profile.",
          );
        }

        try {
          await syncSignedInUserProfileToCloud();
        } catch {
          throw new SignUpProfileError(
            "cloudProfile",
            "Your account was created, but your profile could not be synced to BuildSigma Cloud. You can update it from Profile.",
          );
        }
      },
      async signOut() {
        try {
          await unregisterCurrentDeviceForPush();
        } catch {
          // Best-effort: still sign out even if push unregister fails.
        }
        await firebaseSignOut(auth);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

export { UserDisplayNameSyncError };
