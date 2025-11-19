import LoadingBar from "@cloudscape-design/chat-components/loading-bar";
import "./NebulaLoader.css";

/**
 * NebulaLoader - A loading component with CloudScape LoadingBar
 * @param {Object} props
 * @param {string} [props.message] - Optional status message to display
 */
export default function NebulaLoader() {
  return (
    <div className="nebula-loader-container">
      <div className="nebula-loader-bar-container">
        <LoadingBar variant="gen-ai-masked" />
      </div>
    </div>
  );
}
