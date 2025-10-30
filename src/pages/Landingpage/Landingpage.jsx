import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { amplifyConfig } from "../../config";
import { getCurrentUser } from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import LoginForm from "../../components/Auth/LoginForm";
import { useNavigate } from "react-router";
import { useTheme } from "../../components/ThemeContext";
import { Link } from "@cloudscape-design/components";
import icon1 from "../../components/Auth/login-icons/assets.svg";
import icon2 from "../../components/Auth/login-icons/flow.svg";
import icon3 from "../../components/Auth/login-icons/threat.svg";
import icon4 from "../../components/Auth/login-icons/ai.svg";
import icon5 from "../../components/Auth/login-icons/sentry.svg";

Amplify.configure(amplifyConfig);

// Main background container (uses theme background)
const LoginPageContainer = styled.div`
  width: 100vw;
  height: 100vh;
  background-color: ${(props) => (props.isDark ? "#1D1D20" : "#F5F5F4")};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  overflow: hidden;
`;

const LoginCard = styled.div`
  display: flex;
  width: 80vw;
  height: 45vw; /* Fixed ratio: 16:9 = width:height, so height = width * 9/16 * 1 = width * 0.5625, but we use 45vw for 80vw */
  max-width: 1200px;
  max-height: 675px; /* 1200 * 9/16 */
  min-width: 800px;
  min-height: 450px; /* 800 * 9/16 */
  border-radius: 1.5vw;
  box-shadow: ${(props) =>
    props.isDark
      ? `0 4px 12px rgba(0, 0, 0, 0.4),
       0 8px 32px rgba(0, 0, 0, 0.3),
       0 16px 64px rgba(0, 0, 0, 0.2)`
      : `0 4px 12px rgba(0, 0, 0, 0.12),
       0 8px 32px rgba(0, 0, 0, 0.08),
       0 16px 64px rgba(0, 0, 0, 0.04)`};
  overflow: hidden;
  position: relative;

  @media (max-width: 768px) {
    flex-direction: column;
    width: 90vw;
    height: 80vh;
    min-width: unset;
    min-height: unset;
    border-radius: 3vw;
  }
`;

const LeftSection = styled.div`
  flex: 5;
  background: linear-gradient(135deg, #962eff 0%, #8575ff 50%, #5c7fff, #0099ff);
  padding: 3vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: white;
  position: relative;
  overflow: hidden;

  h1 {
    font-size: 2.2vw;
    font-weight: 700;
    margin-bottom: 1.2vw;
    line-height: 1.2;
  }

  p {
    font-size: clamp(12px, 1vw, 18px);
    line-height: 1.6;
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    flex: none;
    height: 40%;
    padding: 4vw;
    text-align: center;

    h1 {
      font-size: 5vw;
      margin-bottom: 2vw;
    }

    p {
      font-size: clamp(14px, 3.5vw, 20px);
    }
  }
`;

const LeftContent = styled.div`
  position: relative;
  z-index: 1;
`;

const IconsContainer = styled.div`
  display: flex;
  gap: 2.5vw;
  margin-bottom: 3vw;
  align-items: center;
  justify-content: center;

  img {
    width: 7vw;
    height: 7vw;
    min-width: 50px;
    min-height: 50px;
    max-width: 80px;
    max-height: 80px;
    filter: ${(props) => !props.isDark && "brightness(0) invert(1)"};
  }

  @media (max-width: 768px) {
    gap: 4vw;
    margin-bottom: 4vw;
    justify-content: center;

    img {
      width: 8vw;
      height: 8vw;
      min-width: 40px;
      min-height: 40px;
      max-width: 50px;
      max-height: 50px;
    }
  }
`;

// Right section (1/3 width) - Contains the forms
const RightSection = styled.div`
  flex: 4;
  background: ${(props) => (props.isDark ? "#18191B" : "#ffffff")};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden; /* Add this to prevent scaling overflow */

  @media (max-width: 768px) {
    height: 60%;
  }
`;

const FormScaleWrapper = styled.div`
  width: 500px;
  max-width: 95%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  flex-shrink: 0; /* Prevent shrinking */

  @media (max-width: 768px) {
    width: 90vw;
    max-width: 350px;
  }
`;

const LeftFooter = styled.div`
  position: absolute;
  bottom: 2vw;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 1.2vw;
  z-index: 2;

  a {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.3s ease;
    text-decoration: none;
    color: white !important;
  }

  a:hover {
    opacity: 0.7;
  }

  /* Override Cloudscape Link styles to always be white */
  span {
    color: white !important;
    text-decoration: none !important;
  }

  /* Remove underline from Cloudscape Link */
  .awsui-link-button-inner-content {
    text-decoration: none !important;
  }

  svg {
    width: clamp(20px, 1.8vw, 28px);
    height: clamp(20px, 1.8vw, 28px);
    color: white;
  }

  @media (max-width: 768px) {
    bottom: 3vw;
    gap: 3vw;

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const LoginPageInternal = ({ setAuthUser }) => {
  const { isDark } = useTheme();
  const titleRef = useRef(null);
  const [width, setWidth] = useState("auto");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [containerWidth, setContainerWidth] = useState(400);
  const navigate = useNavigate();

  // Get environment variables for footer links
  const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || "";
  const LIGHTNING_GUIDE_URL = import.meta.env.VITE_LIGHTNING_GUIDE_URL || "";
  const isLightningMode = import.meta.env.VITE_BACKEND_MODE === "lightning";

  useEffect(() => {
    const updateWidth = () => {
      if (titleRef.current) {
        setWidth(titleRef.current.offsetWidth);
      }
      // Calculate container width for scaling
      const cardWidth = Math.min(window.innerWidth * 0.8, 1200) / 3; // 1/3 of card width
      setContainerWidth(cardWidth);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    window.addEventListener("zoom", updateWidth);

    return () => {
      window.removeEventListener("resize", updateWidth);
      window.removeEventListener("zoom", updateWidth);
    };
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const user = await getCurrentUser();
      setIsAuthenticated(!!user);
      setAuthUser();
    } catch (error) {
      setIsAuthenticated(false);
    }
  };

  const handleSignInSuccess = () => {
    setIsAuthenticated(true);
    // Call the parent's checkAuthState to re-check authentication
    // This works for both Lightning Mode and Remote Mode
    setAuthUser();
  };

  return (
    <LoginPageContainer isDark={isDark}>
      <LoginCard>
        <LeftSection>
          <LeftContent>
            <IconsContainer isDark={isDark}>
              <img src={icon1} alt="Assets" />
              <img src={icon2} alt="Flow" />
              <img src={icon3} alt="Threat" />
              <img src={icon4} alt="AI" />
              <img src={icon5} alt="Sentry" />
            </IconsContainer>
            <p>
              <b>Threat Designer: </b>Streamline threat modeling and identify vulnerabilities using
              agentic AI-powered security analysis.
            </p>
          </LeftContent>

          {/* Footer links - only show in Lightning mode */}
          {isLightningMode && (GITHUB_URL || LIGHTNING_GUIDE_URL) && (
            <LeftFooter>
              {GITHUB_URL && (
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub Repository"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
              )}
              {LIGHTNING_GUIDE_URL && (
                <Link
                  href={LIGHTNING_GUIDE_URL}
                  external
                  variant="primary"
                  color="inherit"
                  fontSize="inherit"
                >
                  <span style={{ color: "white", textDecoration: "none" }}>
                    Getting started with Lightning mode
                  </span>
                </Link>
              )}
            </LeftFooter>
          )}
        </LeftSection>

        <RightSection isDark={isDark}>
          <FormScaleWrapper containerWidth={containerWidth}>
            <LoginForm onSignInSuccess={handleSignInSuccess} />
          </FormScaleWrapper>
        </RightSection>
      </LoginCard>
    </LoginPageContainer>
  );
};

export default LoginPageInternal;
