import React, { useState } from "react";
import GenAiButton from "../ThreatModeling/GenAiButton";
import Shield from "../ThreatModeling/images/shield.png";
import { useTheme } from "../ThemeContext";
import styled from "@emotion/styled";
import "./LoginForm.css";

const Title = styled.h1`
  font-size: 26px;
  font-weight: 200;
  margin-bottom: 40px;
`;

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
];

const CredentialsForm = ({ onCredentialsSubmit }) => {
  const { isDark } = useTheme();
  const [provider, setProvider] = useState("bedrock");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate provider-specific required fields
    if (provider === "bedrock") {
      if (!accessKeyId.trim()) {
        setError("AWS Access Key ID is required");
        setLoading(false);
        return;
      }

      if (!secretAccessKey.trim()) {
        setError("AWS Secret Access Key is required");
        setLoading(false);
        return;
      }

      if (!region) {
        setError("AWS Region is required");
        setLoading(false);
        return;
      }
    } else if (provider === "openai") {
      if (!openaiApiKey.trim()) {
        setError("OpenAI API Key is required");
        setLoading(false);
        return;
      }
    }

    try {
      const credentials = {
        provider: provider,
      };

      // Add provider-specific credentials
      if (provider === "bedrock") {
        credentials.accessKeyId = accessKeyId.trim();
        credentials.secretAccessKey = secretAccessKey.trim();
        credentials.sessionToken = sessionToken.trim() || null;
        credentials.region = region;
      } else if (provider === "openai") {
        credentials.openaiApiKey = openaiApiKey.trim();
      }

      // Call the parent handler
      await onCredentialsSubmit?.(credentials);
    } catch (err) {
      setError(err.message || "Failed to configure credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-container ${isDark ? "dark-theme" : "light-theme"}`}>
      <div className="form-container">
        <img
          src={Shield}
          alt="Threat Designer logo"
          style={{ width: "80px", marginBottom: "10px" }}
        />
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "14px",
                background: "transparent",
                border: "1px solid rgba(180, 180, 180, 0.3)",
                outline: "none",
                boxSizing: "border-box",
                height: "40px",
                color: isDark ? "#ffffff" : "#333333",
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(248, 249, 250, 0.8)",
              }}
            >
              <option value="bedrock">Amazon Bedrock</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {provider === "bedrock" && (
            <>
              <div className="form-group">
                <label>AWS Access Key ID</label>
                <input
                  type="password"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="Enter your AWS Access Key ID"
                  required
                />
              </div>
              <div className="form-group">
                <label>AWS Secret Access Key</label>
                <input
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder="Enter your AWS Secret Access Key"
                  required
                />
              </div>
              <div className="form-group">
                <label>AWS Session Token (Optional)</label>
                <input
                  type="password"
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  placeholder="Enter your AWS Session Token (if using temporary credentials)"
                />
              </div>
              <div className="form-group">
                <label>AWS Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    background: "transparent",
                    border: "1px solid rgba(180, 180, 180, 0.3)",
                    outline: "none",
                    boxSizing: "border-box",
                    height: "40px",
                    color: isDark ? "#ffffff" : "#333333",
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(248, 249, 250, 0.8)",
                  }}
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {provider === "openai" && (
            <div className="form-group">
              <label>OpenAI API Key</label>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="Enter your OpenAI API Key"
                required
              />
            </div>
          )}
          <div className="button-group">
            <GenAiButton loading={loading}>Start Lightning Mode</GenAiButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CredentialsForm;
