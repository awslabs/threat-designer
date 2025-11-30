import React from "react";
import { Route, Routes, useParams } from "react-router-dom";
import ThreatModeling from "./pages/ThreatDesigner/ThreatModeling.jsx";
import ThreatModelResult from "./pages/ThreatDesigner/ThreatModelResult.jsx";
import ThreatCatalog from "./pages/ThreatDesigner/ThreatCatalog.jsx";
import { GuideViewer } from "./components/Guides/GuideViewer.jsx";

// Wrapper component to provide key prop based on slug
function GuideViewerWrapper() {
  const { slug } = useParams();
  return <GuideViewer key={slug} />;
}

function Main({ user }) {
  return (
    <Routes>
      <Route path="/" element={<ThreatModeling />} />
      <Route path="/:id" element={<ThreatModelResult user={user} />} />
      <Route path="/threat-catalog" element={<ThreatCatalog user={user} />} />
      <Route path="/guides/:slug" element={<GuideViewerWrapper />} />
    </Routes>
  );
}

export default Main;
