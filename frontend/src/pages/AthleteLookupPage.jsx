import { useState } from "react";
import { api } from "../services/api";
import StatusBadge from "../components/StatusBadge";

export default function AthleteLookupPage() {
  const [bib, setBib] = useState("");
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLookup = async (event) => {
    event.preventDefault();

    const normalizedBib =
      bib.trim().toUpperCase();

    if (!normalizedBib) {
      setAthlete(null);
      setError("Vui lòng nhập BIB");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await api(
        `/public/athletes/${normalizedBib}`
      );

      setAthlete(response.data);
    } catch (error) {
      setAthlete(null);
      setError(error.message);
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

      <div className="lookup-card">
        <span className="kicker">
          ATHLETE PORTAL
        </span>

        <h1>
          Tra cứu vận động viên
        </h1>

        <form
          className="lookup-form"
          onSubmit={handleLookup}
        >
          <input
            value={bib}
            onChange={(event) =>
              setBib(event.target.value)
            }
            placeholder="Nhập BIB, ví dụ BIB005"
          />

          <button
            type="submit"
            disabled={busy}
          >
            {busy
              ? "ĐANG TRA CỨU..."
              : "TRA CỨU"}
          </button>
        </form>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        {athlete && (
          <div className="athlete-profile">
            <div>
              <small>BIB</small>

              <strong>
                {athlete.bibNumber}
              </strong>
            </div>

            <div>
              <small>
                Vận động viên
              </small>

              <strong>
                {athlete.fullName}
              </strong>
            </div>

            <div>
              <small>
                Cự ly
              </small>

              <strong>
                {athlete.distance}
              </strong>
            </div>

            <div>
              <small>
                Giới tính
              </small>

              <strong>
                {athlete.gender || "-"}
              </strong>
            </div>

            <div>
              <small>
                Số điện thoại
              </small>

              <strong>
                {athlete.phone || "-"}
              </strong>
            </div>

            <div>
              <small>
                Email
              </small>

              <strong>
                {athlete.email || "-"}
              </strong>
            </div>

            <div>
              <small>
                Đăng ký
              </small>

              <StatusBadge
                status={
                  athlete.registrationStatus
                }
              />
            </div>

            <div>
              <small>
                Cuộc đua
              </small>

              <StatusBadge
                status={
                  athlete.runStatus ||
                  "NOT_STARTED"
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}