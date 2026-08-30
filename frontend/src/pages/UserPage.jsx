import { useState } from "react";
import { api } from "../services/api";

const initialForm = {
  fullName: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  gender: "Nam",
  distance: "10KM",
  hasMedicalCondition: false,
  medicalCondition: "",
  medicalNotes: ""
};

export default function UserPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await api("/registrations", {
        method: "POST",
        body: JSON.stringify(form)
      });

      setMessage({
        ok: true,
        text: `Đăng ký thành công. BIB của bạn: ${response.data.bibNumber}`
      });
    } catch (error) {
      setMessage({
        ok: false,
        text: error.message
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="athlete-site">
      <header className="public-nav">
        <b>» RaceTimingPro</b>

        <nav>
          <a href="/">Đăng ký</a>
          <a href="/athlete">Tra cứu VĐV</a>
          <a href="/results">Kết quả</a>
          <a href="/complaint">Khiếu nại</a>
        </nav>
      </header>

      <main className="public-main">
        <section className="hero">
          <span>DEMO MARATHON 2026</span>
          <h1>Chinh phục đường chạy.</h1>
          <div className="hero-accent-line" />
        </section>

        <form className="registration-card" onSubmit={handleSubmit} autoComplete="on">
          <div>
            <span className="kicker">ATHLETE REGISTRATION</span>
            <h2>Đăng ký tham gia</h2>
          </div>

          <div className="form-grid">
            <label>
              Họ và tên
              <input
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                autoComplete="name"
                placeholder="Nhập họ và tên"
                required
              />
            </label>

            <label>
              Số điện thoại
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
                placeholder="Nhập số điện thoại"
                required
              />
            </label>

            <label>
              Ngày sinh
              <input
                type="date"
                name="dateOfBirth"
                value={form.dateOfBirth}
                onChange={handleChange}
                autoComplete="bday"
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                placeholder="Nhập email"
              />
            </label>

            <label>
              Giới tính
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option>Nam</option>
                <option>Nữ</option>
                <option>Khác</option>
              </select>
            </label>

            <label>
              Cự ly
              <select name="distance" value={form.distance} onChange={handleChange}>
                <option>5KM</option>
                <option>10KM</option>
                <option>21KM</option>
                <option>42KM</option>
              </select>
            </label>
          </div>

          <label className="health-check">
            <input
              type="checkbox"
              name="hasMedicalCondition"
              checked={form.hasMedicalCondition}
              onChange={handleChange}
            />
            Tôi có tình trạng sức khỏe cần BTC/Y tế lưu ý
          </label>

          {form.hasMedicalCondition && (
            <div className="form-grid">
              <label>
                Tình trạng sức khỏe
                <input
                  name="medicalCondition"
                  value={form.medicalCondition}
                  onChange={handleChange}
                  placeholder="Nhập tình trạng cần lưu ý"
                  required
                />
              </label>

              <label>
                Ghi chú y tế
                <input
                  name="medicalNotes"
                  value={form.medicalNotes}
                  onChange={handleChange}
                  placeholder="Ghi chú thêm nếu có"
                />
              </label>
            </div>
          )}

          {message && (
            <div className={message.ok ? "notice success" : "notice error"}>
              {message.text}
            </div>
          )}

          <button className="public-cta" disabled={busy}>
            {busy ? "ĐANG XỬ LÝ..." : "HOÀN TẤT ĐĂNG KÝ →"}
          </button>
        </form>
      </main>
    </div>
  );
}
