// src/pages/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import botImage from "../assets/bot.png";  // ✅ ensure this path is correct

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
      if (email === "admin@exacoda.com" && password === "12345") {
        setAuthState("success");
        navigate("/dashboard"); // 👈 redirect after login
      } else {
        setAuthState("error");
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="login-page">
      {/* Left side: Login card */}
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

          <button className="gmail-login">Login with Gmail</button>
          <button className="signin-btn">Sign In</button>
        </div>
      </div>

      {/* Right side: Bot image */}
      <div className="login-right">
        <img src={botImage} alt="Bot" />
      </div>
    </div>
  );
}
