const items = [
  ["overview", "▦", "Tổng quan"],
  ["checkin", "✓", "Check-in"],
  ["athletes", "♙", "Vận động viên"],
  ["race", "⌖", "Race Control"],
  ["live", "⌁", "Theo dõi Live"],
  ["medical", "♡", "Y tế"],
  ["results", "♕", "Kết quả"],
  ["complaints", "☏", "Khiếu nại"]
];

const permissions = {
  ADMIN: items.map((item) => item[0]),

  BTC: [
    "overview",
    "checkin",
    "athletes",
    "race",
    "live",
    "medical",
    "results",
    "complaints"
  ],

  TNV: [
    "checkin",
    "race",
    "live"
  ],

  MEDICAL: [
    "overview",
    "live",
    "medical"
  ]
};

export default function Sidebar({
  active,
  setActive,
  badges = {},
  session
}) {
  const visible =
    permissions[session?.role] ||
    permissions.BTC;

  const handleLogout = () => {
    localStorage.removeItem("raceSession");
    window.location.href = "/admin/login";
  };

  return (
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
        {items
          .filter(([id]) => visible.includes(id))
          .map(([id, icon, title]) => (
            <button
              key={id}
              type="button"
              className={active === id ? "active" : ""}
              onClick={() => setActive(id)}
            >
              <span>{icon}</span>

              {title}

              {badges[id] > 0 && (
                <em>{badges[id]}</em>
              )}
            </button>
          ))}
      </nav>

      <div className="sidebar-user">
        <b>{session?.name || "Operator"}</b>
        <small>{session?.role || "BTC"}</small>

        <button
          type="button"
          onClick={handleLogout}
        >
          ⇥ Đăng xuất
        </button>
      </div>
    </aside>
  );
}