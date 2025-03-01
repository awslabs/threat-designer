import { useEffect, useState } from "react";
import TopNavigationMFE from "./components/TopNavigationMFE/TopNavigationMFE";
import AppLayoutMFE from "./components/AppLayoutMFE/AppLayoutMFE";
import LoginPageInternal from "./pages/Landingpage/Landingpage";
import { Spinner } from "@cloudscape-design/components";
import { getUser } from "./services/Auth/auth";
import { SpaceBetween } from "@cloudscape-design/components";

const App = () => {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    setLoading(true);
    try {
      const user = await getUser();
      setAuthUser(user);
    } catch (error) {
      console.log(error);
      setAuthUser(null);
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    }
  };

  return (
    <div>
      {loading ? (
        <SpaceBetween alignItems="center">
          <div style={{ marginTop: "20px" }}>
            <Spinner size="large" />
          </div>
        </SpaceBetween>
      ) : authUser ? (
        <>
          <TopNavigationMFE user={authUser} setAuthUser={checkAuthState} />
          <AppLayoutMFE user={authUser} />
        </>
      ) : (
        <LoginPageInternal setAuthUser={checkAuthState} />
      )}
    </div>
  );
};

export default App;
