import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);

      // Clear factory selection
      sessionStorage.clear();

      // Redirect to login
      window.location.href = "index.html";
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Logout failed. Please try again.");
    }
  });
}

const toggleBtn = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");

if (toggleBtn && navMenu) {

  // Toggle menu on mobile
  toggleBtn.addEventListener("click", () => {
    navMenu.classList.toggle("active");
  });

  // Reset menu when switching to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      navMenu.classList.remove("active");
    }
  });
}



