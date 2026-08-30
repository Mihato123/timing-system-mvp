import UserPage from "./pages/UserPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import AthleteLookupPage from "./pages/AthleteLookupPage";
import ResultLookupPage from "./pages/ResultLookupPage";
import ComplaintPage from "./pages/ComplaintPage";

export default function App() {
  const currentPath = window.location.pathname;

  if (currentPath === "/admin/login") {
    return <LoginPage />;
  }

  if (currentPath === "/athlete") {
    return <AthleteLookupPage />;
  }

  if (currentPath === "/results") {
    return <ResultLookupPage />;
  }

  if (currentPath === "/complaint") {
    return <ComplaintPage />;
  }

  if (currentPath === "/admin") {
    const currentSession = localStorage.getItem("raceSession");

    if (!currentSession) {
      window.location.replace("/admin/login");
      return null;
    }

    return <AdminPage />;
  }

  return <UserPage />;
}
