import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

document.getElementById("logout").addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});
