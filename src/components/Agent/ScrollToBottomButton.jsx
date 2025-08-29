import { ScrollButton } from "./ScrollButton";
import React, { useState, useEffect, memo } from "react";

const ScrollToBottomButton = memo(function ScrollToBottomButton({ scroll }) {
  return (
    <div className="scroll-view">
      <ScrollButton onClick={scroll} />
    </div>
  );
});

export default ScrollToBottomButton;
