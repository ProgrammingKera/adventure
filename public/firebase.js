// firebase.js
// Firebase configuration using CDN imports

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyAGbBbdiHG7JWptAmWp8LoAxwyTSNB0B3o",
  authDomain: "adventure-b92da.firebaseapp.com",
  projectId: "adventure-b92da",
  storageBucket: "adventure-b92da.firebasestorage.app",
  messagingSenderId: "216869443401",
  appId: "1:216869443401:web:4bf5a1e71f069d60916c98",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };

