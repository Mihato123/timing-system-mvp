import { useState } from "react";
import { api } from "../services/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!username.trim() || !password) {
      setErrorMessage("Vui lòng nhập đầy đủ tài khoản và mật khẩu.");
      return;
    }

    setBusy(true);

    try {
      const response = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      const session = {
        ...response.data.user,
        token: response.data.token,
        name: response.data.user.DisplayName,
        role: response.data.user.Role
      };

      localStorage.setItem("raceSession", JSON.stringify(session));
      window.location.href = "/admin";
    } catch (error) {
      if (error.message?.toLowerCase().includes("mật khẩu")) {
        setErrorMessage("Tài khoản hoặc mật khẩu không đúng. Vui lòng thử lại.");
      } else {
        setErrorMessage(error.message || "Không thể đăng nhập. Vui lòng thử lại.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page-pro">
      <div className="login-ambient login-ambient-one" />
      <div className="login-ambient login-ambient-two" />

      <form className="login-card-pro" onSubmit={handleSubmit}>
        <div className="login-logo-pro">R</div>
        <p className="login-kicker">RACE OPERATIONS PLATFORM</p>
        <h1>Race Timing Pro</h1>
        <p className="login-subtitle">Đăng nhập hệ thống vận hành giải chạy</p>

        <label htmlFor="username">Tài khoản</label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="Nhập tài khoản"
          disabled={busy}
        />

        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          disabled={busy}
        />

        {errorMessage && (
          <div className="login-error" role="alert">
            {errorMessage}
          </div>
        )}

        <button className="login-submit" disabled={busy}>
          {busy ? "ĐANG ĐĂNG NHẬP..." : "ĐĂNG NHẬP →"}
        </button>

        <p className="login-security-note">
          Khu vực dành cho Ban Tổ Chức và bộ phận vận hành được phân quyền.
        </p>
      </form>
    </div>
  );
}
