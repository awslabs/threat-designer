import React, { useState, useRef, useEffect } from "react";
import {
  StyledButton,
  HoverLabel,
  ButtonContainer,
  DropdownMenu,
  DropdownItem,
  DropdownContainer,
  ButtonWrapper,
  DropdownStyledButton,
  DropdownHeader,
} from "./CustomStyles";
import { Icon as CsIcon } from "@cloudscape-design/components";

export const CustomButton = ({ onClick, icon: Icon, tooltip, isactive = false }) => {
  const handleClick = () => {
    if (onClick) onClick();
  };

  return (
    <ButtonContainer>
      <StyledButton
        isactive={isactive}
        onClick={handleClick}
        aria-label="Toggle code view"
        aria-pressed={isactive}
      >
        {Icon}
      </StyledButton>
      <HoverLabel isactive={isactive}>{tooltip}</HoverLabel>
    </ButtonContainer>
  );
};

export const CustomSimpleButton = ({ onClick, icon: Icon, tooltip }) => (
  <ButtonContainer>
    <StyledButton onClick={onClick} aria-label={tooltip}>
      {Icon}
    </StyledButton>
    <HoverLabel>{tooltip}</HoverLabel>
  </ButtonContainer>
);

export const CustomDropdownButton = ({
  icon: Icon,
  tooltip,
  onSelect,
  isactive = false,
  disabled = false,
}) => {
  const PRIORITY_OPTIONS = [
    { value: 0, label: "None" },
    { value: 1, label: "Low" },
    { value: 2, label: "Medium" },
    { value: 3, label: "High" },
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(PRIORITY_OPTIONS[0]);
  const [showAbove, setShowAbove] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const isoptionselected = selectedOption.value !== 0;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen && buttonRef.current && menuRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const menuHeight = menuRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;

      // If not enough space below, show above
      setShowAbove(spaceBelow < menuHeight + 10); // 10px buffer
    }
  }, [isOpen]);

  const handleToggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (option) => {
    if (!disabled) {
      setSelectedOption(option);
      if (onSelect) onSelect(option);
      setIsOpen(false);
    }
  };

  return (
    <DropdownContainer ref={dropdownRef}>
      <ButtonWrapper
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <DropdownStyledButton
          ref={buttonRef}
          isactive={isactive || isOpen}
          isoptionselected={isoptionselected}
          onClick={handleToggleDropdown}
          aria-label={tooltip}
          aria-expanded={isOpen}
          aria-haspopup="true"
          disabled={disabled}
          style={{
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "default" : "pointer",
            background: disabled ? "transparent" : undefined,
            pointerEvents: disabled ? "none" : "auto",
          }}
        >
          {typeof Icon === "function" ? <Icon isEnabled={isoptionselected && !disabled} /> : Icon}
        </DropdownStyledButton>
        {isHovering && <HoverLabel isactive={isactive}>{tooltip}</HoverLabel>}
      </ButtonWrapper>

      {isOpen && !disabled && (
        <DropdownMenu ref={menuRef} showAbove={showAbove}>
          <DropdownHeader>Reasoning</DropdownHeader>
          {PRIORITY_OPTIONS.map((option, index) => (
            <DropdownItem
              key={index}
              onClick={() => {
                handleSelect(option);
                onSelect(option);
              }}
            >
              {option.label}
              {selectedOption.value === option.value && <CsIcon name="check" variant="link" />}
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </DropdownContainer>
  );
};
