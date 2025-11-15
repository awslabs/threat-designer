import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Amplify } from "aws-amplify";
import { amplifyConfig, BACKEND_MODE, BASE_PATH } from "./config";

// Only configure Amplify in Remote Mode
if (BACKEND_MODE !== "lightning") {
  Amplify.configure(amplifyConfig);
}

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <BrowserRouter basename={BASE_PATH}>
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
