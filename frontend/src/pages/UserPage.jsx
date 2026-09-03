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
  medicalNotes: "",
  waiverAccepted: false
};

export default function UserPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const handleChange = (event) => {
    const {
      name,
      value,
      type,
      checked
    } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        type === "checkbox"
          ? checked
          : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (!form.waiverAccepted) {
      setMessage({
        ok: false,
        text:
          "Vui lòng xác nhận bạn đã đọc và đồng ý với Điều khoản tham gia giải."
      });

      return;
    }

    setBusy(true);

    try {
      const response = await api(
        "/registrations",
        {
          method: "POST",
          body: JSON.stringify(form)
        }
      );

      setMessage({
        ok: true,
        text:
          `Đăng ký thành công. BIB của bạn: ${response.data.bibNumber}`
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
          <a href="/">
            Đăng ký
          </a>

          <a href="/athlete">
            Tra cứu VĐV
          </a>

          <a href="/results">
            Kết quả
          </a>

          <a href="/complaint">
            Khiếu nại
          </a>
        </nav>
      </header>

      <main className="public-main">
        <section className="hero">
          <span>
            DEMO MARATHON 2026
          </span>

          <h1>
            Chinh phục đường chạy.
          </h1>

          <div className="hero-accent-line" />
        </section>

        <form
          className="registration-card"
          onSubmit={handleSubmit}
          autoComplete="on"
        >
          <div>
            <span className="kicker">
              ATHLETE REGISTRATION
            </span>

            <h2>
              Đăng ký tham gia
            </h2>
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

              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
              >
                <option>Nam</option>
                <option>Nữ</option>
                <option>Khác</option>
              </select>
            </label>

            <label>
              Cự ly

              <select
                name="distance"
                value={form.distance}
                onChange={handleChange}
              >
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
              checked={
                form.hasMedicalCondition
              }
              onChange={handleChange}
            />

            Tôi có tình trạng sức khỏe
            cần BTC/Y tế lưu ý
          </label>

          {form.hasMedicalCondition && (
            <div className="form-grid">
              <label>
                Tình trạng sức khỏe

                <input
                  name="medicalCondition"
                  value={
                    form.medicalCondition
                  }
                  onChange={handleChange}
                  placeholder="Nhập tình trạng cần lưu ý"
                  required
                />
              </label>

              <label>
                Ghi chú y tế

                <input
                  name="medicalNotes"
                  value={
                    form.medicalNotes
                  }
                  onChange={handleChange}
                  placeholder="Ghi chú thêm nếu có"
                />
              </label>
            </div>
          )}

          {/* =========================
              TERMS
          ========================== */}

          <div
            style={{
              marginTop: "4px",
              padding: "16px 18px",
              border:
                "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              background:
                "rgba(255,255,255,0.025)"
            }}
          >
            <div
              style={{
                marginBottom: "12px"
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "15px",
                  marginBottom: "4px"
                }}
              >
                Điều khoản tham gia giải
              </div>

           <div
                style={{
            fontSize: "12px",
            lineHeight: 1.4,
            opacity: 0.72,
            whiteSpace: "nowrap"
            }}
             >                
             Vui lòng đọc kỹ các điều khoản về sức khỏe, an toàn và trách nhiệm khi tham gia.
            </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setTermsOpen(true)
              }
              style={{
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                color: "#7fb7ff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "4px"
              }}
            >
              Xem điều khoản tham gia
            </button>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                marginTop: "16px",
                cursor: "pointer",
                fontSize: "13px",
                lineHeight: 1.5
              }}
            >
              <input
                type="checkbox"
                name="waiverAccepted"
                checked={
                  form.waiverAccepted
                }
                onChange={handleChange}
                style={{
                  marginTop: "3px"
                }}
              />

              <span>
                Tôi xác nhận đã đọc, hiểu
                và đồng ý với{" "}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setTermsOpen(true);
                  }}
                  style={{
                    padding: 0,
                    border: "none",
                    background:
                      "transparent",
                    color: "#7fb7ff",
                    cursor: "pointer",
                    font: "inherit",
                    textDecoration:
                      "underline",
                    textUnderlineOffset:
                      "3px"
                  }}
                >
                  Điều khoản tham gia giải
                </button>
                .
              </span>
            </label>
          </div>

          {message && (
            <div
              className={
                message.ok
                  ? "notice success"
                  : "notice error"
              }
            >
              {message.text}
            </div>
          )}

          <button
            className="public-cta"
            disabled={busy}
          >
            {busy
              ? "ĐANG XỬ LÝ..."
              : "HOÀN TẤT ĐĂNG KÝ →"}
          </button>
        </form>
      </main>

      {/* =========================
          TERMS MODAL
      ========================== */}

      {termsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "rgba(0, 0, 0, 0.76)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
          onClick={() =>
            setTermsOpen(false)
          }
        >
          <div
            style={{
              width: "min(760px, 100%)",
              maxHeight: "88vh",
              background: "#101d31",
              border:
                "1px solid rgba(255,255,255,0.12)",
              borderRadius: "14px",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                padding: "22px 26px",
                borderBottom:
                  "1px solid rgba(255,255,255,0.09)"
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "1.3px",
                  color: "#ff6b2c",
                  marginBottom: "6px"
                }}
              >
                DEMO MARATHON 2026
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "24px"
                }}
              >
                Điều khoản tham gia giải
              </h2>

              <p
                style={{
                  margin:
                    "7px 0 0",
                  fontSize: "13px",
                  opacity: 0.7
                }}
              >
                Vui lòng đọc kỹ trước khi
                xác nhận đăng ký.
              </p>
            </div>

            <div
              style={{
                padding: "24px 26px",
                overflowY: "auto",
                lineHeight: 1.75,
                fontSize: "14px"
              }}
            >
              <p>
                Khi đăng ký tham gia giải,
                tôi xác nhận rằng các thông
                tin cá nhân và thông tin
                sức khỏe mà tôi cung cấp là
                chính xác trong phạm vi tôi
                biết.
              </p>

              <h3>
                1. Tình trạng sức khỏe
              </h3>

              <p>
                Tôi có trách nhiệm tự đánh
                giá tình trạng thể chất của
                mình trước khi tham gia.
                Trong trường hợp có bệnh
                nền, tiền sử tim mạch, hô
                hấp, huyết áp, chấn thương
                hoặc các vấn đề sức khỏe
                khác có thể ảnh hưởng đến
                quá trình thi đấu, tôi có
                trách nhiệm khai báo với
                Ban tổ chức.
              </p>

              <h3>
                2. Nhận thức về rủi ro
              </h3>

              <p>
                Tôi hiểu rằng hoạt động
                chạy bộ và thể thao sức bền
                có thể phát sinh các rủi ro
                như té ngã, chấn thương,
                mất nước, kiệt sức, sốc
                nhiệt, các vấn đề về tim
                mạch, hô hấp hoặc những
                biến cố sức khỏe khác.
              </p>

              <p>
                Một số biến cố sức khỏe
                nghiêm trọng có thể dẫn đến
                thương tật nghiêm trọng
                hoặc tử vong. Tôi xác nhận
                đã nhận thức được những rủi
                ro có thể phát sinh khi
                quyết định tham gia giải.
              </p>

              <h3>
                3. Trách nhiệm của VĐV
              </h3>

              <p>
                Tôi có trách nhiệm chuẩn bị
                thể lực phù hợp, tuân thủ
                lộ trình, các quy định của
                giải và những hướng dẫn an
                toàn của Ban tổ chức.
              </p>

              <p>
                Khi nhận thấy các dấu hiệu
                sức khỏe bất thường, tôi có
                trách nhiệm thông báo và
                hợp tác với đội ngũ y tế.
              </p>

              <h3>
                4. Can thiệp y tế
              </h3>

              <p>
                Trong trường hợp phát hiện
                dấu hiệu có nguy cơ ảnh
                hưởng đến sức khỏe hoặc an
                toàn của VĐV, đội ngũ y tế
                có thể tiến hành kiểm tra,
                đánh giá và đề nghị VĐV tạm
                dừng hoặc dừng thi đấu.
              </p>

              <p>
                Tôi đồng ý tuân thủ quyết
                định chuyên môn của đội ngũ
                y tế nhằm đảm bảo an toàn
                trong quá trình tham gia.
              </p>

              <h3>
                5. Điều kiện khách quan
              </h3>

              <p>
                Tôi hiểu rằng dù Ban tổ
                chức thực hiện các biện pháp
                hợp lý nhằm đảm bảo an toàn,
                những rủi ro liên quan đến
                hoạt động thể thao, điều
                kiện thời tiết, môi trường,
                thể trạng cá nhân hoặc các
                tình huống khách quan khác
                không phải lúc nào cũng có
                thể được loại bỏ hoàn toàn.
              </p>

              <h3>
                6. Xác nhận tham gia
              </h3>

              <p>
                Tôi xác nhận việc tham gia
                giải là quyết định tự
                nguyện. Tôi đã đọc và hiểu
                các nội dung liên quan đến
                sức khỏe, an toàn, các rủi
                ro có thể phát sinh và
                trách nhiệm của mình trong
                quá trình tham gia.
              </p>

              <p>
                Tôi đồng ý tuân thủ các quy
                định, hướng dẫn vận hành,
                quy trình an toàn và quyết
                định chuyên môn của Ban tổ
                chức và đội ngũ y tế trong
                phạm vi giải chạy.
              </p>
            </div>

            <div
              style={{
                padding: "16px 26px",
                borderTop:
                  "1px solid rgba(255,255,255,0.09)",
                display: "flex",
                justifyContent: "flex-end"
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setTermsOpen(false)
                }
                style={{
                  minWidth: "110px",
                  padding: "11px 20px",
                  borderRadius: "8px",
                  border:
                    "1px solid rgba(255,255,255,0.18)",
                  background:
                    "rgba(255,255,255,0.04)",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}