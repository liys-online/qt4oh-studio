import { Sidebar } from "@/components/Sidebar";
import { DevicesProvider } from "./devices-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DevicesProvider>
    <div style={{ display: "flex", minHeight: "100vh", background: "#f4f6f8" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: 240, minHeight: "100vh", minWidth: 0 }}>
        {/* 装饰圆 */}
        <div style={{ position: "fixed", top: 0, right: 0, width: 384, height: 384, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.04) 0%, transparent 70%)", transform: "translate(30%, -30%)" }}
        />
        <div style={{ position: "fixed", bottom: 0, left: 0, width: 320, height: 320, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(65,205,82,0.03) 0%, transparent 70%)", transform: "translate(-20%, 30%)" }} />
        <div style={{ position: "relative", padding: "24px 32px" }}>{children}</div>
      </main>
    </div>
    </DevicesProvider>
  );
}
