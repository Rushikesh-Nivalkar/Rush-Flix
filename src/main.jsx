import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PhoneSetupPage from "./pages/PhoneSetupPage";
import "./styles/global.css";
import "./styles/tv.css";

const isPhoneSetup = new URLSearchParams(window.location.search).get("setup") === "phone";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPhoneSetup ? <PhoneSetupPage /> : <App />}
  </React.StrictMode>,
);
