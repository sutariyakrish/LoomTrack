import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.querySelector(".login-btn").addEventListener("click", async (e) => {
  e.preventDefault();

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);

    
    emailInput.value = "";
    passwordInput.value = "";

    // optional redirect
    window.location.href = "factories.html";
  } catch (error) {
    console.error(error);

    document.getElementById("error").innerText = "Invalid Username/Password";

    // ❌ DO NOT clear inputs on failure
  }
});
