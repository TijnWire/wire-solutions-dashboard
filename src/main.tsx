import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./store/AppContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);

// Service worker alleen in productie registreren (dev blijft zo soepel werken).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Stond er al een actieve versie? Dan is een wisseling een échte update → herlaad één keer
  // zodat de nieuwste app + data-opschoning meteen verschijnen (niet bij de eerste installatie).
  const hadController = !!navigator.serviceWorker.controller;
  let herladen = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (herladen || !hadController) return;
    herladen = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.update();
        // Blijf periodiek checken op nieuwe versies terwijl de app open is.
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {});
  });
}
