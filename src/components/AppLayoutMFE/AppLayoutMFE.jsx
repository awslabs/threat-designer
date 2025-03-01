import React, { useState } from "react";
import { AppLayout } from "@cloudscape-design/components";
import Main from "../../Main";
import "@cloudscape-design/global-styles/index.css";

const appLayoutLabels = {
  navigation: "Side navigation",
  navigationToggle: "Open side navigation",
  navigationClose: "Close side navigation",
};

function AppLayoutMFE({ user }) {
  const [navOpen, setNavOpen] = useState(true);

  return (
    <div>
      {user && (
        <AppLayout
          disableContentPaddings={false}
          content={<Main user={user} />}
          navigationWidth={240}
          navigationHide={true}
          toolsHide
          headerSelector={"#h"}
          ariaLabels={appLayoutLabels}
          navigationOpen={navOpen}
          onNavigationChange={() => setNavOpen(!navOpen)}
        />
      )}
    </div>
  );
}

export default AppLayoutMFE;
