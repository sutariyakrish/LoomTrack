import { auth } from "./firebase.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/**
 * Ask user for password and verify using Firebase
 * @returns true if password is correct, false otherwise
 */
export async function confirmOwnerPassword() {
  const password = prompt("Enter password to continue");

  if (!password) return false;

  const user = auth.currentUser;

  const credential = EmailAuthProvider.credential(
    user.email,
    password
  );

  try {
    await reauthenticateWithCredential(user, credential);
    return true;
  } catch (error) {
    alert("Incorrect password");
    return false;
  }
}
