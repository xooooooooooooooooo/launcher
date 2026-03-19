import React from "react";
import { createRoot } from "react-dom/client";

(window as any).React = React;
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
