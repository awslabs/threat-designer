import React from "react";
import styled, { keyframes } from "styled-components";
import { BounceLoader } from "react-spinners";

const AgentLoader = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "80vh",
      }}
    >
      <BounceLoader color="#962EFF" />
    </div>
  );
};

export default AgentLoader;
