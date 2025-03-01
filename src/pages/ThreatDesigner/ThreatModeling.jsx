import React, { useEffect } from "react";
import { default as ThreatModelingComponent } from "../../components/ThreatModeling/ThreatModeling";

const ThreatModeling = ({ user, handleHelpButtonClick }) => {
  useEffect(() => {}, [user]);

  return <ThreatModelingComponent user={user} handleHelpButtonClick={handleHelpButtonClick} />;
};

export default ThreatModeling;
