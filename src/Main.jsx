import React from "react";
import { Route, Routes } from "react-router-dom";
import ThreatModeling from "./pages/ThreatDesigner/ThreatModeling.jsx";
import ThreatModelResult from "./pages/ThreatDesigner/ThreatModelResult.jsx";
import ThreatCatalog from "./pages/ThreatDesigner/ThreatCatalog.jsx";

function Main({ user }) {
  return (
    <Routes>
      <Route path="/" element={<ThreatModeling user={user} />} />
      <Route path="/:id" element={<ThreatModelResult user={user} />} />
      <Route path="/threat-catalog" element={<ThreatCatalog user={user} />} />
    </Routes>
  );
}

export default Main;
