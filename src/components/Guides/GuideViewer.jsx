import { useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { CodeRenderer, CustomTable } from "@/components/Agent/MarkDownRenderers";
import { getGuide } from "@/data/guides";
import "./GuideViewer.css";

export function GuideViewer() {
  const { slug } = useParams();
  const navigate = useNavigate();

  // Get guide data from imported modules
  const guide = useMemo(() => getGuide(slug), [slug]);
  const content = guide?.content || "";
  const error = !guide && slug ? "Guide not found" : null;

  // Scroll the app layout container to top when guide changes
  useEffect(() => {
    const appLayoutContainer = document.querySelector(".app-layout-container");
    if (appLayoutContainer) {
      appLayoutContainer.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [slug]);

  // Custom link renderer to handle .md links
  const LinkRenderer = ({ href, children, ...props }) => {
    const handleClick = (e) => {
      // Check if it's a relative link ending with .md
      if (href && href.endsWith(".md") && !href.startsWith("http")) {
        e.preventDefault();
        // Strip .md and navigate to the guide
        const guideName = href.replace(".md", "");
        navigate(`/guides/${guideName}`);
      }
    };

    // For external links or non-.md links, render normally
    if (!href || !href.endsWith(".md") || href.startsWith("http")) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }

    // For .md links, make them clickable and strip the extension
    return (
      <a
        href={href}
        onClick={handleClick}
        style={{ cursor: "pointer", color: "var(--color-primary)", textDecoration: "underline" }}
        {...props}
      >
        {children}
      </a>
    );
  };

  if (error) {
    return (
      <div className="guide-viewer">
        <div className="guide-error">
          <h2>Guide Not Found</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="guide-viewer">
      <div className="guide-content">
        <Markdown
          children={content}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            code: CodeRenderer,
            table: CustomTable,
            a: LinkRenderer,
          }}
        />
      </div>
    </div>
  );
}

export default GuideViewer;
