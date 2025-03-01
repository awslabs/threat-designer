import Textarea from "@cloudscape-design/components/textarea";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Button from "@cloudscape-design/components/button";
import React, { useEffect, useRef, useState } from "react";
import "./TextAreaComponent.css";
import { SpaceBetween } from "@cloudscape-design/components";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Popover from "@cloudscape-design/components/popover";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

const TextAreaComponent = ({ onChange, value }) => {
  const [isVisible, setIsVisible] = useState(false);
  const buttonWrapperRef = useRef(null);
  const containerRef = useRef(null);
  const [position, setPosition] = useState(null);

  const AnnotatePop = ({ content }) => {
    return (
      <Box color="text-status-info">
        <Popover header="Annotation" content={content}>
          <StatusIndicator type="info">Annotation</StatusIndicator>
        </Popover>
      </Box>
    );
  };

  const updatePosition = () => {
    if (buttonWrapperRef.current) {
      const buttonRect = buttonWrapperRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const margin = 20;

      let leftPosition = buttonRect.right;

      if (leftPosition > viewportWidth - margin) {
        leftPosition = viewportWidth - margin;
      }

      setPosition({
        top: buttonRect.top,
        left: Math.max(margin, leftPosition),
      });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }
  }, [isVisible]);

  const handleDropdownClick = (detail) => {
    if (detail.id === "open") {
      setIsVisible(!isVisible);
    }
    if (detail.id === "delete") {
      onChange("");
    }
  };

  return (
    <>
      <div ref={buttonWrapperRef}>
        <SpaceBetween direction="horizontal">
          <ButtonDropdown
            items={[
              { id: "edit", text: "Edit", disabled: true },
              {
                text: "Annotation",
                items: [
                  { id: "open", text: "Open", disabled: false },
                  { id: "delete", text: "Delete", disabled: false },
                ],
              },
              // { id: "annotate", text: "Annotate", disabled: false },
              // {}
            ]}
            ariaLabel="Options"
            variant="icon"
            onItemClick={({ detail }) => handleDropdownClick(detail)}
          ></ButtonDropdown>
          {value().length > 0 && (
            <div style={{ marginTop: "5px" }}>
              <AnnotatePop content={value()} />
            </div>
          )}
        </SpaceBetween>
      </div>
      {/* 
            {isVisible && position && (
                <div 
                    className="textarea-container" 
                    ref={containerRef}
                    style={{
                        position: 'fixed',
                        top: `${position.top}px`,
                        left: `${position.left}px`
                    }}
                >
                    <SpaceBetween size="xxxs">
                    <Button iconName="close" variant="icon" onClick={() => setIsVisible(false)}/>
                    <Textarea
                        onChange={({ detail }) => onChange(detail.value)}
                        value={value()}
                        rows={4}
                        placeholder="Start typing..."
                    />
                    </SpaceBetween>
                </div>
            )} */}
      <Modal
        onDismiss={() => setIsVisible(false)}
        visible={isVisible}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" onClick={() => setIsVisible(false)}>
                Ok
              </Button>
            </SpaceBetween>
          </Box>
        }
        header="Annotate"
      >
        <Textarea
          onChange={({ detail }) => onChange(detail.value)}
          value={value()}
          rows={4}
          placeholder="Start typing..."
        />
      </Modal>
    </>
  );
};

export default TextAreaComponent;
