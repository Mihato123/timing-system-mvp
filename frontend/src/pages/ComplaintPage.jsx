import { useState } from "react";
import { api } from "../services/api";

export default function ComplaintPage() {
  const [form, setForm] = useState({
    bibNumber: "",
    complaintType: "RESULT",
    complaintMessage: "",
    contactInfo: ""
  });

  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setMessage(null);
    setBusy(true);

    try {
      const response = await api(
        "/complaints",
        {
          method: "POST",
          body: JSON.stringify({
            bibNumber:
              form.bibNumber
                .trim()
                .toUpperCase(),

            complaintType:
              form.complaintType,

            complaintMessage:
              form.complaintMessage
                .trim(),

            contactInfo:
              form.contactInfo
                .trim()
          })
        }
      );

      setMessage({
        ok: true,
        text:
          `${response.message}. Mã khiếu nại #${response.data.ComplaintID}`
      });

      setForm({
        bibNumber: "",
        complaintType: "RESULT",
        complaintMessage: "",
        contactInfo: ""
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
    <div className="lookup-page">
      <a
        className="back"
        href="/"
      >
        ← RaceTimingPro
      </a>

      <form
        className="lookup-card complaint"
        onSubmit={handleSubmit}
      >
        <span className="kicker">
          ATHLETE SUPPORT
        </span>

        <h1>
          Khiếu nại kết quả
        </h1>

        <label>
          BIB

          <input
            name="bibNumber"
            value={form.bibNumber}
            onChange={handleChange}
            placeholder="Ví dụ BIB005"
            required
          />
        </label>

        <label>
          Nội dung

          <select
            name="complaintType"
            value={form.complaintType}
            onChange={handleChange}
          >
            <option value="RESULT">
              Kết quả
            </option>

            <option value="CHECKPOINT">
              Checkpoint
            </option>

            <option value="BIB">
              Thông tin BIB
            </option>

            <option value="OTHER">
              Khác
            </option>
          </select>
        </label>

        <label>
          Chi tiết

          <textarea
            name="complaintMessage"
            value={
              form.complaintMessage
            }
            onChange={handleChange}
            rows="5"
            placeholder="Mô tả nội dung cần BTC kiểm tra"
            required
          />
        </label>

        <label>
          Thông tin liên hệ

          <input
            name="contactInfo"
            value={
              form.contactInfo
            }
            onChange={handleChange}
            placeholder="Email hoặc số điện thoại"
          />
        </label>

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
            ? "ĐANG GỬI..."
            : "GỬI KHIẾU NẠI →"}
        </button>
      </form>
    </div>
  );
}