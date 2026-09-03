import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:3000/api";

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : "—";

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "—";

  const value = Number(seconds);

  return [
    Math.floor(value / 3600),
    Math.floor((value % 3600) / 60),
    value % 60
  ]
    .map((item) => String(item).padStart(2, "0"))
    .join(":");
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Có lỗi xảy ra");
    error.code = data.code;
    error.data = data.data;
    throw error;
  }

  return data;
}

export default function AdminPage() {
  const session = JSON.parse(localStorage.getItem("raceSession") || "{}");

  const [active, setActive] = useState("overview");

  const [athletes, setAthletes] = useState([]);
  const [medicalAlerts, setMedicalAlerts] = useState([]);
  const [complaints, setComplaints] = useState([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [checkInQuantity, setCheckInQuantity] = useState("");
  const [selectedCheckInBibs, setSelectedCheckInBibs] = useState([]);
  const [checkInConfirmOpen, setCheckInConfirmOpen] = useState(false);

  const [medicalForm, setMedicalForm] = useState(null);
  const [medicalType, setMedicalType] = useState("INJURY");
  const [medicalNote, setMedicalNote] = useState("");

  const [expandedComplaint, setExpandedComplaint] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedMedicalAthlete, setSelectedMedicalAthlete] = useState(null);
  const [selectedRaceBib, setSelectedRaceBib] = useState("");

  const show = (text, ok = true) => {
    setToast({ text, ok });

    window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const loadAll = async () => {
    try {
      setLoading(true);

      const [dashboardData, medicalData, complaintData] = await Promise.all([
        request("/dashboard/athletes"),
        request("/medical/alerts"),
        request("/complaints")
      ]);

      setAthletes(dashboardData.data || []);
      setMedicalAlerts(medicalData.data || []);
      setComplaints(complaintData.data || []);
    } catch (error) {
      console.error(error);
      show(error.message || "Không thể tải dữ liệu", false);
    } finally {
      setLoading(false);
    }
  };

  // PRD / Mike: polling mỗi 5 giây.
  useEffect(() => {
    loadAll();

    const intervalId = window.setInterval(() => {
      loadAll();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const act = async (key, path, body) => {
    try {
      setBusy(key);

      const data = await request(path, {
        method: "POST",
        body: JSON.stringify(body)
      });

      show(data.message || "Xử lý thành công");
      await loadAll();

      return data;
    } catch (error) {
      console.error(error);
      show(error.message || "Xử lý thất bại", false);
      throw error;
    } finally {
      setBusy("");
    }
  };

  const stats = useMemo(
    () => ({
      total: athletes.length,
      checked: athletes.filter(
        (athlete) => athlete.RegistrationStatus === "CHECKED_IN"
      ).length,
      running: athletes.filter(
        (athlete) => athlete.RunStatus === "RUNNING"
      ).length,
      finished: athletes.filter(
        (athlete) => athlete.RunStatus === "FINISHED"
      ).length,
      stopped: athletes.filter(
        (athlete) => athlete.RunStatus === "STOPPED"
      ).length,
      medical: medicalAlerts.filter(
        (item) => item.AlertStatus === "PENDING"
      ).length,
      complaints: complaints.filter(
        (item) => item.ComplaintStatus === "OPEN"
      ).length
    }),
    [athletes, medicalAlerts, complaints]
  );

  const registeredCount = athletes.filter(
    (athlete) => athlete.RegistrationStatus === "REGISTERED"
  ).length;

  const filteredAthletes = athletes.filter((athlete) =>
    `${athlete.BibNumber || ""} ${athlete.FullName || ""} ${
      athlete.Phone || ""
    } ${athlete.Email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );


  const liveAthletes = useMemo(() => {
    const progressScore = (athlete) => {
      if (athlete.FinishTime) return 5;
      if (athlete.CP03Time) return 4;
      if (athlete.CP02Time) return 3;
      if (athlete.CP01Time) return 2;
      if (athlete.StartTime) return 1;
      return 0;
    };

    const latestProgressTime = (athlete) =>
      athlete.FinishTime ||
      athlete.CP03Time ||
      athlete.CP02Time ||
      athlete.CP01Time ||
      athlete.StartTime ||
      null;

    const elapsedToLatestProgress = (athlete) => {
      if (!athlete.StartTime) return Number.POSITIVE_INFINITY;

      const latest = latestProgressTime(athlete);
      if (!latest) return Number.POSITIVE_INFINITY;

      const startMs = new Date(athlete.StartTime).getTime();
      const latestMs = new Date(latest).getTime();

      if (!Number.isFinite(startMs) || !Number.isFinite(latestMs)) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.max(0, latestMs - startMs);
    };

    return athletes
      .filter((athlete) =>
        ["RUNNING", "FINISHED"].includes(athlete.RunStatus)
      )
      .sort((a, b) => {
        const progressDifference =
          progressScore(b) - progressScore(a);

        if (progressDifference !== 0) {
          return progressDifference;
        }

        const elapsedDifference =
          elapsedToLatestProgress(a) -
          elapsedToLatestProgress(b);

        if (elapsedDifference !== 0) {
          return elapsedDifference;
        }

        return String(a.BibNumber || "").localeCompare(
          String(b.BibNumber || "")
        );
      });
  }, [athletes]);

  const pendingMedicalByBib = useMemo(() => {
    const map = new Map();

    medicalAlerts.forEach((alert) => {
      if (
        alert.AlertStatus === "PENDING" &&
        alert.BibNumber
      ) {
        map.set(alert.BibNumber, alert);
      }
    });

    return map;
  }, [medicalAlerts]);

  const menuItems = [
    ["overview", "▦", "Tổng quan"],
    ["checkin", "✓", "Check-in"],
    ["athletes", "♙", "Vận động viên"],
    ["race", "⌖", "Race Control"],
    ["live", "⌁", "Theo dõi Live"],
    ["medical", "♡", "Y tế"],
    ["results", "♕", "Kết quả"],
    ["complaints", "☏", "Khiếu nại"]
  ];

  const badgeValue = (id) => {
    if (id === "medical") return stats.medical;
    if (id === "complaints") return stats.complaints;
    return 0;
  };

  const titleMap = {
    overview: "Bảng điều khiển giải",
    checkin: "Check-in vận động viên",
    athletes: "Danh sách vận động viên",
    race: "Race Control",
    live: "Theo dõi Live",
    medical: "Medical Center",
    results: "Kết quả",
    complaints: "Khiếu nại"
  };

  const handleLogout = () => {
    localStorage.removeItem("raceSession");
    window.location.href = "/admin/login";
  };

  const pendingCheckInAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.RegistrationStatus === "REGISTERED"),
    [athletes]
  );

  const checkedInAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.RegistrationStatus === "CHECKED_IN"),
    [athletes]
  );

  useEffect(() => {
    const pendingBibSet = new Set(
      pendingCheckInAthletes.map((athlete) => athlete.BibNumber)
    );
    setSelectedCheckInBibs((current) =>
      current.filter((bibNumber) => pendingBibSet.has(bibNumber))
    );
  }, [athletes]);

  const toggleCheckInBib = (bibNumber) => {
    setSelectedCheckInBibs((current) =>
      current.includes(bibNumber)
        ? current.filter((item) => item !== bibNumber)
        : [...current, bibNumber]
    );
  };

  const handleAutoSelectCheckIn = () => {
    const quantity = Number.parseInt(checkInQuantity, 10);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      show("Vui lòng nhập số lượng VĐV muốn chọn", false);
      return;
    }

    if (pendingCheckInAthletes.length === 0) {
      show("Không còn VĐV nào đang chờ check-in");
      return;
    }

    const actualQuantity = Math.min(quantity, pendingCheckInAthletes.length);
    setSelectedCheckInBibs(
      pendingCheckInAthletes
        .slice(0, actualQuantity)
        .map((athlete) => athlete.BibNumber)
    );

    show(
      quantity > pendingCheckInAthletes.length
        ? `Hiện chỉ còn ${pendingCheckInAthletes.length} VĐV chưa check-in. Đã chọn toàn bộ.`
        : `Đã chọn tự động ${actualQuantity} VĐV`
    );
  };

  const handleClearCheckInSelection = () => {
    setSelectedCheckInBibs([]);
    setCheckInQuantity("");
  };

  const handleSelectedCheckIn = () => {
    if (selectedCheckInBibs.length === 0) {
      show("Vui lòng chọn ít nhất 1 VĐV để check-in", false);
      return;
    }

    setCheckInConfirmOpen(true);
  };

  const confirmSelectedCheckIn = async () => {
    try {
      setCheckInConfirmOpen(false);

      const response = await act(
        "checkin-selected",
        "/check-in/bulk",
        { bibNumbers: selectedCheckInBibs }
      );

      const result = response?.data || {};
      const checkedInCount = Number(result.checkedInCount || 0);
      const alreadyCheckedInCount = Number(result.alreadyCheckedInCount || 0);
      const failedCount = Number(result.failedCount || 0);

      setSelectedCheckInBibs([]);
      setCheckInQuantity("");

      if (failedCount > 0) {
        show(
          `Đã xử lý: ${checkedInCount} thành công, ${alreadyCheckedInCount} đã check-in trước, ${failedCount} chưa xử lý được.`,
          false
        );
      }
    } catch (_) {
      // act() đã hiển thị lỗi.
    }
  };

  const raceAction = async (athlete, actionName) => {
    const bibNumber = athlete.BibNumber;

    try {
      if (actionName === "START") {
        await act(`${bibNumber}-START`, "/race/start", { bibNumber });
        return;
      }

      if (actionName === "FINISH") {
        await act(`${bibNumber}-FINISH`, "/race/finish", { bibNumber });
        return;
      }

      await act(`${bibNumber}-${actionName}`, "/race/checkpoint", {
        bibNumber,
        checkpointCode: actionName
      });
    } catch (_) {
      // Backend sẽ trả đúng business exception.
    }
  };

  const openMedicalForm = (athlete) => {
    setMedicalForm(athlete);
    setMedicalType("INJURY");
    setMedicalNote("");
  };

  const submitMedicalAlert = async () => {
    if (!medicalForm) return;

    try {
      await act(
        `medical-${medicalForm.BibNumber}`,
        "/medical/alert",
        {
          bibNumber: medicalForm.BibNumber,
          alertType: medicalType,
          alertMessage:
            medicalNote.trim() || "Cảnh báo được ghi nhận từ Race Control"
        }
      );

      setMedicalForm(null);
      setMedicalNote("");
    } catch (_) {
      // act() đã hiển thị lỗi.
    }
  };

  const handleMedicalDecision = async (alertID, decision) => {
    try {
      await act(`medical-${alertID}-${decision}`, "/medical/decision", {
        alertID,
        decision
      });
    } catch (_) {
      // act() đã hiển thị lỗi.
    }
  };

  const handleApproveResult = async (resultID) => {
    try {
      await act(`approve-${resultID}`, "/results/approve", {
        resultID,
        approvedBy: session?.name || "BTC"
      });
    } catch (_) {
      // act() đã hiển thị lỗi.
    }
  };

  const resolveComplaint = async (complaintID, decision) => {
    const note =
      decision === "KEEP_RESULT"
        ? "BTC đã đối chiếu START, checkpoint và FINISH; giữ nguyên kết quả."
        : "BTC phát hiện sai lệch; đưa kết quả về PENDING để kiểm tra/cập nhật trước khi công bố lại.";

    try {
      await act(`complaint-${complaintID}`, "/complaints/resolve", {
        complaintID,
        resolution: decision,
        resolutionNote: note
      });

      setExpandedComplaint(null);
    } catch (_) {
      // act() đã hiển thị lỗi.
    }
  };

  return (
    <div className="admin-app">
      <aside className="sidebar">
        <div className="brand">
          <span>»</span>

          <div>
            <b>RaceTimingPro</b>
            <small>Ban Tổ Chức</small>
          </div>
        </div>

        <div className="event-chip">
          <b>● Demo Marathon 2026</b>
          <small>Race Operations • LIVE</small>
        </div>

        <nav>
          {menuItems.map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              className={active === id ? "active" : ""}
              onClick={() => setActive(id)}
            >
              <span>{icon}</span>
              {label}

              {badgeValue(id) > 0 && <em>{badgeValue(id)}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <b>{session?.name || "Operator"}</b>
          <small>{session?.role || "BTC"}</small>

          <button type="button" onClick={handleLogout}>
            ⇥ Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">RACE OPERATIONS</span>
            <h1>{titleMap[active]}</h1>
          </div>

          <div>
            <span className="live">● LIVE</span>

            <button
              type="button"
              className="primary"
              onClick={loadAll}
              disabled={loading}
            >
              {loading ? "Đang tải..." : "↻ Làm mới"}
            </button>
          </div>
        </header>

        {toast && (
          <div className={`toast ${toast.ok ? "" : "bad"}`}>
            {toast.text}
          </div>
        )}

        {active === "overview" && (
          <>
            <div className="stats-grid">
              <StatCard
                icon="👥"
                label="Tổng VĐV"
                value={stats.total}
                note="Đã đăng ký"
                tone="cyan"
              />

              <StatCard
                icon="✓"
                label="Check-in"
                value={stats.checked}
                note={`Còn ${registeredCount} REGISTERED`}
                tone="green"
              />

              <StatCard
                icon="🏃"
                label="Đang chạy"
                value={stats.running}
                note="RUNNING"
                tone="cyan"
              />

              <StatCard
                icon="🏁"
                label="Hoàn thành"
                value={stats.finished}
                note="FINISHED"
                tone="green"
              />

              <StatCard
                icon="🚨"
                label="Cảnh báo Y tế"
                value={stats.medical}
                note="PENDING"
                tone="orange"
              />

              <StatCard
                icon="☏"
                label="Khiếu nại"
                value={stats.complaints}
                note="OPEN"
                tone="purple"
              />
            </div>

            {stats.stopped > 0 && (
              <div className="health-warning">
                ⛔ Có {stats.stopped} VĐV đã được Medical Team yêu cầu dừng.
              </div>
            )}

            <section className="panel">
              <PanelHead
                title="Tổng quan vận động viên"
              />

              <Search value={search} setValue={setSearch} />

              <AthleteTable rows={filteredAthletes} />
            </section>
          </>
        )}

        {active === "checkin" && (
          <section
            className="panel checkin-panel-wide"
            style={{
              width: "100%",
              maxWidth: "none",
              boxSizing: "border-box"
            }}
          >
            <PanelHead
              title="Check-in Race Day"
              sub="Chọn VĐV đang chờ check-in → xác nhận theo nhóm → tự động chuyển xuống danh sách đã check-in"
            />

            <div style={{
              display: "flex", alignItems: "end", gap: "10px", flexWrap: "wrap",
              padding: "16px", marginBottom: "16px",
              border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px"
            }}>
              <label style={{ display: "grid", gap: "6px", minWidth: "220px" }}>
                <span style={{ fontSize: "13px", opacity: 0.72 }}>Số lượng muốn chọn</span>
                <input
                  type="number"
                  min="1"
                  max={Math.max(pendingCheckInAthletes.length, 1)}
                  value={checkInQuantity}
                  onChange={(event) => setCheckInQuantity(event.target.value)}
                  placeholder="Ví dụ: 50"
                  style={{
                    height: "42px", padding: "0 12px", borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)", color: "inherit"
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleAutoSelectCheckIn}
                disabled={pendingCheckInAthletes.length === 0}
                style={{
                  height: "42px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.045)",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 600,
                  cursor:
                    pendingCheckInAthletes.length === 0
                      ? "not-allowed"
                      : "pointer"
                }}
              >
                ✓ CHỌN TỰ ĐỘNG
              </button>

              <button
                type="button"
                onClick={handleClearCheckInSelection}
                disabled={selectedCheckInBibs.length === 0 && !checkInQuantity}
                style={{
                  height: "42px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.09)",
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 600,
                  cursor:
                    selectedCheckInBibs.length === 0 && !checkInQuantity
                      ? "not-allowed"
                      : "pointer"
                }}
              >
                BỎ CHỌN
              </button>

              <div style={{ marginLeft: "auto", fontSize: "13px", opacity: 0.8 }}>
                Đang chờ: <b>{pendingCheckInAthletes.length}</b>
                {" • "}Đã chọn: <b>{selectedCheckInBibs.length}</b>
              </div>
            </div>

            <CheckInAthleteTable
              title="VĐV CHƯA CHECK-IN"
              subtitle="Tick từng VĐV hoặc nhập số lượng để hệ thống chọn tự động"
              rows={pendingCheckInAthletes}
              selectable
              selectedBibs={selectedCheckInBibs}
              onToggle={toggleCheckInBib}
            />

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: "12px", flexWrap: "wrap", padding: "14px 16px",
              marginBottom: "18px",
              border: "1px solid rgba(255,255,255,0.09)",
              borderTop: "none", borderRadius: "0 0 12px 12px"
            }}>
              <span style={{ fontSize: "13px", opacity: 0.75 }}>
                Đã chọn <b>{selectedCheckInBibs.length}</b> VĐV
              </span>
              <button
                type="button"
                onClick={handleSelectedCheckIn}
                disabled={selectedCheckInBibs.length === 0 || busy === "checkin-selected"}
                style={{
                  minWidth: "180px",
                  height: "42px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,107,33,0.34)",
                  background:
                    selectedCheckInBibs.length === 0
                      ? "rgba(255,255,255,0.035)"
                      : "rgba(255,107,33,0.12)",
                  color:
                    selectedCheckInBibs.length === 0
                      ? "rgba(255,255,255,0.35)"
                      : "#ff8a4c",
                  fontWeight: 700,
                  cursor:
                    selectedCheckInBibs.length === 0 || busy === "checkin-selected"
                      ? "not-allowed"
                      : "pointer"
                }}
              >
                {busy === "checkin-selected"
                  ? "ĐANG CHECK-IN..."
                  : `✓ CHECK-IN ${selectedCheckInBibs.length} VĐV`}
              </button>
            </div>

            <CheckInAthleteTable
              title="VĐV ĐÃ CHECK-IN"
              subtitle="Sau khi check-in thành công, VĐV tự động chuyển xuống đây"
              rows={checkedInAthletes}
            />
          </section>
        )}

        {active === "athletes" && (
          <section className="panel">
            <PanelHead
              title="Danh sách vận động viên"
              sub="Thông tin đăng ký và hồ sơ vận động viên"
            />

            <Search value={search} setValue={setSearch} />

            <AthleteTable rows={filteredAthletes} detailed />
          </section>
        )}

        {active === "race" && (
          <>
            <div className="race-toolbar">
              <Search value={search} setValue={setSearch} />

              <span>
                {stats.running} RUNNING • {stats.checked} CHECKED_IN
              </span>
            </div>

            <section
              className="panel"
              style={{
                width: "100%",
                maxWidth: "none",
                boxSizing: "border-box",
                marginBottom: "16px"
              }}
            >
              <PanelHead
                title="Chọn vận động viên"
                sub="Tìm theo BIB hoặc tên, sau đó chọn một VĐV để điều khiển cuộc đua"
              />

              <div className="table-scroll" style={{ maxHeight: "320px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>BIB</th>
                      <th>VĐV</th>
                      <th>Cự ly</th>
                      <th>Y tế</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAthletes
                      .filter(
                        (athlete) =>
                          athlete.RegistrationStatus === "CHECKED_IN"
                      )
                      .map((athlete) => (
                        <tr
                          key={athlete.BibNumber}
                          style={{
                            cursor: "pointer",
                            background:
                              selectedRaceBib === athlete.BibNumber
                                ? "rgba(255,107,33,0.07)"
                                : undefined
                          }}
                          onClick={() =>
                            setSelectedRaceBib(athlete.BibNumber)
                          }
                        >
                          <td>
                            <b>{athlete.BibNumber}</b>
                          </td>

                          <td>{athlete.FullName}</td>

                          <td>
                            <span className="distance">
                              {athlete.Distance}
                            </span>
                          </td>

                          <td>
                            {athlete.HasMedicalCondition ? (
                              <span className="medical-tag">
                                ♡ {athlete.MedicalCondition || "Có lưu ý"}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td>
                            <StatusBadge
                              status={
                                athlete.RunStatus ||
                                athlete.RegistrationStatus
                              }
                            />
                          </td>

                          <td>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedRaceBib(athlete.BibNumber);
                              }}
                              style={{
                                padding: "7px 11px",
                                borderRadius: "7px",
                                border:
                                  "1px solid rgba(255,255,255,0.12)",
                                background:
                                  "rgba(255,255,255,0.035)",
                                color: "rgba(255,255,255,0.78)",
                                cursor: "pointer"
                              }}
                            >
                              Điều khiển
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedRaceBib ? (
              (() => {
                const athlete = athletes.find(
                  (item) => item.BibNumber === selectedRaceBib
                );

                if (!athlete) return null;

                return (
                  <div style={{ maxWidth: "920px" }}>
                    <RaceCard
                      athlete={athlete}
                      busy={busy}
                      onAction={raceAction}
                      onMedical={openMedicalForm}
                    />
                  </div>
                );
              })()
            ) : (
              <div
                className="panel"
                style={{
                  padding: "18px",
                  opacity: 0.72
                }}
              >
                Chọn một VĐV ở bảng trên để mở Race Control.
              </div>
            )}
          </>
        )}

        {active === "live" && (
          <section className="live-layout">
            <div className="panel">
              <PanelHead
                title="Theo dõi cuộc đua"
              />

              <LiveAthleteTable
                rows={liveAthletes}
                pendingMedicalByBib={pendingMedicalByBib}
              />
            </div>

            <div className="panel checkpoint-health">
              <PanelHead
                title="Trạng thái checkpoint"
              />

              {["START", "CP01", "CP02", "CP03", "FINISH"].map(
                (key) => {
                  const count = athletes.filter((athlete) => {
                    if (key === "START") return athlete.StartTime;
                    if (key === "FINISH") return athlete.FinishTime;

                    return athlete[`${key}Time`];
                  }).length;

                  const percent = athletes.length
                    ? Math.round((count / athletes.length) * 100)
                    : 0;

                  return (
                    <div className="coverage" key={key}>
                      <b>
                        {key}
                        <span>{percent}%</span>
                      </b>

                      <div>
                        <i style={{ width: `${percent}%` }} />
                      </div>

                      <small>
                        {count}/{athletes.length} VĐV
                      </small>
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {active === "medical" && (
          <section className="panel">
            <PanelHead
              title="Medical Center"
              sub="Theo dõi sức khỏe xuyên suốt cuộc đua • bấm vào VĐV để xem chi tiết"
            />

            <div className="case-grid">
              {medicalAlerts.length === 0 && (
                <div className="case-card">
                  <p>Chưa có Medical Alert.</p>
                </div>
              )}

              {medicalAlerts.map((item) => (
                <Case
                  key={item.AlertID}
                  onClick={() => {
                    const athlete = athletes.find(
                      (row) => row.BibNumber === item.BibNumber
                    );

                    if (athlete) {
                      setSelectedMedicalAthlete({
                        ...athlete,
                        latestAlert: item
                      });
                    }
                  }}
                  title={`${item.BibNumber} • ${item.FullName}`}
                  status={item.AlertStatus}
                  meta={`${item.AlertType} • ${formatDateTime(
                    item.CreatedAt
                  )}`}
                  body={item.AlertMessage || "Không có ghi chú"}
                  warning={
                    item.HasMedicalCondition
                      ? `Bệnh nền: ${
                          item.MedicalCondition || "Có lưu ý"
                        } • ${item.MedicalNotes || ""}`
                      : null
                  }
                >
                  {item.AlertStatus === "PENDING" && (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMedicalDecision(
                            item.AlertID,
                            "CONTINUE"
                          );
                        }}
                      >
                        ✓ CONTINUE
                      </button>

                      <button
                        type="button"
                        className="danger"
                        disabled={Boolean(busy)}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMedicalDecision(item.AlertID, "STOP");
                        }}
                      >
                        ⛔ STOP / DNF
                      </button>
                    </>
                  )}
                </Case>
              ))}
            </div>
          </section>
        )}

        {active === "results" && (
          <section className="panel">
            <PanelHead
              title="Kết quả cuộc đua"
              sub="Xếp hạng theo từng cự ly • cùng tổng thời gian = đồng hạng"
            />

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hạng</th>
                    <th>BIB</th>
                    <th>VĐV</th>
                    <th>Cự ly</th>
                    <th>Tổng TG</th>
                    <th>Trạng thái</th>
                    <th>BTC</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>

                <tbody>
                  {athletes
                    .filter((athlete) => athlete.ResultID)
                    .map((athlete) => (
                      <tr key={athlete.ResultID}>
                        <td>
                          <b>
                            {getResultRankNumber(athletes, athlete)}
                          </b>
                        </td>

                        <td>
                          <b>{athlete.BibNumber}</b>
                        </td>

                        <td>{athlete.FullName}</td>

                        <td>
                          <span className="distance">
                            {athlete.Distance}
                          </span>
                        </td>

                        <td className="mono">
                          {formatDuration(
                            athlete.TotalTimeSeconds
                          )}
                        </td>

                        <td>
                          <StatusBadge
                            status={athlete.ResultStatus}
                          />
                        </td>

                        <td>
                          {athlete.ResultStatus === "PENDING" && (
                            <button
                              type="button"
                              disabled={
                                busy ===
                                `approve-${athlete.ResultID}`
                              }
                              onClick={() =>
                                handleApproveResult(
                                  athlete.ResultID
                                )
                              }
                            >
                              ✓ DUYỆT
                            </button>
                          )}

                          {athlete.ResultStatus === "OFFICIAL" && (
                            <span className="online">✓ ĐÃ DUYỆT</span>
                          )}
                        </td>

                        <td>
                          <button
  type="button"
  onClick={() =>
    setSelectedResult(athlete)
  }
  style={{
    padding: "7px 12px",
    borderRadius: "7px",
    border:
      "1px solid rgba(255,255,255,0.14)",
    background:
      "rgba(255,255,255,0.03)",
    color:
      "rgba(255,255,255,0.75)",
    fontSize: "12px",
    cursor: "pointer"
  }}
>
  Chi tiết →
</button>
                         
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {active === "complaints" && (
          <section className="panel">
            <PanelHead
              title="Khiếu nại VĐV"
              sub="BTC đối chiếu timing → KEEP_RESULT hoặc RETURN_PENDING"
            />

            <div className="case-grid">
              {complaints.length === 0 && (
                <div className="case-card">
                  <p>Chưa có khiếu nại.</p>
                </div>
              )}

              {complaints.map((complaint) => (
                <article
                  key={complaint.ComplaintID}
                  className={`case-card complaint-card ${
                    expandedComplaint === complaint.ComplaintID
                      ? "expanded"
                      : ""
                  }`}
                >
                  <div className="case-head">
                    <div>
                      <h3>
                        {complaint.BibNumber} •{" "}
                        {complaint.FullName || "VĐV"}
                      </h3>

                      <small>
                        {complaint.ComplaintType} •{" "}
                        {formatDateTime(complaint.CreatedAt)}
                      </small>
                    </div>

                    <button
                      type="button"
                      className="status-click"
                      onClick={() =>
                        setExpandedComplaint((current) =>
                          current === complaint.ComplaintID
                            ? null
                            : complaint.ComplaintID
                        )
                      }
                    >
                      <StatusBadge
                        status={complaint.ComplaintStatus}
                      />
                    </button>
                  </div>

                  <p>{complaint.ComplaintMessage || "—"}</p>

                  {expandedComplaint === complaint.ComplaintID && (
                    <div className="complaint-detail">
                      <div className="complaint-detail-title">
                        <div>
                          <span>ĐỐI CHIẾU KẾT QUẢ</span>
                          <h4>Timeline của VĐV</h4>
                        </div>

                        <StatusBadge
                          status={
                            complaint.ResultStatus || "UNKNOWN"
                          }
                        />
                      </div>

                      <div className="complaint-timeline-grid">
                        <TimePoint
                          label="START"
                          value={complaint.StartTime}
                        />
                        <TimePoint
                          label="CP01"
                          value={complaint.CP01Time}
                        />
                        <TimePoint
                          label="CP02"
                          value={complaint.CP02Time}
                        />
                        <TimePoint
                          label="CP03"
                          value={complaint.CP03Time}
                        />
                        <TimePoint
                          label="FINISH"
                          value={complaint.FinishTime}
                        />

                        <div className="time-point total">
                          <span>TỔNG THỜI GIAN</span>
                          <strong>
                            {formatDuration(
                              complaint.TotalTimeSeconds
                            )}
                          </strong>
                        </div>
                      </div>

                      {complaint.Resolution && (
                        <div className="complaint-resolution">
                          <b>
                            Đã xử lý: {complaint.Resolution}
                          </b>
                          <span>
                            {complaint.ResolutionNote || "—"}
                          </span>
                        </div>
                      )}

                      {complaint.ComplaintStatus === "OPEN" && (
                        <div className="case-actions complaint-actions">
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              resolveComplaint(
                                complaint.ComplaintID,
                                "KEEP_RESULT"
                              )
                            }
                          >
                            ✓ KẾT QUẢ ĐÚNG • GIỮ NGUYÊN
                          </button>

                          <button
                            type="button"
                            className="warning"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              resolveComplaint(
                                complaint.ComplaintID,
                                "RETURN_PENDING"
                              )
                            }
                          >
                            ⚠ CÓ SAI LỆCH • TRẢ VỀ PENDING
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {checkInConfirmOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setCheckInConfirmOpen(false)}
        >
          <div
            className="ops-modal"
            style={{
              width: "min(460px, 92vw)",
              padding: 0,
              overflow: "hidden"
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "20px 22px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)"
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: "14px",
                  border: "1px solid rgba(255,107,33,0.28)",
                  background: "rgba(255,107,33,0.1)",
                  color: "#ff8a4c",
                  fontSize: "18px",
                  fontWeight: 800
                }}
              >
                ✓
              </div>

              <h3 style={{ margin: 0, fontSize: "20px" }}>
                Xác nhận check-in
              </h3>

            </div>

            <div
              style={{
                padding: "14px 22px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px"
              }}
            >
              <button
                type="button"
                onClick={() => setCheckInConfirmOpen(false)}
                style={{
                  height: "40px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.035)",
                  color: "rgba(255,255,255,0.7)",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                HỦY
              </button>

              <button
                type="button"
                onClick={confirmSelectedCheckIn}
                style={{
                  height: "40px",
                  padding: "0 18px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,107,33,0.38)",
                  background: "rgba(255,107,33,0.14)",
                  color: "#ff8a4c",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                XÁC NHẬN CHECK-IN
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMedicalAthlete && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedMedicalAthlete(null)}
        >
          <div
            className="ops-modal"
            style={{
              width: "min(820px, 94vw)",
              maxHeight: "88vh",
              overflowY: "auto"
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ops-modal-head">
              <div>
                <span>ATHLETE MEDICAL PROFILE</span>
                <h3>
                  {selectedMedicalAthlete.BibNumber} •{" "}
                  {selectedMedicalAthlete.FullName}
                </h3>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedMedicalAthlete(null)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
                padding: "20px"
              }}
            >
              <InfoBox
                label="BIB"
                value={selectedMedicalAthlete.BibNumber}
              />
              <InfoBox
                label="Họ tên"
                value={selectedMedicalAthlete.FullName}
              />
              <InfoBox
                label="Cự ly"
                value={selectedMedicalAthlete.Distance}
              />
              <InfoBox
                label="Trạng thái cuộc đua"
                value={
                  selectedMedicalAthlete.RunStatus ||
                  selectedMedicalAthlete.RegistrationStatus
                }
              />
              <InfoBox
                label="Bệnh nền"
                value={
                  selectedMedicalAthlete.HasMedicalCondition
                    ? selectedMedicalAthlete.MedicalCondition ||
                      "Có lưu ý sức khỏe"
                    : "Không có bệnh nền"
                }
              />
              <InfoBox
                label="Ghi chú y tế"
                value={selectedMedicalAthlete.MedicalNotes || "Không có"}
              />
              <InfoBox
                label="Checkpoint gần nhất"
                value={
                  selectedMedicalAthlete.FinishTime
                    ? "FINISH"
                    : selectedMedicalAthlete.CP03Time
                    ? "CP03"
                    : selectedMedicalAthlete.CP02Time
                    ? "CP02"
                    : selectedMedicalAthlete.CP01Time
                    ? "CP01"
                    : selectedMedicalAthlete.StartTime
                    ? "START"
                    : "Chưa START"
                }
              />
              <InfoBox
                label="Cảnh báo gần nhất"
                value={
                  selectedMedicalAthlete.latestAlert
                    ? `${selectedMedicalAthlete.latestAlert.AlertType} • ${
                        selectedMedicalAthlete.latestAlert.AlertStatus
                      }`
                    : "Không có"
                }
              />
            </div>

            {selectedMedicalAthlete.latestAlert && (
              <div style={{ padding: "0 20px 20px" }}>
                <div className="health-warning">
                  {selectedMedicalAthlete.latestAlert.AlertMessage ||
                    "Không có mô tả cảnh báo"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedResult && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedResult(null)}
        >
          <div
            className="ops-modal"
            style={{
              width: "min(1100px, 94vw)",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ops-modal-head">
              <div>
                <span>RESULT DETAIL</span>
                <h3>
                  {selectedResult.BibNumber} • {selectedResult.FullName}
                </h3>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedResult(null)}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "14px",
                padding: "20px"
              }}
            >
              <InfoBox label="Họ tên" value={selectedResult.FullName} />
              <InfoBox label="BIB" value={selectedResult.BibNumber} />
              <InfoBox label="Cự ly" value={selectedResult.Distance} />
              <InfoBox
                label="Ngày sinh"
                value={
                  selectedResult.DateOfBirth
                    ? new Date(selectedResult.DateOfBirth).toLocaleDateString(
                        "vi-VN"
                      )
                    : "—"
                }
              />
              <InfoBox label="Giới tính" value={selectedResult.Gender || "—"} />
              <InfoBox label="Số điện thoại" value={selectedResult.Phone || "—"} />
              <InfoBox label="Email" value={selectedResult.Email || "—"} />
              <InfoBox
                label="Trạng thái đăng ký"
                value={selectedResult.RegistrationStatus || "—"}
              />
              <InfoBox
                label="Trạng thái cuộc đua"
                value={selectedResult.RunStatus || "—"}
              />
              <InfoBox
                label="Trạng thái kết quả"
                value={selectedResult.ResultStatus || "—"}
              />
              <InfoBox
                label="BTC duyệt"
                value={selectedResult.ApprovedBy || "—"}
              />
              <InfoBox
                label="Thời gian duyệt"
                value={formatDateTime(selectedResult.ApprovedAt)}
              />
              <InfoBox
                label="Tổng thời gian"
                value={formatDuration(selectedResult.TotalTimeSeconds)}
              />
              <InfoBox
                label="Xếp hạng cùng cự ly"
                value={getResultRankLabel(athletes, selectedResult)}
              />
              <InfoBox
                label="Thông tin y tế"
                value={
                  selectedResult.HasMedicalCondition
                    ? selectedResult.MedicalCondition || "Có lưu ý sức khỏe"
                    : "Không có bệnh nền"
                }
              />
            </div>

            {selectedResult.MedicalNotes && (
              <div style={{ padding: "0 20px 18px" }}>
                <div className="health-warning">
                  ♡ Ghi chú y tế: {selectedResult.MedicalNotes}
                </div>
              </div>
            )}

            <div style={{ padding: "0 20px 20px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                Thời gian từng checkpoint
              </h3>

              <ResultCheckpointTable athlete={selectedResult} />
            </div>
          </div>
        </div>
      )}

      {medicalForm && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setMedicalForm(null)}
        >
          <div
            className="ops-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ops-modal-head">
              <div>
                <span>MEDICAL ALERT</span>
                <h3>
                  Báo sự cố • {medicalForm.BibNumber}
                </h3>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setMedicalForm(null)}
              >
                
              </button>
            </div>

            <div className="modal-form">
              <label>
                Loại sự cố

                <select
                  value={medicalType}
                  onChange={(event) =>
                    setMedicalType(event.target.value)
                  }
                >
                  <option value="INJURY">Chấn thương</option>
                  <option value="CHEST_PAIN">Đau ngực</option>
                  <option value="DIZZINESS">
                    Chóng mặt / choáng
                  </option>
                  <option value="BREATHING">
                    Khó thở
                  </option>
                  <option value="DEHYDRATION">
                    Mất nước
                  </option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>

              <label>
                Mô tả tình trạng

                <textarea
                  rows="4"
                  value={medicalNote}
                  onChange={(event) =>
                    setMedicalNote(event.target.value)
                  }
                  placeholder="Nhập tình trạng VĐV..."
                />
              </label>
            </div>

            <div className="ops-modal-actions">
              <button
                type="button"
                className="ghost-modal"
                onClick={() => setMedicalForm(null)}
              >
                HỦY
              </button>

              <button
                type="button"
                className="primary-modal"
                disabled={Boolean(busy)}
                onClick={submitMedicalAlert}
              >
                {busy
                  ? "ĐANG XỬ LÝ..."
                  : "🚨 GỬI CẢNH BÁO Y TẾ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, note, tone }) {
  return (
    <article className={`stat-card ${tone || ""}`}>
      <div className="stat-head">
        <span className="stat-icon">{icon}</span>
        <span className="mini-chart">⌁</span>
      </div>

      <strong className="stat-value">{value}</strong>
      <span className="stat-label">{label}</span>
      <small>{note}</small>
    </article>
  );
}

function PanelHead({ title, sub }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>

      <span className="online">● Live</span>
    </div>
  );
}

function Search({ value, setValue }) {
  return (
    <div className="search">
      ⌕

      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Tìm theo BIB hoặc tên VĐV..."
      />
    </div>
  );
}

function AthleteTable({ rows, detailed = false }) {
  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("vi-VN");
  };

  if (detailed) {
    return (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>BIB</th>
              <th>Vận động viên</th>
              <th>Cự ly</th>
              <th>Số điện thoại</th>
              <th>Email</th>
              <th>Ngày sinh</th>
              <th>Giới tính</th>
              <th>Bệnh lý</th>
              <th>Trạng thái</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="9">Chưa có dữ liệu</td>
              </tr>
            ) : (
              rows.map((athlete) => (
                <tr key={athlete.BibNumber}>
                  <td>
                    <b>{athlete.BibNumber}</b>
                  </td>

                  <td>{athlete.FullName || "—"}</td>

                  <td>
                    <span className="distance">
                      {athlete.Distance || "—"}
                    </span>
                  </td>

                  <td>{athlete.Phone || "—"}</td>

                  <td
                    style={{
                      maxWidth: "220px",
                      overflowWrap: "anywhere"
                    }}
                  >
                    {athlete.Email || "—"}
                  </td>

                  <td>{formatDate(athlete.DateOfBirth)}</td>

                  <td>{athlete.Gender || "—"}</td>

                  <td
                    style={{
                      maxWidth: "240px",
                      overflowWrap: "anywhere"
                    }}
                  >
                    {athlete.HasMedicalCondition ? (
                      <div>
                        <span className="medical-tag">
                          ♡ {athlete.MedicalCondition || "Có lưu ý sức khỏe"}
                        </span>

                        {athlete.MedicalNotes && (
                          <div
                            style={{
                              marginTop: "5px",
                              fontSize: "12px",
                              opacity: 0.7,
                              lineHeight: 1.4
                            }}
                          >
                            {athlete.MedicalNotes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.72 }}>
                        Không có bệnh nền
                      </span>
                    )}
                  </td>

                  <td>
                    <StatusBadge
                      status={
                        athlete.RunStatus ||
                        athlete.RegistrationStatus
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: "56px" }}>#</th>
            <th>BIB</th>
            <th>Vận động viên</th>
            <th>Cự ly</th>
            <th>START</th>
            <th>CP1</th>
            <th>CP2</th>
            <th>CP3</th>
            <th>FINISH</th>
            <th>Trạng thái</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="9">Chưa có dữ liệu</td>
            </tr>
          ) : (
            rows.map((athlete, index) => (
              <tr key={athlete.BibNumber}>
                <td>
                  <b style={{ opacity: 0.75 }}>{index + 1}</b>
                </td>

                <td>
                  <b>{athlete.BibNumber}</b>
                </td>

                <td>{athlete.FullName}</td>

                <td>
                  <span className="distance">
                    {athlete.Distance}
                  </span>
                </td>

                <td>{formatTime(athlete.StartTime)}</td>
                <td>{formatTime(athlete.CP01Time)}</td>
                <td>{formatTime(athlete.CP02Time)}</td>
                <td>{formatTime(athlete.CP03Time)}</td>
                <td>{formatTime(athlete.FinishTime)}</td>

                <td>
                  <StatusBadge
                    status={
                      athlete.RunStatus ||
                      athlete.RegistrationStatus
                    }
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LiveAthleteTable({
  rows,
  pendingMedicalByBib
}) {
  const medicalLabel = (athlete) => {
    const pendingAlert = pendingMedicalByBib.get(
      athlete.BibNumber
    );

    if (pendingAlert) {
      return (
        <span
          className="medical-tag"
          style={{
            color: "#ff8a4c"
          }}
        >
          🚨 Đang xử lý
        </span>
      );
    }

    if (athlete.HasMedicalCondition) {
      return (
        <span className="medical-tag">
          ♡ {athlete.MedicalCondition || "Có lưu ý"}
        </span>
      );
    }

    return (
      <span style={{ opacity: 0.62 }}>
        Bình thường
      </span>
    );
  };

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>BIB</th>
            <th>Vận động viên</th>
            <th>Cự ly</th>
            <th>START</th>
            <th>CP1</th>
            <th>CP2</th>
            <th>CP3</th>
            <th>FINISH</th>
            <th>Y tế</th>
            <th>Trạng thái</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="11">
                Chưa có VĐV đang chạy
              </td>
            </tr>
          ) : (
            rows.map((athlete) => (
              <tr key={athlete.BibNumber}>
                <td>
                  <b>{athlete.BibNumber}</b>
                </td>

                <td>{athlete.FullName}</td>

                <td>
                  <span className="distance">
                    {athlete.Distance}
                  </span>
                </td>

                <td>{formatTime(athlete.StartTime)}</td>
                <td>{formatTime(athlete.CP01Time)}</td>
                <td>{formatTime(athlete.CP02Time)}</td>
                <td>{formatTime(athlete.CP03Time)}</td>
                <td>{formatTime(athlete.FinishTime)}</td>

                <td>{medicalLabel(athlete)}</td>

                <td>
                  <StatusBadge status={athlete.RunStatus} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CheckInAthleteTable({
  title,
  subtitle,
  rows,
  selectable = false,
  selectedBibs = [],
  onToggle
}) {
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: selectable ? "12px 12px 0 0" : "12px",
      overflow: "hidden"
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "12px", padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        <div>
          <b>{title}</b>
          <div style={{ marginTop: "3px", fontSize: "12px", opacity: 0.62 }}>
            {subtitle}
          </div>
        </div>
        <span className="online">{rows.length} VĐV</span>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && <th style={{ width: "64px" }}>Chọn</th>}
              <th>BIB</th>
              <th>Vận động viên</th>
              <th>Cự ly</th>
              <th>Y tế</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={selectable ? 6 : 5}>
                  {selectable ? "Không còn VĐV chờ check-in" : "Chưa có VĐV đã check-in"}
                </td>
              </tr>
            ) : (
              rows.map((athlete) => {
                const checked = selectedBibs.includes(athlete.BibNumber);
                return (
                  <tr
                    key={athlete.BibNumber}
                    onClick={
                      selectable ? () => onToggle(athlete.BibNumber) : undefined
                    }
                    style={{
                      cursor: selectable ? "pointer" : undefined,
                      background:
                        selectable && checked
                          ? "rgba(255,255,255,0.035)"
                          : undefined
                    }}
                  >
                    {selectable && (
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(athlete.BibNumber)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Chọn ${athlete.BibNumber}`}
                          style={{ width: "18px", height: "18px", cursor: "pointer" }}
                        />
                      </td>
                    )}
                    <td><b>{athlete.BibNumber}</b></td>
                    <td>{athlete.FullName}</td>
                    <td><span className="distance">{athlete.Distance}</span></td>
                    <td>
                      {athlete.HasMedicalCondition ? (
                        <span className="medical-tag">♡ Có lưu ý</span>
                      ) : "—"}
                    </td>
                    <td>
                      <StatusBadge
                        status={athlete.RunStatus || athlete.RegistrationStatus}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const value = String(status || "UNKNOWN");

  return (
    <span
      className={`status-badge s-${value.toLowerCase()}`}
    >
      <i />
      {value}
    </span>
  );
}

function RaceCard({ athlete, busy, onAction, onMedical }) {
  const nextAction = (() => {
    if (athlete.RunStatus === "STOPPED") return null;
    if (athlete.RunStatus === "FINISHED") return null;

    if (!athlete.StartTime) return "START";
    if (!athlete.CP01Time) return "CP01";
    if (!athlete.CP02Time) return "CP02";
    if (!athlete.CP03Time) return "CP03";
    if (!athlete.FinishTime) return "FINISH";

    return null;
  })();

  const steps = [
    ["START", athlete.StartTime],
    ["CP01", athlete.CP01Time],
    ["CP02", athlete.CP02Time],
    ["CP03", athlete.CP03Time],
    ["FINISH", athlete.FinishTime]
  ];

  return (
    <article
      className={`race-card ${String(
        athlete.RunStatus || "ready"
      ).toLowerCase()}`}
    >
      <div className="race-card-head">
        <div>
          <span>{athlete.BibNumber}</span>
          <h3>{athlete.FullName}</h3>
          <small>{athlete.Distance}</small>
        </div>

        <StatusBadge
          status={
            athlete.RunStatus ||
            athlete.RegistrationStatus
          }
        />
      </div>

      {athlete.HasMedicalCondition && (
        <div className="health-warning">
          ♡ {athlete.MedicalCondition || "Có lưu ý sức khỏe"}
          {athlete.MedicalNotes
            ? ` • ${athlete.MedicalNotes}`
            : ""}
        </div>
      )}

      <div className="race-timeline">
        {steps.map(([label, value]) => {
          const done = Boolean(value);
          const current = nextAction === label;

          return (
            <div
              key={label}
              className={`tl-step ${
                done ? "done" : ""
              } ${current ? "current" : ""}`}
            >
              <div className="tl-dot">
                {done ? "✓" : "•"}
              </div>

              <div>
                <b>{label}</b>
                <small>
                  {done
                    ? formatTime(value)
                    : current
                    ? "Sẵn sàng ghi nhận"
                    : "Đang chờ"}
                </small>
              </div>

              {current && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    onAction(athlete, label)
                  }
                >
                  {label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {athlete.FinishTime && (
        <div className="health-warning">
          TOTAL TIME:{" "}
          <b>
            {formatDuration(athlete.TotalTimeSeconds)}
          </b>{" "}
          • Result: {athlete.ResultStatus || "PENDING"}
        </div>
      )}

      {athlete.RunStatus === "RUNNING" && (
        <div className="race-actions">
          <button
            type="button"
            className="danger"
            onClick={() => onMedical(athlete)}
          >
            🚨 BÁO Y TẾ
          </button>
        </div>
      )}
    </article>
  );
}

function Case({
  title,
  status,
  meta,
  body,
  warning,
  children,
  onClick
}) {
  return (
    <article
      className="case-card"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : undefined
      }}
    >
      <div className="case-head">
        <div>
          <h3>{title}</h3>
          <small>{meta}</small>
        </div>

        <StatusBadge status={status} />
      </div>

      {warning && (
        <div className="health-warning">
          {warning}
        </div>
      )}

      <p>{body || "—"}</p>

      <div className="case-actions">
        {children}
      </div>
    </article>
  );
}

function TimePoint({ label, value }) {
  return (
    <div className="time-point">
      <span>{label}</span>
      <strong>{formatTime(value)}</strong>
    </div>
  );
}

function getResultRankNumber(athletes, athlete) {
  if (
    !athlete ||
    athlete.ResultStatus !== "OFFICIAL" ||
    athlete.TotalTimeSeconds === null ||
    athlete.TotalTimeSeconds === undefined
  ) {
    return "—";
  }

  const sameDistanceOfficial = athletes
    .filter(
      (item) =>
        item.ResultStatus === "OFFICIAL" &&
        item.Distance === athlete.Distance &&
        item.TotalTimeSeconds !== null &&
        item.TotalTimeSeconds !== undefined
    )
    .map((item) => Number(item.TotalTimeSeconds))
    .filter((value) => Number.isFinite(value));

  const targetTime = Number(athlete.TotalTimeSeconds);

  if (!Number.isFinite(targetTime) || sameDistanceOfficial.length === 0) {
    return "—";
  }

  // Standard competition ranking:
  // 1, 1, 3, 4...
  // VĐV có cùng TotalTimeSeconds trong cùng cự ly sẽ đồng hạng.
  return sameDistanceOfficial.filter((time) => time < targetTime).length + 1;
}

function getResultRankLabel(athletes, athlete) {
  if (
    !athlete ||
    athlete.ResultStatus !== "OFFICIAL" ||
    athlete.TotalTimeSeconds === null ||
    athlete.TotalTimeSeconds === undefined
  ) {
    return "Chưa xếp hạng";
  }

  const sameDistanceOfficial = athletes
    .filter(
      (item) =>
        item.ResultStatus === "OFFICIAL" &&
        item.Distance === athlete.Distance &&
        item.TotalTimeSeconds !== null &&
        item.TotalTimeSeconds !== undefined
    )
    .map((item) => Number(item.TotalTimeSeconds))
    .filter((value) => Number.isFinite(value));

  const targetTime = Number(athlete.TotalTimeSeconds);

  if (!Number.isFinite(targetTime) || sameDistanceOfficial.length === 0) {
    return "Chưa xếp hạng";
  }

  const rank =
    sameDistanceOfficial.filter((time) => time < targetTime).length + 1;

  return `${rank} / ${sameDistanceOfficial.length}`;
}

function InfoBox({ label, value }) {
  return (
    <div
      style={{
        padding: "14px",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.025)",
        minWidth: 0
      }}
    >
      <small
        style={{
          display: "block",
          opacity: 0.65,
          marginBottom: "5px"
        }}
      >
        {label}
      </small>

      <strong style={{ overflowWrap: "anywhere" }}>{value || "—"}</strong>
    </div>
  );
}

function ResultCheckpointTable({ athlete }) {
  const secondsBetween = (start, end) => {
    if (!start || !end) return null;

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return null;
    }

    const seconds = Math.floor((endTime - startTime) / 1000);
    return seconds >= 0 ? seconds : null;
  };

  const rows = [
    {
      label: "START",
      time: athlete.StartTime,
      cumulative: 0,
      segment: null
    },
    {
      label: "CP01",
      time: athlete.CP01Time,
      cumulative: secondsBetween(athlete.StartTime, athlete.CP01Time),
      segment: secondsBetween(athlete.StartTime, athlete.CP01Time)
    },
    {
      label: "CP02",
      time: athlete.CP02Time,
      cumulative: secondsBetween(athlete.StartTime, athlete.CP02Time),
      segment: secondsBetween(athlete.CP01Time, athlete.CP02Time)
    },
    {
      label: "CP03",
      time: athlete.CP03Time,
      cumulative: secondsBetween(athlete.StartTime, athlete.CP03Time),
      segment: secondsBetween(athlete.CP02Time, athlete.CP03Time)
    },
    {
      label: "FINISH",
      time: athlete.FinishTime,
      cumulative: athlete.TotalTimeSeconds,
      segment: secondsBetween(athlete.CP03Time, athlete.FinishTime)
    }
  ];

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Mốc</th>
            <th>Thời điểm ghi nhận</th>
            <th>Tổng thời gian từ START</th>
            <th>Thời gian chặng</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>
                <b>{row.label}</b>
              </td>
              <td>{formatDateTime(row.time)}</td>
              <td className="mono">{formatDuration(row.cumulative)}</td>
              <td className="mono">
                {row.segment === null ? "—" : formatDuration(row.segment)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

