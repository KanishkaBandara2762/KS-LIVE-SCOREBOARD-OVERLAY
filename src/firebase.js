import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAFpOhAUHMdrjGnLEobvEpoZoaGhzmSsqU",
  authDomain: "ks-live-app.firebaseapp.com",
  databaseURL: "https://ks-live-app-default-rtdb.firebaseio.com",
  projectId: "ks-live-app",
  storageBucket: "ks-live-app.firebasestorage.app",
  messagingSenderId: "544438693648",
  appId: "1:544438693648:web:d93de3131616ac961cbf95",
  measurementId: "G-SL0PB2BPBT"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);   // Realtime Database (existing scoreboard)
export const auth = getAuth(app);       // Authentication (new auth system)