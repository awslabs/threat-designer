import styled from "styled-components";
import React from "react";
import {
  colorBackgroundContainerContent,
  colorBackgroundButtonPrimaryActive,
  colorBackgroundButtonPrimaryHover,
  colorBackgroundLayoutToggleHover,
  colorBackgroundDropdownItemHover,
  colorTextButtonNormalDisabled,
  colorBackgroundButtonPrimaryDefault,
  colorBorderDropdownItemHover,
} from "@cloudscape-design/design-tokens/index.js";
export const SidebarContainer = styled.div`
  position: relative; // Change to fixed
  background-color: ${colorBackgroundContainerContent};
  border-right: 1px solid #e9ebed;
  transition: width 0.3s ease;
  width: ${(props) => (props.isCollapsed ? "50px" : "300px")};
  min-width: 50px;
  max-width: 600px;
  height: 100%;
  display: flex;
`;

export const ToggleButton = styled.button`
  position: absolute;
  right: -12px; // Position it on the border
  top: 20%; // Center vertically
  transform: translateY(-50%); // Adjust for perfect centering
  z-index: 101;
  background: ${colorBackgroundContainerContent};
  border: 1px solid #e9ebed;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    background-color: ${colorBackgroundContainerContent};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px #0972d3;
  }
`;

export const SidebarContent = styled.div`
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  opacity: ${(props) => (props.isCollapsed ? 0 : 1)};
  transition: opacity 0.3s ease;
  visibility: ${(props) => (props.isCollapsed ? "hidden" : "visible")};

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cdcdcd;
    border-radius: 4px;

    &:hover {
      background: #a4a4a4;
    }
  }
`;

export const MainContent = styled.div`
  margin-left: ${(props) => props.sidebarWidth}px;
  flex: 1;
  // display: flex;
  min-width: 0;
  // overflow: auto;
  padding: 20px;
  // background-color: ${colorBackgroundContainerContent};
  // min-height: 100vh;
  // max-width: calc(100% - ${(props) => props.sidebarWidth}px);
  // box-sizing: border-box;
`;

export const GradientBar = styled.div`
  height: 2px;
  width: 100%;
  background: linear-gradient(
    90deg,
    #99f7ff 0%,
    #0096fa 10%,
    #bf80ff 24%,
    #7300e5 50%,
    #bf80ff 76%,
    #0096fa 90%,
    #99f7ff 100%
  );
`;

export const ButtonContainer = styled.div`
  position: relative;
  display: inline-block;
`;

export const StyledButton = styled.button`
  padding: 3px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: ${(props) => (props.isactive ? "#007bff" : "#4A4A4A")};
  transition: all 0.2s ease;

  &:hover {
    background-color: ${(props) =>
      props.isactive ? colorBackgroundContainerContent : colorBackgroundContainerContent};
  }

  &:active {
    color: #007bff;
  }

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }
`;

export const StyledSimpleButton = styled.button`
  padding: 3px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #4a4a4a;
  transition: all 0.2s ease;

  &:hover {
    background-color: #f0f0f0;
  }

  &:active {
    color: #007bff;
  }

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }
`;

export const HoverLabel = styled.span`
  position: absolute;
  left: 100%;
  z-index: 1000;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 8px;
  color: #000000;
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  transition: opacity 0.2s ease;
  padding: 4px 8px; /* Add padding for the rectangular shape */
  background-color: white; /* Set background color */
  border: 1px solid #d3d3d3; /* Thin grey border */
  border-radius: 4px; /* Rounded edges */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1); /* Optional: Subtle shadow */

  ${ButtonContainer} & {
    background: ${colorBackgroundContainerContent};
  }

  ${ButtonContainer}:hover & {
    opacity: 1;
  }
`;

export const DropdownMenu = styled.div`
  position: absolute;
  ${(props) => (props.showAbove ? "bottom: 100%;" : "top: 100%;")}
  left: 0;
  z-index: 10000;
  min-width: 250px;
  background-color: ${colorBackgroundContainerContent};
  border: 2px solid ${colorBorderDropdownItemHover};
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-top: ${(props) => (props.showAbove ? "0" : "5px")};
  margin-bottom: ${(props) => (props.showAbove ? "5px" : "0")};
  overflow: hidden; /* prevents separators or hover borders from leaking */

  /* Divider lines between items */
  > *:not(:last-child) {
    position: relative;

    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1px; /* use solid 1px instead of 0.5px */
      background-color: ${colorBorderDropdownItemHover};
      z-index: 1;
    }
  }
`;

export const DropdownItem = styled.div`
  padding: 5px 15px 5px 25px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 6px;
  position: relative;
  z-index: 2;

  margin: -2px; /* Extend into container's border */
  width: calc(100% + 4px); /* Compensate for negative margins */

  &:hover {
    background-color: ${colorBackgroundDropdownItemHover};
    box-shadow: inset 0 0 0 2px ${colorBorderDropdownItemHover};
    z-index: 3;
  }
`;

export const DropdownHeader = styled.div`
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 25px;
  padding-right: 15px;
  font-weight: 600;
  color: ${colorTextButtonNormalDisabled};
  border-radius: 6px 6px 0 0;
  cursor: default; /* Prevents cursor from changing to pointer */
  user-select: none; /* Prevents text selection */
`;

export const DropdownContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

export const ButtonWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

export const DropdownStyledButton = styled.div`
  margin-top: 3px;
  padding: 3px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: ${(props) => (props.isactive ? "#007bff" : "#4A4A4A")};
  transition: all 0.2s ease;

  &:hover {
    background-color: ${(props) =>
      props.isoptionselected ? "#b3e4f8" : colorBackgroundLayoutToggleHover};
  }

  &:active {
    color: ${colorBackgroundButtonPrimaryDefault};
  }

  svg {
    width: 20px;
    height: 20px;
    display: block;
  }
`;

export const CodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000">
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path
        d="M17 7.82959L18.6965 9.35641C20.239 10.7447 21.0103 11.4389 21.0103 12.3296C21.0103 13.2203 20.239 13.9145 18.6965 15.3028L17 16.8296"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M13.9868 5L12.9934 8.70743M11.8432 13L10.0132 19.8297"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M7.00005 7.82959L5.30358 9.35641C3.76102 10.7447 2.98975 11.4389 2.98975 12.3296C2.98975 13.2203 3.76102 13.9145 5.30358 15.3028L7.00005 16.8296"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000">
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M12 17V11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
      <path
        d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"
        stroke="currentColor"
        strokeWidth="3"
      />
    </g>
  </svg>
);

export const GenAiIcon = () => (
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path
      d="M6.15 10.365 8 15.005l1.86-4.64 4.64-1.86-4.64-1.85L8 2.005l-1.85 4.65-4.65 1.85 4.65 1.86Z"
      stroke="currentColor"
      strokeWidth="var(--strokeWidth, 2)"
      fill="none"
      strokeLinejoin="round"
    ></path>
    <path
      d="M2.38 4.915c.02.05.07.08.12.08.05 0 .12-.08.12-.08l.66-1.64 1.64-.66a.13.13 0 0 0 .08-.12c0-.05-.08-.12-.08-.12l-1.64-.66-.66-1.64c-.04-.1-.2-.1-.24 0l-.66 1.64-1.64.66a.13.13 0 0 0-.08.12c0 .05.08.12.08.12l1.64.66.66 1.64Z"
      fill="currentColor"
      stroke="none"
    ></path>
  </svg>
);

export const CopyIcon = () => (
  <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
    <path
      d="M14 5H4v9h10V5Z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinejoin="round"
    />
    <path d="M12 2H2v9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
  </svg>
);

export const ShrinkIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(-45, 8, 8)">
      <path
        d="M2 4L6 8L2 12M14 4L10 8L14 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

export const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M21 21H4.6C4.03995 21 3.75992 21 3.54601 20.891C3.35785 20.7951 3.20487 20.6422 
   3.10899 20.454C3 20.2401 3 19.9601 3 19.4V3M21 7L15.5657 12.4343C15.3677 12.6323 
   15.2687 12.7313 15.1545 12.7684C15.0541 12.8011 14.9459 12.8011 14.8455 12.7684C14.7313 
   12.7313 14.6323 12.6323 14.4343 12.4343L12.5657 10.5657C12.3677 10.3677 12.2687 10.2687 
   12.1545 10.2316C12.0541 10.1989 11.9459 10.1989 11.8455 10.2316C11.7313 10.2687 11.6323 
   10.3677 11.4343 10.5657L7 15M21 7H17M21 7V11"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Bulb = ({ isEnabled = false, size = "16px" }) => (
  <svg
    viewBox="-0.5 0 25 25"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path
        d="M19.0006 9.03002C19.0007 8.10058 18.8158 7.18037 18.4565 6.32317C18.0972 5.46598 17.5709 4.68895 16.9081 4.03734C16.2453 3.38574 15.4594 2.87265 14.5962 2.52801C13.7331 2.18336 12.8099 2.01409 11.8806 2.03002C10.0966 2.08307 8.39798 2.80604 7.12302 4.05504C5.84807 5.30405 5.0903 6.98746 5.00059 8.77001C4.95795 9.9595 5.21931 11.1402 5.75999 12.2006C6.30067 13.2609 7.10281 14.1659 8.09058 14.83C8.36897 15.011 8.59791 15.2584 8.75678 15.5499C8.91565 15.8415 8.99945 16.168 9.00059 16.5V18.03H15.0006V16.5C15.0006 16.1689 15.0829 15.843 15.24 15.5515C15.3971 15.26 15.6241 15.0121 15.9006 14.83C16.8528 14.1911 17.6336 13.328 18.1741 12.3167C18.7147 11.3054 18.9985 10.1767 19.0006 9.03002V9.03002Z"
        stroke={isEnabled ? "#006ce0" : "#424650"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      ></path>
      <path
        d="M15 21.04C14.1345 21.6891 13.0819 22.04 12 22.04C10.9181 22.04 9.86548 21.6891 9 21.04"
        stroke={isEnabled ? "#006ce0" : "#424650"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      ></path>
    </g>
  </svg>
);
