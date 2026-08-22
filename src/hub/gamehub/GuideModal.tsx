export function GuideModal({ game, guide, onClose }: any) {
  if (!guide) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ background: "white", padding: 20, borderRadius: 8 }}>
        <h2>{guide.title || "Guide"}</h2>
        <p>Mock Guide Modal</p>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
