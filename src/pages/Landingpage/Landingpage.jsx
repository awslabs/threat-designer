import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { amplifyConfig } from "../../config";
import { getCurrentUser } from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import Shield from "../../components/ThreatModeling/images/shield.png";
import { Icon } from "@cloudscape-design/components";
import LoginForm from "../../components/Auth/LoginForm";
import { useNavigate } from "react-router";

Amplify.configure(amplifyConfig);

const Title = styled.h1`
  font-size: 50px;
  font-weight: 200;
  margin-bottom: 0px;
  background: linear-gradient(125deg, #e6007a 0%, #5856d6 52%, #00aeef 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const BoldSpan = styled.span`
  font-weight: bold;
`;

const RotatedIcon = () => (
  <span style={{ display: "inline-block", transform: "rotate(180deg)" }}>
    <Icon name="arrow-left" />
  </span>
);

const LoginPageInternal = ({ setAuthUser }) => {
  const titleRef = useRef(null);
  const [width, setWidth] = useState("auto");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const updateWidth = () => {
      if (titleRef.current) {
        setWidth(titleRef.current.offsetWidth);
      }
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
    checkAuthStatus();
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
      }}
    >
      <div
        style={{
          backgroundColor: "#0f141a",
          width: "65%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "80%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: "translateY(-50px)",
          }}
        >
          <img src={Shield} alt="Threat Designer logo" style={{ width: "150px" }} />
          <div ref={titleRef}>
            <Title>
              Welcome to <BoldSpan>Threat Designer</BoldSpan>
            </Title>
          </div>
          <div style={{ width, marginTop: 0 }}>
            <p
              style={{
                color: "white",
                textAlign: "left",
                marginTop: 0,
              }}
            >
              An AI agent for secure system design, using large language models to streamline threat
              modeling and identify vulnerabilities.
            </p>
          </div>
        </div>
      </div>
      <div
        style={{
          width: "35%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <LoginForm onSignInSuccess={handleSignInSuccess} />
      </div>
    </div>
  );
};

export default LoginPageInternal;
