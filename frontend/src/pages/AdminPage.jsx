import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import RaceTimeline from "../components/RaceTimeline";

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
  if (seconds == null) return "—";

  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

export default function AdminPage() {
  const session = JSON.parse(localStorage.getItem("raceSession") || "{}");

  const [active, setActive] = useState("overview");
  const [athletes, setAthletes] = useState([]);
  const [medical, setMedical] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [audit, setAudit] = useState([]);

  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [checkBib, setCheckBib] = useState("");
  const [modal, setModal] = useState(null);
  const [expandedComplaint, setExpandedComplaint] = useState(null);

  async function load() {
    try {
      const [athleteData, medicalData, exceptionData, reviewData, complaintData, auditData] =
        await Promise.all([
          api("/dashboard/athletes"),
          api("/medical/alerts"),
          api("/race/exceptions"),
          api("/results/reviews"),
          api("/complaints"),
          api("/audit-logs")
        ]);

      setAthletes(athleteData.data || []);
      setMedical(medicalData.data || []);
      setExceptions(exceptionData.data || []);
      setReviews(reviewData.data || []);
      setComplaints(complaintData.data || []);
      setAudit(auditData.data || []);
    } catch (error) {
      show(error.message, false);
    }
  }

  useEffect(() => {
    load();

    const intervalID = setInterval(() => {
      load();
    }, 5000);

    return () => {
      clearInterval(intervalID);
    };
  }, []);

  function show(text, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3200);
  }

  async function act(key, path, body) {
    setBusy(key);

    try {
      const response = await api(path, {
        method: "POST",
        body: JSON.stringify(body)
      });

      show(response.message);
      await load();
      return response;
    } catch (error) {
      show(error.message, false);
      throw error;
    } finally {
      setBusy("");
    }
  }

  const stats = useMemo(
    () => ({
      total: athletes.length,
      checked: athletes.filter((athlete) => athlete.RegistrationStatus === "CHECKED_IN").length,
      running: athletes.filter((athlete) => athlete.RunStatus === "RUNNING").length,
      finished: athletes.filter((athlete) => athlete.RunStatus === "FINISHED").length,
      dnf: athletes.filter((athlete) => athlete.RunStatus === "STOPPED").length,
      medical: medical.filter((item) => item.AlertStatus === "PENDING").length,
      exceptions: exceptions.filter((item) => item.ExceptionStatus === "OPEN").length,
      reviews: reviews.filter((item) => item.ReviewStatus === "OPEN").length
    }),
    [athletes, medical, exceptions, reviews]
  );

  const registeredCount = athletes.filter(
    (athlete) => athlete.RegistrationStatus === "REGISTERED"
  ).length;

  const filtered = athletes.filter((athlete) =>
    `${athlete.BibNumber} ${athlete.FullName}`.toLowerCase().includes(search.toLowerCase())
  );

  const title = {
    overview: "Bảng điều khiển giải",
    checkin: "Check-in vận động viên",
    athletes: "Vận động viên",
    race: "Race Control",
    live: "Theo dõi Live",
    medical: "Medical Center",
    exceptions: "Checkpoint Exceptions",
    results: "Kết quả",
    reviews: "Result Reviews",
    complaints: "Khiếu nại",
    audit: "Audit Logs"
  }[active];

  const raceAction = (athlete, actionName) => {
    if (actionName === "START") {
      return act(`${athlete.BibNumber}START`, "/race/start", {
        bibNumber: athlete.BibNumber
      });
    }

    if (actionName === "FINISH") {
      return act(`${athlete.BibNumber}FINISH`, "/race/finish", {
        bibNumber: athlete.BibNumber
      });
    }

    return act(`${athlete.BibNumber}${actionName}`, "/race/checkpoint", {
      bibNumber: athlete.BibNumber,
      checkpointCode: actionName
    });
  };

  const checkInAll = async () => {
    if (registeredCount === 0) {
      show("Không còn VĐV nào ở trạng thái REGISTERED");
      return;
    }

    setModal({
      type: "confirm-checkin-all",
      title: "Check-in tất cả VĐV",
      count: registeredCount
    });
  };

  const submitModal = async () => {
    if (!modal) return;

    try {
      if (modal.type === "confirm-checkin-all") {
        await act("checkin-all", "/check-in/all", {});
      }

      if (modal.type === "medical") {
        await act(`med-${modal.athlete.BibNumber}`, "/medical/alert", {
          bibNumber: modal.athlete.BibNumber,
          alertType: modal.alertType,
          alertMessage: modal.note || "Cảnh báo từ Race Control"
        });
      }

      if (modal.type === "exception") {
        await act(`ex-${modal.athlete.BibNumber}`, "/race/exception", {
          bibNumber: modal.athlete.BibNumber,
          checkpointCode: modal.checkpointCode,
          reason: modal.reason,
          note: modal.note
        });
      }

      if (modal.type === "result-review") {
        await act(`rv-${modal.athlete.ResultID}`, "/results/review", {
          resultID: modal.athlete.ResultID,
          reviewReason: modal.reason,
          reviewNote: modal.note
        });
      }

      setModal(null);
    } catch (_) {
      // act() already displays the API error in a toast.
    }
  };

  return (
    <div className="admin-app">
      <Sidebar
        active={active}
        setActive={setActive}
        session={session}
        badges={{
          medical: stats.medical,
          exceptions: stats.exceptions,
          reviews: stats.reviews,
          complaints: complaints.filter((item) => item.ComplaintStatus === "OPEN").length
        }}
      />

      <main className="admin-content">
        <Topbar title={title} onRefresh={load} />

        {toast && <div className={`toast ${toast.ok ? "ok" : "bad"}`}>{toast.text}</div>}

        {active === "overview" && (
          <>
            <div className="stats-grid">
              <StatCard icon="🏃" label="Đang trên đường" value={stats.running} note={`trong tổng ${stats.total} VĐV`} tone="cyan" />
              <StatCard icon="🏆" label="Đã về đích" value={stats.finished} note="FINISHED" tone="green" />
              <StatCard icon="⊗" label="Không hoàn thành" value={stats.dnf} note="STOPPED / DNF" tone="red" />
              <StatCard icon="♡" label="Sự cố y tế" value={stats.medical} note="Cần xử lý" tone="orange" />
              <StatCard icon="⌖" label="Exception" value={stats.exceptions} note="Checkpoint cần xác minh" tone="blue" />
              <StatCard icon="◈" label="Review" value={stats.reviews} note="Kết quả cần BTC xử lý" tone="purple" />
            </div>

            <section className="panel">
              <PanelHead title="Bảng theo dõi trực tiếp" sub={`${athletes.length} vận động viên`} />
              <Search value={search} set={setSearch} />
              <AthleteTable rows={filtered} />
            </section>
          </>
        )}

        {active === "checkin" && (
          <section className="panel checkin-panel-wide">
            <PanelHead
              title="Check-in Race Day"
              sub="Quét/nhập BIB hoặc dùng check-in hàng loạt để test nhanh"
            />

            <div className="checkin-actions-grid">
              <form
                className="action-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const bibNumber = checkBib.trim().toUpperCase();
                  if (!bibNumber) return;
                  act("checkin", "/check-in", { bibNumber });
                  setCheckBib("");
                }}
              >
                <input
                  value={checkBib}
                  onChange={(event) => setCheckBib(event.target.value)}
                  placeholder="BIB001"
                  autoFocus
                />
                <button disabled={busy === "checkin"}>✓ CHECK-IN BIB</button>
              </form>

              <button
                type="button"
                className="bulk-checkin-button"
                onClick={checkInAll}
                disabled={busy === "checkin-all" || registeredCount === 0}
              >
                <span>✓✓</span>
                <div>
                  <b>CHECK-IN TẤT CẢ</b>
                  <small>{registeredCount} VĐV đang chờ check-in</small>
                </div>
              </button>
            </div>

            <div className="mini-list">
              {athletes
                .filter((athlete) => athlete.RegistrationStatus === "CHECKED_IN")
                .slice(0, 12)
                .map((athlete) => (
                  <div key={athlete.BibNumber}>
                    <b>{athlete.BibNumber}</b>
                    <span>{athlete.FullName}</span>
                    <StatusBadge status="CHECKED_IN" />
                  </div>
                ))}
            </div>
          </section>
        )}

        {active === "athletes" && (
          <section className="panel">
            <PanelHead title="Danh sách vận động viên" sub="Thông tin đăng ký, cự ly và tình trạng sức khỏe" />
            <Search value={search} set={setSearch} />
            <AthleteTable rows={filtered} detailed />
          </section>
        )}

        {active === "race" && (
          <>
            <div className="race-toolbar">
              <Search value={search} set={setSearch} />
              <span>{stats.running} RUNNING • {stats.checked} CHECKED-IN</span>
            </div>

            <div className="race-grid">
              {filtered
                .filter((athlete) => athlete.RegistrationStatus === "CHECKED_IN")
                .map((athlete) => (
                  <article
                    className={`race-card ${String(athlete.RunStatus || "ready").toLowerCase()}`}
                    key={athlete.BibNumber}
                  >
                    <div className="race-card-head">
                      <div>
                        <span>{athlete.BibNumber}</span>
                        <h3>{athlete.FullName}</h3>
                        <small>{athlete.Distance}</small>
                      </div>
                      <StatusBadge status={athlete.RunStatus || "READY"} />
                    </div>

                    {athlete.HasMedicalCondition && (
                      <div className="health-warning">♡ {athlete.MedicalCondition}</div>
                    )}

                    <RaceTimeline
                      a={athlete}
                      busy={busy.startsWith(athlete.BibNumber)}
                      onAction={(actionName) => raceAction(athlete, actionName)}
                    />

                    {athlete.RunStatus === "RUNNING" && (
                      <div className="race-actions">
                        <button
                          className="danger"
                          onClick={() =>
                            setModal({
                              type: "medical",
                              title: `Báo sự cố y tế • ${athlete.BibNumber}`,
                              athlete,
                              alertType: "INJURY",
                              note: ""
                            })
                          }
                        >
                          🚨 BÁO Y TẾ
                        </button>

                        <button
                          className="warning"
                          onClick={() =>
                            setModal({
                              type: "exception",
                              title: `Tạo Checkpoint Exception • ${athlete.BibNumber}`,
                              athlete,
                              checkpointCode: "CP01",
                              reason: "MISSING_SCAN",
                              note: "Không ghi nhận được dữ liệu tại checkpoint"
                            })
                          }
                        >
                          ⚠ TẠO EXCEPTION
                        </button>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          </>
        )}

        {active === "live" && (
          <section className="live-layout">
            <div className="panel">
              <PanelHead title="Live Leaderboard" sub="Tự động làm mới mỗi 15 giây" />
              <AthleteTable rows={athletes.filter((athlete) => ["RUNNING", "FINISHED"].includes(athlete.RunStatus))} />
            </div>

            <div className="panel checkpoint-health">
              <PanelHead title="Trạng thái checkpoint" sub="Coverage hiện tại" />
              {["START", "CP01", "CP02", "CP03", "FINISH"].map((key) => {
                const count = athletes.filter((athlete) =>
                  key === "START"
                    ? athlete.StartTime
                    : key === "FINISH"
                    ? athlete.FinishTime
                    : athlete[`${key}Time`]
                ).length;

                const percent = athletes.length ? Math.round((count / athletes.length) * 100) : 0;

                return (
                  <div className="coverage" key={key}>
                    <b>{key}<span>{percent}%</span></b>
                    <div><i style={{ width: `${percent}%` }} /></div>
                    <small>{count}/{athletes.length} VĐV</small>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {active === "medical" && (
          <section className="panel">
            <PanelHead title="Medical Center" sub="Cảnh báo y tế và quyết định tiếp tục/dừng" />
            <div className="case-grid">
              {medical.map((item) => (
                <Case
                  key={item.AlertID}
                  title={`${item.BibNumber} • ${item.FullName}`}
                  status={item.AlertStatus}
                  meta={`${item.AlertType} • ${formatDateTime(item.CreatedAt)}`}
                  body={item.AlertMessage || "Không có ghi chú"}
                  warning={item.HasMedicalCondition ? `Bệnh nền: ${item.MedicalCondition} • ${item.MedicalNotes || ""}` : null}
                >
                  {item.AlertStatus === "PENDING" && (
                    <>
                      <button onClick={() => act(`m${item.AlertID}`, "/medical/decision", { alertID: item.AlertID, decision: "CONTINUE" })}>✓ CONTINUE</button>
                      <button className="danger" onClick={() => act(`m${item.AlertID}`, "/medical/decision", { alertID: item.AlertID, decision: "STOP" })}>⛔ STOP / DNF</button>
                    </>
                  )}
                </Case>
              ))}
            </div>
          </section>
        )}

        {active === "exceptions" && (
          <section className="panel">
            <PanelHead title="Checkpoint Exceptions" sub="Nhánh NO: mất scan / thiếu dữ liệu → BTC xác minh" />
            <div className="case-grid">
              {exceptions.map((item) => (
                <Case
                  key={item.ExceptionID}
                  title={`${item.BibNumber} • ${item.CheckpointCode}`}
                  status={item.ExceptionStatus}
                  meta={`${item.FullName} • ${item.ExceptionType}`}
                  body={item.ExceptionNote}
                >
                  {item.ExceptionStatus === "OPEN" && (
                    <>
                      <button onClick={() => act(`e${item.ExceptionID}`, "/race/exception/resolve", { exceptionID: item.ExceptionID, decision: "CONFIRM_PASS", note: "BTC xác minh hợp lệ" })}>✓ XÁC NHẬN ĐÃ QUA CP</button>
                      <button className="danger" onClick={() => act(`e${item.ExceptionID}`, "/race/exception/resolve", { exceptionID: item.ExceptionID, decision: "DNF", note: "Không đủ bằng chứng" })}>DNF</button>
                    </>
                  )}
                </Case>
              ))}
            </div>
          </section>
        )}

        {active === "results" && (
          <section className="panel">
            <PanelHead title="Kết quả cuộc đua" sub="PENDING → DUYỆT hoặc REVIEW → OFFICIAL" />
            <table className="data-table">
              <thead>
                <tr><th>BIB</th><th>VĐV</th><th>Cự ly</th><th>Tổng TG</th><th>Trạng thái</th><th>BTC</th></tr>
              </thead>
              <tbody>
                {athletes.filter((athlete) => athlete.ResultID).map((athlete) => (
                  <tr key={athlete.ResultID}>
                    <td><b>{athlete.BibNumber}</b></td>
                    <td>{athlete.FullName}</td>
                    <td>{athlete.Distance}</td>
                    <td className="mono">{formatDuration(athlete.TotalTimeSeconds)}</td>
                    <td><StatusBadge status={athlete.ResultStatus} /></td>
                    <td>
                      {athlete.ResultStatus === "PENDING" && (
                        <div className="row-actions">
                          <button onClick={() => act(`ap${athlete.ResultID}`, "/results/approve", { resultID: athlete.ResultID })}>✓ DUYỆT</button>
                          <button
                            className="warning"
                            onClick={() =>
                              setModal({
                                type: "result-review",
                                title: `Đưa kết quả vào Review • ${athlete.BibNumber}`,
                                athlete,
                                reason: "ABNORMAL_TIME",
                                note: "Cần đối chiếu dữ liệu"
                              })
                            }
                          >
                            ⚠ XỬ LÝ
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {active === "reviews" && (
          <section className="panel">
            <PanelHead title="Result Review Center" sub="Xác minh kết quả bất thường và khiếu nại" />
            <div className="case-grid">
              {reviews.map((item) => (
                <Case
                  key={item.ReviewID}
                  title={`${item.BibNumber} • ${item.FullName}`}
                  status={item.ReviewStatus}
                  meta={`${item.ReviewSource} • ${item.ReviewReason}`}
                  body={item.ReviewNotes}
                >
                  {item.ReviewStatus === "OPEN" && (
                    <>
                      <button onClick={() => act(`r${item.ReviewID}`, "/results/review/resolve", { reviewID: item.ReviewID, resolution: "APPROVE", resolutionNotes: "BTC xác nhận hợp lệ" })}>✓ HỢP LỆ → OFFICIAL</button>
                      <button className="warning" onClick={() => act(`r${item.ReviewID}`, "/results/review/resolve", { reviewID: item.ReviewID, resolution: "RETURN_PENDING", resolutionNotes: "Trả về để điều chỉnh" })}>↩ TRẢ VỀ PENDING</button>
                    </>
                  )}
                </Case>
              ))}
            </div>
          </section>
        )}

        {active === "complaints" && (
          <section className="panel">
            <PanelHead
              title="Khiếu nại VĐV"
              sub="Bấm trạng thái OPEN để đối chiếu toàn bộ thời gian chạy trước khi quyết định"
            />

            <div className="case-grid">
              {complaints.map((complaint) => (
                <ComplaintCard
                  key={complaint.ComplaintID}
                  complaint={complaint}
                  expanded={expandedComplaint === complaint.ComplaintID}
                  onToggle={() =>
                    setExpandedComplaint((current) =>
                      current === complaint.ComplaintID ? null : complaint.ComplaintID
                    )
                  }
                  onKeepResult={async () => {
                    try {
                      await act(`ck${complaint.ComplaintID}`, "/complaints/resolve", {
                        complaintID: complaint.ComplaintID,
                        decision: "KEEP_RESULT",
                        note: "BTC đã đối chiếu START, checkpoint, FINISH và giữ nguyên kết quả"
                      });
                      setExpandedComplaint(null);
                    } catch (_) {
                      // act() already shows the server message in a toast.
                    }
                  }}
                  onReview={async () => {
                    try {
                      await act(`cr${complaint.ComplaintID}`, "/complaints/review", {
                        complaintID: complaint.ComplaintID
                      });
                      setExpandedComplaint(null);
                      setActive("reviews");
                    } catch (_) {
                      // act() already shows the server message in a toast.
                    }
                  }}
                  busy={busy}
                />
              ))}
            </div>
          </section>
        )}

        {active === "audit" && (
          <section className="panel">
            <PanelHead title="Audit Trail" sub="Lịch sử thao tác phục vụ truy vết" />
            <table className="data-table">
              <thead>
                <tr><th>Thời gian</th><th>Actor</th><th>Action</th><th>Entity</th><th>Chi tiết</th></tr>
              </thead>
              <tbody>
                {audit.map((item) => (
                  <tr key={item.AuditID}>
                    <td>{formatDateTime(item.CreatedAt)}</td>
                    <td>{item.Actor}</td>
                    <td><b>{item.Action}</b></td>
                    <td>{item.EntityType} #{item.EntityID || "—"}</td>
                    <td>{item.Detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>

      {modal && (
        <ProfessionalModal
          modal={modal}
          setModal={setModal}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
          busy={busy}
        />
      )}
    </div>
  );
}

function ProfessionalModal({ modal, setModal, onClose, onSubmit, busy }) {
  const update = (field, value) => setModal((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="ops-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ops-modal-head">
          <div>
            <span>RACE OPERATIONS</span>
            <h3>{modal.title}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {modal.type === "confirm-checkin-all" && (
          <div className="modal-confirm-box">
            <strong>{modal.count} VĐV</strong>
            <p>Toàn bộ VĐV còn ở trạng thái REGISTERED sẽ được chuyển sang CHECKED_IN. VĐV đã START, FINISH hoặc STOPPED không bị thay đổi.</p>
          </div>
        )}

        {modal.type === "medical" && (
          <div className="modal-form">
            <label>
              Loại sự cố
              <select value={modal.alertType} onChange={(event) => update("alertType", event.target.value)}>
                <option value="INJURY">Chấn thương</option>
                <option value="CHEST_PAIN">Đau ngực</option>
                <option value="DIZZINESS">Chóng mặt / choáng</option>
                <option value="BREATHING">Khó thở</option>
                <option value="DEHYDRATION">Mất nước</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
            <label>
              Mô tả tình trạng
              <textarea rows="4" value={modal.note} onChange={(event) => update("note", event.target.value)} placeholder="Nhập tình trạng VĐV..." />
            </label>
          </div>
        )}

        {modal.type === "exception" && (
          <div className="modal-form">
            <label>
              Checkpoint gặp lỗi
              <select value={modal.checkpointCode} onChange={(event) => update("checkpointCode", event.target.value)}>
                <option value="CP01">CP01</option>
                <option value="CP02">CP02</option>
                <option value="CP03">CP03</option>
              </select>
            </label>
            <label>
              Loại lỗi
              <select value={modal.reason} onChange={(event) => update("reason", event.target.value)}>
                <option value="MISSING_SCAN">Mất scan / không ghi nhận</option>
                <option value="DEVICE_ERROR">Lỗi thiết bị</option>
                <option value="DATA_MISMATCH">Dữ liệu không khớp</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
            <label>
              Ghi chú
              <textarea rows="4" value={modal.note} onChange={(event) => update("note", event.target.value)} placeholder="Mô tả sự cố checkpoint..." />
            </label>
          </div>
        )}

        {modal.type === "result-review" && (
          <div className="modal-form">
            <label>
              Lý do Review
              <select value={modal.reason} onChange={(event) => update("reason", event.target.value)}>
                <option value="ABNORMAL_TIME">Thời gian bất thường</option>
                <option value="CHECKPOINT_MISSING">Thiếu checkpoint</option>
                <option value="WRONG_BIB">Sai BIB / VĐV</option>
                <option value="DATA_VERIFICATION">Cần đối chiếu dữ liệu</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
            <label>
              Ghi chú BTC
              <textarea rows="4" value={modal.note} onChange={(event) => update("note", event.target.value)} placeholder="Nhập lý do cần xử lý..." />
            </label>
          </div>
        )}

        <div className="ops-modal-actions">
          <button type="button" className="ghost-modal" onClick={onClose}>HỦY</button>
          <button type="button" className="primary-modal" onClick={onSubmit} disabled={Boolean(busy)}>
            {busy ? "ĐANG XỬ LÝ..." : modal.type === "confirm-checkin-all" ? "✓ XÁC NHẬN CHECK-IN TẤT CẢ" : "XÁC NHẬN"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComplaintCard({ complaint, expanded, onToggle, onKeepResult, onReview, busy }) {
  return (
    <article className={`case-card complaint-card ${expanded ? "expanded" : ""}`}>
      <div className="case-head">
        <div>
          <h3>{complaint.BibNumber} • {complaint.FullName}</h3>
          <small>{complaint.ComplaintType} • Gửi lúc {formatDateTime(complaint.CreatedAt)}</small>
        </div>

        <button className="status-click" type="button" onClick={onToggle} title="Bấm để xem thời gian chạy">
          <StatusBadge status={complaint.ComplaintStatus} />
        </button>
      </div>

      <p>{complaint.ComplaintMessage || "—"}</p>

      {expanded && (
        <div className="complaint-detail">
          <div className="complaint-detail-title">
            <div>
              <span>ĐỐI CHIẾU KẾT QUẢ</span>
              <h4>Timeline của VĐV</h4>
            </div>
            <StatusBadge status={complaint.ResultStatus || "UNKNOWN"} />
          </div>

          <div className="complaint-timeline-grid">
            <TimePoint label="START" value={complaint.StartTime} />
            <TimePoint label="CP01" value={complaint.CP01Time} />
            <TimePoint label="CP02" value={complaint.CP02Time} />
            <TimePoint label="CP03" value={complaint.CP03Time} />
            <TimePoint label="FINISH" value={complaint.FinishTime} />
            <div className="time-point total">
              <span>TỔNG THỜI GIAN</span>
              <strong>{formatDuration(complaint.TotalTimeSeconds)}</strong>
            </div>
          </div>

          <div className="complaint-decision-help">
            <div>
              <b>Nếu dữ liệu đúng</b>
              <span>Đóng khiếu nại và giữ nguyên kết quả hiện tại.</span>
            </div>
            <div>
              <b>Nếu có sai lệch</b>
              <span>Chuyển sang REVIEW để BTC xác minh/điều chỉnh trước khi công bố lại.</span>
            </div>
          </div>

          {complaint.Resolution && (
            <div className="complaint-resolution">
              <b>Đã xử lý: {complaint.Resolution}</b>
              <span>{complaint.ResolutionNote || "—"}</span>
            </div>
          )}

          {complaint.ComplaintStatus === "OPEN" && (
            <div className="case-actions complaint-actions">
              <button type="button" onClick={onKeepResult} disabled={Boolean(busy)}>
                ✓ KẾT QUẢ ĐÚNG • GIỮ NGUYÊN
              </button>
              <button type="button" className="warning" onClick={onReview} disabled={Boolean(busy)}>
                ⚠ CÓ SAI LỆCH • CHUYỂN REVIEW
              </button>
            </div>
          )}
        </div>
      )}
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

function PanelHead({ title, sub }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      <span className="online">● Live</span>
    </div>
  );
}

function Search({ value, set }) {
  return (
    <div className="search">
      ⌕
      <input
        value={value}
        onChange={(event) => set(event.target.value)}
        placeholder="Tìm theo BIB hoặc tên VĐV..."
      />
    </div>
  );
}

function AthleteTable({ rows, detailed }) {
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
            {detailed && <th>Y tế</th>}
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((athlete) => (
            <tr key={athlete.BibNumber}>
              <td><b>{athlete.BibNumber}</b></td>
              <td>{athlete.FullName}</td>
              <td><span className="distance">{athlete.Distance}</span></td>
              <td>{formatTime(athlete.StartTime)}</td>
              <td>{formatTime(athlete.CP01Time)}</td>
              <td>{formatTime(athlete.CP02Time)}</td>
              <td>{formatTime(athlete.CP03Time)}</td>
              <td>{formatTime(athlete.FinishTime)}</td>
              {detailed && <td>{athlete.HasMedicalCondition ? <span className="medical-tag">♡ Có lưu ý</span> : "—"}</td>}
              <td><StatusBadge status={athlete.RunStatus || athlete.RegistrationStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Case({ title, status, meta, body, warning, children }) {
  return (
    <article className="case-card">
      <div className="case-head">
        <div>
          <h3>{title}</h3>
          <small>{meta}</small>
        </div>
        <StatusBadge status={status} />
      </div>
      {warning && <div className="health-warning">{warning}</div>}
      <p>{body || "—"}</p>
      <div className="case-actions">{children}</div>
    </article>
  );
}
