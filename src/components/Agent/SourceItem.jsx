import { ExternalLink } from "lucide-react";

const SourceItem = ({ title, url, favicon, showExternalLink = true }) => (
  <a href={url} target="_blank" rel="noopener noreferrer" className="source-item">
    {favicon ? (
      <img
        src={favicon}
        alt=""
        className="source-favicon"
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    ) : (
      <div className="source-favicon-placeholder" />
    )}
    <span className="source-title">{title}</span>
    {showExternalLink && <ExternalLink size={12} className="source-external-icon" />}
  </a>
);

export default SourceItem;
