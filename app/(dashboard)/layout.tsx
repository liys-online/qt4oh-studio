import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 50%, #faf5ff 100%)" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: 240, minHeight: "100vh", minWidth: 0 }}>
        {/* 装饰圆 */}
        <div style={{ position: "fixed", top: 0, right: 0, width: 384, height: 384, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div style={{ position: "fixed", bottom: 0, left: 0, width: 320, height: 320, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)", transform: "translate(-20%, 30%)" }} />
        <div style={{ position: "relative", padding: "24px 32px" }}>{children}</div>
      </main>
    </div>
  );
}
