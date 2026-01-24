import { lazy, Suspense } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { Spinner } from "@cloudscape-design/components";

// Lazy load route components - only fetched when user navigates to that route
const ThreatModeling = lazy(() => import("./pages/ThreatDesigner/ThreatModeling.jsx"));
const ThreatModelResult = lazy(() => import("./pages/ThreatDesigner/ThreatModelResult.jsx"));
const ThreatCatalog = lazy(() => import("./pages/ThreatDesigner/ThreatCatalog.jsx"));
const GuideViewer = lazy(() =>
  import("./components/Guides/GuideViewer.jsx").then((m) => ({ default: m.GuideViewer }))
);

// Loading fallback component
const RouteLoader = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
    <Spinner size="large" />
  </div>
);

// Wrapper component to provide key prop based on slug
function GuideViewerWrapper() {
  const { slug } = useParams();
  return <GuideViewer key={slug} />;
}

function Main({ user }) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<ThreatModeling />} />
        <Route path="/:id" element={<ThreatModelResult user={user} />} />
        <Route path="/threat-catalog" element={<ThreatCatalog user={user} />} />
        <Route path="/guides/:slug" element={<GuideViewerWrapper />} />
      </Routes>
    </Suspense>
  );
}

export default Main;
