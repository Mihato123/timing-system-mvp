import { useState } from "react";
import { api } from "../services/api";

function formatDuration(totalSeconds) {
  const value = Number(totalSeconds);

  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "—";
  }

  const hours =
    Math.floor(value / 3600);

  const minutes =
    Math.floor(
      (value % 3600) / 60
    );

  const seconds =
    Math.floor(
      value % 60
    );

  return [
    hours,
    minutes,
    seconds
  ]
    .map((item) =>
      String(item).padStart(
        2,
        "0"
      )
    )
    .join(":");
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString(
    "vi-VN"
  );
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "vi-VN"
  );
}

function secondsBetween(
  start,
  end
) {
  if (!start || !end) {
    return null;
  }

  const startTime =
    new Date(start).getTime();

  const endTime =
    new Date(end).getTime();

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime)
  ) {
    return null;
  }

  const seconds =
    Math.floor(
      (endTime - startTime) /
        1000
    );

  return seconds >= 0
    ? seconds
    : null;
}


function getResultState(resultData) {
  if (!resultData) {
    return {
      isPending: false,
      isOfficial: false
    };
  }

  const isPending =
    resultData.ResultStatus === "PENDING" ||
    resultData.reason === "UNDER_REVIEW";

  return {
    isPending,
    isOfficial:
      resultData.ResultStatus === "OFFICIAL" &&
      !isPending
  };
}

export default function ResultLookupPage() {
  const [
    bibNumber,
    setBibNumber
  ] = useState("");

  const [
    resultData,
    setResultData
  ] = useState(null);

  const [
    errorMessage,
    setErrorMessage
  ] = useState("");

  const [
    busy,
    setBusy
  ] = useState(false);

  const handleLookup = async (
    event
  ) => {
    event.preventDefault();

    setErrorMessage("");
    setResultData(null);

    const normalizedBib =
      bibNumber
        .trim()
        .toUpperCase();

    if (!normalizedBib) {
      setErrorMessage(
        "Vui lòng nhập BIB để tra cứu."
      );

      return;
    }

    setBusy(true);

    try {
      const response =
        await api(
          `/results/bib/${normalizedBib}`
        );

      setResultData(
        response.data
      );
    } catch (error) {
      setErrorMessage(
        error.message
      );
    } finally {
      setBusy(false);
    }
  };

  const checkpointRows =
    resultData
      ? [
          {
            label: "START",
            time:
              resultData.StartTime,
            cumulative: 0,
            segment: null
          },
          {
            label: "CP01",
            time:
              resultData.CP01Time,
            cumulative:
              secondsBetween(
                resultData.StartTime,
                resultData.CP01Time
              ),
            segment:
              secondsBetween(
                resultData.StartTime,
                resultData.CP01Time
              )
          },
          {
            label: "CP02",
            time:
              resultData.CP02Time,
            cumulative:
              secondsBetween(
                resultData.StartTime,
                resultData.CP02Time
              ),
            segment:
              secondsBetween(
                resultData.CP01Time,
                resultData.CP02Time
              )
          },
          {
            label: "CP03",
            time:
              resultData.CP03Time,
            cumulative:
              secondsBetween(
                resultData.StartTime,
                resultData.CP03Time
              ),
            segment:
              secondsBetween(
                resultData.CP02Time,
                resultData.CP03Time
              )
          },
          {
            label: "FINISH",
            time:
              resultData.FinishTime,
            cumulative:
              resultData.TotalTimeSeconds,
            segment:
              secondsBetween(
                resultData.CP03Time,
                resultData.FinishTime
              )
          }
        ]
      : [];

  const {
    isPending,
    isOfficial
  } = getResultState(resultData);

  const complaintHistory =
    Array.isArray(resultData?.complaints)
      ? resultData.complaints
      : [];

  return (
    <div className="lookup-page">
      <a
        className="back"
        href="/"
      >
        ← RaceTimingPro
      </a>

      <div className="lookup-card result">
        <span className="kicker">
          OFFICIAL RESULTS
        </span>

        <h1>
          Tra cứu kết quả
        </h1>

        <form
          className="lookup-form"
          onSubmit={
            handleLookup
          }
        >
          <input
            value={bibNumber}
            onChange={(
              event
            ) =>
              setBibNumber(
                event.target.value
              )
            }
            placeholder="Nhập BIB để tra cứu"
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

        {errorMessage && (
          <div className="notice error">
            {errorMessage}
          </div>
        )}

        {resultData && (
          <div
            style={{
              marginTop: "22px"
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                border:
                  isPending
                    ? "1px solid rgba(245,185,66,0.3)"
                    : "1px solid rgba(40,220,120,0.22)",
                borderRadius: "10px",
                background:
                  isPending
                    ? "rgba(245,185,66,0.07)"
                    : "rgba(40,220,120,0.05)",
                color:
                  isPending
                    ? "#f5b942"
                    : "#35e58a",
                marginBottom: "14px",
                display: "flex",
                justifyContent: "space-between",
                gap: "15px",
                flexWrap: "wrap"
              }}
            >
              <strong>
                {isPending
                  ? "⏳ BTC đang kiểm tra lại lời khiếu nại của bạn"
                  : "✓ OFFICIAL - Kết quả đã được BTC xác nhận"}
              </strong>

              <span
                style={{
                  color: "rgba(255,255,255,0.7)"
                }}
              >
                {isPending
                  ? "Kết quả bên dưới là kết quả trước khi BTC kiểm tra lại."
                  : `Công bố: ${formatDateTime(resultData.ApprovedAt)}`}
              </span>
            </div>

            <div
              style={{
                padding: "22px",
                border:
                  "1px solid rgba(255,255,255,0.1)",
                borderRadius:
                  "12px",
                background:
                  "rgba(255,255,255,0.025)"
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.5fr 1fr 0.7fr",
                  gap: "20px",
                  alignItems:
                    "center"
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems:
                        "center",
                      gap: "14px"
                    }}
                  >
                    <div
                      style={{
                        padding:
                          "13px 16px",
                        borderRadius:
                          "9px",
                        background:
                          "rgba(38,208,231,0.13)",
                        border:
                          "1px solid rgba(38,208,231,0.35)",
                        fontWeight:
                          "bold",
                        fontSize:
                          "20px"
                      }}
                    >
                      {
                        resultData.BibNumber
                      }
                    </div>

                    <div>
                      <h2
                        style={{
                          margin: 0
                        }}
                      >
                        {
                          resultData.FullName
                        }
                      </h2>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          opacity: 0.72
                        }}
                      >
                        {
                          resultData.Distance
                        }
                        {" · "}
                        {resultData.Gender ||
                          "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <small>
                    THỜI GIAN HOÀN THÀNH
                  </small>

                  <div
                    style={{
                      marginTop:
                        "8px",
                      fontSize:
                        "38px",
                      fontWeight:
                        "bold",
                      color:
                        "#25d4e8",
                      fontFamily:
                        "monospace"
                    }}
                  >
                    {formatDuration(
                      resultData.TotalTimeSeconds
                    )}
                  </div>
                </div>

                <div>
                  <small>
                    {isPending
                      ? "TRẠNG THÁI XẾP HẠNG"
                      : "XẾP HẠNG"}
                  </small>

                  {isPending ? (
                    <>
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "18px",
                          fontWeight: "bold",
                          color: "#f5b942"
                        }}
                      >
                        TẠM ẨN
                      </div>

                      <div
                        style={{
                          marginTop: "5px",
                          fontSize: "12px",
                          opacity: 0.65
                        }}
                      >
                        Chờ BTC kiểm tra lại kết quả
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "30px",
                          fontWeight: "bold"
                        }}
                      >
                        {resultData.RankPosition || "—"}
                        <span
                          style={{
                            fontSize: "15px",
                            opacity: 0.6
                          }}
                        >
                          {" "}
                          /{" "}
                          {resultData.RankedAthleteCount || "—"}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "5px",
                          fontSize: "12px",
                          opacity: 0.65
                        }}
                      >
                        Trong cùng cự ly
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  marginTop:
                    "22px",
                  paddingTop:
                    "20px",
                  borderTop:
                    "1px solid rgba(255,255,255,0.08)",
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(3, 1fr)",
                  gap: "20px"
                }}
              >
                <div>
                  <small>
                    Ngày sinh
                  </small>

                  <div>
                    {formatDate(
                      resultData.DateOfBirth
                    )}
                  </div>
                </div>

                <div>
                  <small>
                    Số điện thoại
                  </small>

                  <div>
                    {resultData.Phone ||
                      "—"}
                  </div>
                </div>

                <div>
                  <small>
                    Email
                  </small>

                  <div>
                    {resultData.Email ||
                      "—"}
                  </div>
                </div>

                <div>
                  <small>
                    Trạng thái đăng ký
                  </small>

                  <div>
                    {
                      resultData.RegistrationStatus
                    }
                  </div>
                </div>

                <div>
                  <small>
                    Trạng thái cuộc đua
                  </small>

                  <div>
                    {
                      resultData.RunStatus
                    }
                  </div>
                </div>

                <div>
                  <small>
                    Trạng thái kết quả
                  </small>

                  <div
                    style={{
                      color:
                        isPending
                          ? "#f5b942"
                          : "#35e58a",
                      fontWeight: 700
                    }}
                  >
                    {isPending
                      ? "ĐANG KIỂM TRA LẠI"
                      : resultData.ResultStatus}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "18px"
              }}
            >
              <h3
                style={{
                  marginBottom:
                    "12px"
                }}
              >
                Thời gian từng
                checkpoint
              </h3>

              <div
                style={{
                  overflowX:
                    "auto",
                  border:
                    "1px solid rgba(255,255,255,0.1)",
                  borderRadius:
                    "10px"
                }}
              >
                <table
                  style={{
                    width:
                      "100%",
                    borderCollapse:
                      "collapse"
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          padding:
                            "12px",
                          textAlign:
                            "left"
                        }}
                      >
                        Mốc
                      </th>

                      <th
                        style={{
                          padding:
                            "12px",
                          textAlign:
                            "left"
                        }}
                      >
                        Thời điểm ghi nhận
                      </th>

                      <th
                        style={{
                          padding:
                            "12px",
                          textAlign:
                            "left"
                        }}
                      >
                        Thời gian tích lũy
                      </th>

                      <th
                        style={{
                          padding:
                            "12px",
                          textAlign:
                            "left"
                        }}
                      >
                        Thời gian từ mốc trước
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {checkpointRows.map(
                      (row) => (
                        <tr
                          key={
                            row.label
                          }
                          style={{
                            borderTop:
                              "1px solid rgba(255,255,255,0.07)"
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "12px",
                              fontWeight:
                                "bold"
                            }}
                          >
                            {row.label}
                          </td>

                          <td
                            style={{
                              padding:
                                "12px"
                            }}
                          >
                            {formatDateTime(
                              row.time
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "12px",
                              fontFamily:
                                "monospace"
                            }}
                          >
                            {formatDuration(
                              row.cumulative
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "12px",
                              fontFamily:
                                "monospace"
                            }}
                          >
                            {row.segment ===
                            null
                              ? "—"
                              : formatDuration(
                                  row.segment
                                )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {complaintHistory.length > 0 && (
              <div
                style={{
                  marginTop: "20px"
                }}
              >
                <h3
                  style={{
                    marginBottom: "12px"
                  }}
                >
                  Lịch sử khiếu nại
                </h3>

                <div
                  style={{
                    display: "grid",
                    gap: "12px"
                  }}
                >
                  {complaintHistory.map((complaint) => {
                    const isReturnPending =
                      complaint.Resolution === "RETURN_PENDING";

                    const isKeepResult =
                      complaint.Resolution === "KEEP_RESULT";

                    return (
                      <div
                        key={complaint.ComplaintID}
                        style={{
                          padding: "16px",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "10px",
                          background:
                            "rgba(255,255,255,0.025)"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            marginBottom: "12px"
                          }}
                        >
                          <strong>
                            Khiếu nại #{complaint.ComplaintID}
                          </strong>

                          <span
                            style={{
                              color:
                                complaint.ComplaintStatus === "RESOLVED"
                                  ? "#35e58a"
                                  : "#f5b942",
                              fontWeight: 700
                            }}
                          >
                            {complaint.ComplaintStatus === "RESOLVED"
                              ? "ĐÃ XỬ LÝ"
                              : "ĐANG XỬ LÝ"}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(2, minmax(0, 1fr))",
                            gap: "12px"
                          }}
                        >
                          <div>
                            <small>Thời gian gửi</small>
                            <div>
                              {formatDateTime(complaint.CreatedAt)}
                            </div>
                          </div>

                          <div>
                            <small>Loại khiếu nại</small>
                            <div>
                              {complaint.ComplaintType || "Kết quả"}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: "14px",
                            padding: "12px",
                            borderRadius: "8px",
                            background:
                              "rgba(255,255,255,0.025)"
                          }}
                        >
                          <small>Nội dung VĐV đã gửi</small>
                          <div
                            style={{
                              marginTop: "6px",
                              lineHeight: 1.5
                            }}
                          >
                            {complaint.ComplaintMessage || "—"}
                          </div>
                        </div>

                        {(isReturnPending || isKeepResult) && (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px",
                              borderRadius: "8px",
                              border:
                                isReturnPending
                                  ? "1px solid rgba(245,185,66,0.22)"
                                  : "1px solid rgba(40,220,120,0.2)",
                              background:
                                isReturnPending
                                  ? "rgba(245,185,66,0.05)"
                                  : "rgba(40,220,120,0.04)"
                            }}
                          >
                            <small>BTC xử lý</small>
                            <div
                              style={{
                                marginTop: "6px",
                                lineHeight: 1.5,
                                color:
                                  isReturnPending
                                    ? "#f5b942"
                                    : "#35e58a"
                              }}
                            >
                              {isReturnPending
                                ? "BTC phát hiện cần kiểm tra lại và đã chuyển kết quả về trạng thái chờ kiểm tra."
                                : "BTC đã đối chiếu và xác nhận giữ nguyên kết quả."}
                            </div>
                          </div>
                        )}

                        {complaint.ResolutionNote && (
                          <div
                            style={{
                              marginTop: "12px"
                            }}
                          >
                            <small>Ghi chú của BTC</small>
                            <div
                              style={{
                                marginTop: "5px",
                                opacity: 0.8
                              }}
                            >
                              {complaint.ResolutionNote}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}