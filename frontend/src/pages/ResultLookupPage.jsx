import { useState } from "react";
import { api } from "../services/api";

function formatTotalTime(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "—";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function ResultLookupPage() {
  const [bibNumber, setBibNumber] = useState("");
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLookup = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResultData(null);

    const normalizedBib = bibNumber.trim().toUpperCase();

    if (!normalizedBib) {
      setErrorMessage("Vui lòng nhập BIB để tra cứu.");
      return;
    }

    try {
      const response = await api(`/results/bib/${normalizedBib}`);
      setResultData(response.data);
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <div className="lookup-page">
      <a className="back" href="/">
        ← RaceTimingPro
      </a>

      <div className="lookup-card result">
        <span className="kicker">OFFICIAL RESULTS</span>
        <h1>Tra cứu kết quả</h1>

        <form className="lookup-form" onSubmit={handleLookup}>
          <input
            value={bibNumber}
            onChange={(event) => setBibNumber(event.target.value)}
            placeholder="Nhập BIB để tra cứu"
          />
          <button>TRA CỨU</button>
        </form>

        {errorMessage && (
          <div className="notice error">{errorMessage}</div>
        )}

        {resultData && !resultData.available && (
          <div className="waiting-result">
            <div className="result-athlete-meta">
              {resultData.athlete?.BibNumber && (
                <span className="result-bib-badge">
                  {resultData.athlete.BibNumber}
                </span>
              )}
              {resultData.athlete?.FullName && (
                <strong>{resultData.athlete.FullName}</strong>
              )}
            </div>

            <h3>
              {resultData.reason === "NOT_FINISHED"
                ? "VĐV chưa hoàn thành cuộc đua"
                : "Kết quả đang được BTC xác minh"}
            </h3>

            <p>
              Kết quả chỉ được công bố sau khi được BTC xác nhận và chuyển sang
              trạng thái OFFICIAL.
            </p>
          </div>
        )}

        {resultData?.available && (
          <div className="official-card">
            <span>✓ OFFICIAL</span>
            <h2>{resultData.result.FullName}</h2>

            <div className="official-meta-row">
              <b>{resultData.result.BibNumber}</b>
              <span>{resultData.result.Distance}</span>
            </div>

            <strong>{formatTotalTime(resultData.result.TotalTimeSeconds)}</strong>

            <div className="split-row">
              <i>START</i>
              <i>CP01</i>
              <i>CP02</i>
              <i>CP03</i>
              <i>FINISH</i>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
