import React, { useEffect } from "react";
import { ThreatModel } from "../../components/ThreatModeling/ThreatModel.jsx";

const ThreatModelResult = ({ user }) => {
  useEffect(() => {}, [user]);

  return <ThreatModel user={user} />;
};

export default ThreatModelResult;
