import React, { createContext, useContext, useState, useEffect } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── Register new user ──────────────────────────────────────────────────────
    async function register(email, password, fullName) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: fullName });
        await sendEmailVerification(credential.user);
        return credential;
    }

    // ── Login ──────────────────────────────────────────────────────────────────
    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    // ── Logout ─────────────────────────────────────────────────────────────────
    function logout() {
        return signOut(auth);
    }

    // ── Resend verification email ──────────────────────────────────────────────
    function sendVerification() {
        if (auth.currentUser) {
            return sendEmailVerification(auth.currentUser);
        }
        return Promise.reject(new Error("No user is signed in."));
    }

    // ── Password reset ─────────────────────────────────────────────────────────
    function resetPassword(email) {
        return sendPasswordResetEmail(auth, email);
    }

    // ── Reload user to check emailVerified status ──────────────────────────────
    // After reload(), auth.currentUser.emailVerified is updated in-place.
    // We force a re-render by setting state to the same object reference trick.
    async function reloadUser() {
        if (auth.currentUser) {
            await auth.currentUser.reload();
            // auth.currentUser is mutated in-place by Firebase after reload().
            // Setting state to auth.currentUser triggers a re-render with fresh data.
            setCurrentUser(auth.currentUser);
        }
    }

    // ── Auth state listener ────────────────────────────────────────────────────
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        login,
        register,
        logout,
        sendVerification,
        resetPassword,
        reloadUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
