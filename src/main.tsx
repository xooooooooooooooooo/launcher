import React from "react";
import { createRoot } from "react-dom/client";

(window as any).React = React;
import App from "./App.tsx";
import "./index.css";

window.onerror = function (message, source, lineno, colno, error) {
  document.body.style.backgroundColor = "red";
  document.body.style.color = "white";
  document.body.innerHTML = `<div style="padding:20px;font-family:monospace;z-index:99999;position:absolute;top:0;left:0;right:0;bottom:0;background:red;"><h1>FATAL REACT CRASH</h1><p>${message}</p><pre>${error?.stack}</pre></div>`;
};

window.addEventListener("unhandledrejection", (event) => {
  document.body.style.backgroundColor = "darkred";
  document.body.style.color = "white";
  document.body.innerHTML = `<div style="padding:20px;font-family:monospace;z-index:99999;position:absolute;top:0;left:0;right:0;bottom:0;background:darkred;"><h1>UNHANDLED PROMISE REJECTION</h1><p>${event.reason}</p><pre>${event.reason?.stack}</pre></div>`;
});

createRoot(document.getElementById("root")!).render(<App />);
