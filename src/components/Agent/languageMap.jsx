import cppHighlight from "@cloudscape-design/code-view/highlight/cpp";
import csharpHighlight from "@cloudscape-design/code-view/highlight/csharp";
import cssHighlight from "@cloudscape-design/code-view/highlight/css";
import goHighlight from "@cloudscape-design/code-view/highlight/go";
import htmlHighlight from "@cloudscape-design/code-view/highlight/html";
import javaHighlight from "@cloudscape-design/code-view/highlight/java";
import javascriptHighlight from "@cloudscape-design/code-view/highlight/javascript";
import jsonHighlight from "@cloudscape-design/code-view/highlight/json";
import kotlinHighlight from "@cloudscape-design/code-view/highlight/kotlin";
import markdownHighlight from "@cloudscape-design/code-view/highlight/markdown";
import phpHighlight from "@cloudscape-design/code-view/highlight/php";
import pythonHighlight from "@cloudscape-design/code-view/highlight/python";
import rubyHighlight from "@cloudscape-design/code-view/highlight/ruby";
import rustHighlight from "@cloudscape-design/code-view/highlight/rust";
import shHighlight from "@cloudscape-design/code-view/highlight/sh";
import typescriptHighlight from "@cloudscape-design/code-view/highlight/typescript";
import xmlHighlight from "@cloudscape-design/code-view/highlight/xml";
import yamlHighlight from "@cloudscape-design/code-view/highlight/yaml";
import { TerraformHighlightRules } from "ace-code/src/mode/terraform_highlight_rules";
import { SqlHighlightRules } from "ace-code/src/mode/sql_highlight_rules";
import { createHighlight } from "@cloudscape-design/code-view/highlight";

const terraformHighlight = createHighlight(new TerraformHighlightRules());
const SqlHighlight = createHighlight(new SqlHighlightRules());

export const languageMap = {
  cpp: cppHighlight,
  csharp: csharpHighlight,
  css: cssHighlight,
  go: goHighlight,
  html: htmlHighlight,
  java: javaHighlight,
  javascript: javascriptHighlight,
  json: jsonHighlight,
  kotlin: kotlinHighlight,
  markdown: markdownHighlight,
  php: phpHighlight,
  python: pythonHighlight,
  ruby: rubyHighlight,
  rust: rustHighlight,
  sh: shHighlight,
  typescript: typescriptHighlight,
  xml: xmlHighlight,
  yaml: yamlHighlight,
  bash: shHighlight,
  zsh: shHighlight,
  yml: yamlHighlight,
  hcl: terraformHighlight,
  sql: SqlHighlight,
};
