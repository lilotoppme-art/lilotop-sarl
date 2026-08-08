"use strict";

const requestForm = document.getElementById("reset-request-form");
const completeForm = document.getElementById("reset-complete-form");
const statusRegion = document.getElementById("reset-status");
const token = new URLSearchParams(window.location.search).get("token") || "";

requestForm.hidden = Boolean(token);
completeForm.hidden = !token;

async function submit(payload) {
  const response = await fetch("/api/admin-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Action impossible.");
  return data;
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = requestForm.querySelector("button");
  button.disabled = true;
  statusRegion.textContent = "Envoi du lien securise...";
  try {
    const data = await submit({ action: "request", email: new FormData(requestForm).get("email") });
    statusRegion.textContent = data.message;
    requestForm.reset();
  } catch (error) {
    statusRegion.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

completeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(completeForm);
  const password = String(values.get("password") || "");
  const confirmation = String(values.get("confirmation") || "");
  if (password !== confirmation) {
    statusRegion.textContent = "Les deux mots de passe ne correspondent pas.";
    return;
  }
  const button = completeForm.querySelector("button");
  button.disabled = true;
  statusRegion.textContent = "Mise a jour securisee...";
  try {
    const data = await submit({ action: "complete", token, password });
    window.history.replaceState({}, document.title, "/admin/nexus/reset-password");
    statusRegion.textContent = data.message;
    completeForm.reset();
    completeForm.hidden = true;
  } catch (error) {
    statusRegion.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
