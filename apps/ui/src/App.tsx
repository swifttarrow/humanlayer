import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessionsPage } from "./pages/SessionsPage.js";
import { NewSessionPage } from "./pages/NewSessionPage.js";
import { SessionDetailPage } from "./pages/SessionDetailPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionsPage />} />
        <Route path="/sessions/new" element={<NewSessionPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
