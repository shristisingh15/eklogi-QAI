import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { auth } from "../auth"; // 👈 import auth

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authState, setAuthState] = useState<"idle" | "success" | "error">("idle");

  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthState("idle");

    setTimeout(() => {
      if (email === "admin@eklogi.com" && password === "admin123") {
        auth.login(email); // ✅ save login state + email
        setAuthState("success");
        navigate("/dashboard");
      } else {
        setAuthState("error");
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-card">
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />

            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
            </button>

            {authState === "error" && <p className="error">Invalid credentials</p>}
          </form>

          <button className="gmail-login">Login with Single Sign-On</button>
          <button className="signin-btn">Sign up</button>
        </div>
      </div>
    </div>
  );
}
