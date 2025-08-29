import React from "react";
import { CodeBlock } from "./CodeBlock";
import "./styles.css";
import { useTheme } from "../ThemeContext";

export const CodeRenderer = ({ children, className = "" }) => {
  const match = /language-(\w+)/.exec(className);
  return match ? (
    <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />
  ) : (
    <CodeBlock code={String(children).replace(/\n$/, "")} language="default" />
  );
};

export const CustomTable = ({ node, ...props }) => {
  const { effectiveTheme } = useTheme();
  return <table className={`custom-table ${effectiveTheme}`} {...props} />;
};
