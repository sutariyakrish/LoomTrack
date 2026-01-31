// Import Firebase SDKs (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } 
from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";







const firebaseConfig = {
    apiKey: "AIzaSyD3AQBWwwdseXqJaLj11ZSN1B8WY72e4hk",
    authDomain: "prod-software.firebaseapp.com",
    projectId: "prod-software",
    storageBucket: "prod-software.firebasestorage.app",
    messagingSenderId: "443396407758",
    appId: "1:443396407758:web:40bdecc144ddefcab3ab9f",
    measurementId: "G-D05EC10JEH"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);
