import React, { useState } from "react";
import { signIn, confirmSignIn, resetPassword, confirmResetPassword } from "aws-amplify/auth";
import GenAiButton from "../ThreatModeling/GenAiButton";
import "./LoginForm.css";

const LoginForm = ({ onSignInSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formState, setFormState] = useState("signIn");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    isValid: false,
    requirements: {
      minLength: false,
      hasUpperCase: false,
      hasLowerCase: false,
      hasNumber: false,
      hasSpecialChar: false,
    },
  });

  const validatePassword = (password) => {
    const requirements = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    return {
      isValid: Object.values(requirements).every(Boolean),
      requirements,
    };
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setNewPassword(newPassword);
    setPasswordValidation(validatePassword(newPassword));
  };

  const handleSignIn = async (e) => {
    setLoading(true);
    e.preventDefault();
    setError("");
    try {
      const { isSignedIn, nextStep } = await signIn({ username, password });

      if (nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setFormState("newPassword");
      } else if (isSignedIn) {
        onSignInSuccess?.();
      }
    } catch (error) {
      setError(error.message || "Error signing in");
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e) => {
    setLoading(true);
    e.preventDefault();
    setError("");
    try {
      const { isSignedIn } = await confirmSignIn({
        challengeResponse: newPassword,
      });
      if (isSignedIn) {
        onSignInSuccess?.();
      }
    } catch (error) {
      setError(error.message || "Error setting new password");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    setLoading(true);
    e.preventDefault();
    setError("");
    try {
      await resetPassword({ username });
      setConfirmNewPassword("");
      setNewPassword("");
      setFormState("resetPassword");
    } catch (error) {
      setError(error.message || "Error initiating password reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {formState === "signIn" && (
        <div className="form-container">
          <h2>Sign In</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="forgot-password-link">
              <a href="#" onClick={() => setFormState("forgotPassword")}>
                Forgot Password?
              </a>
            </div>
            <div className="button-group">
              <GenAiButton loading={loading}>Sign In</GenAiButton>
            </div>
          </form>
        </div>
      )}

      {formState === "newPassword" && (
        <div className="form-container">
          <h2>Set New Password</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleNewPassword}>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={handlePasswordChange} required />
            </div>
            <div className="button-group">
              <GenAiButton loading={loading} disabled={!passwordValidation.isValid}>
                Set New Password
              </GenAiButton>
            </div>
          </form>
        </div>
      )}

      {formState === "forgotPassword" && (
        <div className="form-container">
          <h2>Reset Password</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleForgotPassword}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="button-group">
              <GenAiButton loading={loading}>Send Reset Code</GenAiButton>
            </div>
          </form>
        </div>
      )}

      {formState === "resetPassword" && (
        <div className="form-container">
          <h2>Reset Password</h2>
          {error && <div className="error-message">{error}</div>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (newPassword !== confirmNewPassword) {
                setError("Passwords do not match");
                return;
              }
              if (!passwordValidation.isValid) {
                setError("Password does not meet requirements");
                return;
              }
              try {
                await confirmResetPassword({
                  username,
                  confirmationCode,
                  newPassword,
                });
                setFormState("signIn");
              } catch (error) {
                setError(error.message || "Error resetting password");
              }
            }}
          >
            <div className="form-group">
              <label>Confirmation Code</label>
              <input
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={handlePasswordChange} required />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="button-group">
              <GenAiButton
                loading={loading}
                disabled={
                  !passwordValidation.isValid ||
                  !confirmationCode ||
                  newPassword !== confirmNewPassword
                }
              >
                Reset Password
              </GenAiButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default LoginForm;
