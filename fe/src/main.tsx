import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import "./styles/variables.css";
import "./styles/reset.css";
import "./styles/global.css";
import "./styles/shared.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Application root element "#root" was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
