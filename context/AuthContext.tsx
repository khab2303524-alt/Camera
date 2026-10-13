import { auth } from "@/config/firebaseConfig";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";

// Web client ID: Firebase Console -> Authentication -> Sign-in method -> Google -> Web SDK configuration
// (hoặc trong google-services.json: client -> oauth_client -> client_type = 3)
const WEB_CLIENT_ID = "549162212380-6j337pu72a4p9voholjbnpv6g5ij9pue.apps.googleusercontent.com";

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

type AuthContextType = {
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    console.log("[auth] subscribe");
    const unsub = onAuthStateChanged(auth, (u) => {
      console.log("[auth] state", u?.email ?? null);
      setUser(u);
      setInitializing(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName?.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
  };

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res: any = await GoogleSignin.signIn();
      if (res?.type === "cancelled") return; // người dùng đóng hộp thoại
      const idToken = res?.data?.idToken ?? res?.idToken;
      if (!idToken) throw new Error("Không nhận được idToken từ Google");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      throw e;
    }
  };

  const logout = async () => {
    try {
      await GoogleSignin.signOut(); // để lần sau hiện lại danh sách tài khoản Google
    } catch { }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, initializing, signIn, signUp, signInWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}
