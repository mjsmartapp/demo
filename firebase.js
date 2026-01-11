import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5jaPVkCwxXiMYhSn0uuW9QSMc-B5C9YY",
  authDomain: "mjsmartapps.firebaseapp.com",
  databaseURL: "https://mjsmartapps-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mjsmartapps",
  storageBucket: "mjsmartapps.firebasestorage.app",
  messagingSenderId: "1033240518010",
  appId: "1:1033240518010:web:930921011dda1bd56e0ac3",
  measurementId: "G-959VLQSHH2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export { db };