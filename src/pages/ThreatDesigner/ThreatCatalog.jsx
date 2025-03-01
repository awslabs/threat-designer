import React, { useEffect } from "react";
import { ThreatCatalogCardsComponent } from "../../components/ThreatModeling/ThreatCatalogCards.jsx";

const ThreatCatalog = ({ user }) => {
  useEffect(() => {}, [user]);

  return <ThreatCatalogCardsComponent user={user} />;
};

export default ThreatCatalog;
