import type { SessionStatus } from "@humanlayer/shared";

const statuses: SessionStatus[] = ["created", "starting", "running", "stopping", "completed", "stopped", "failed"];

export default function App() {
  return (
    <div>
      <h1>HumanLayer Sync Agent</h1>
      <p>Session statuses: {statuses.join(", ")}</p>
    </div>
  );
}
