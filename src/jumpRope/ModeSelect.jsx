import { useGameStore } from "../store";
import "./modeSelect.css";

export function ModeSelect() {
  const setGameMode = useGameStore((state) => state.setGameMode);
  const gameMode = useGameStore((state) => state.gameMode);

  if (gameMode) return null;

  return (
    <div className="mode-select-overlay">
      <div className="mode-select-title">
        <h1>🏎️ 跳绳卡丁车</h1>
        <p>选择游戏模式</p>
      </div>
      <div className="mode-select-cards">
        <button className="mode-card mode-card-easy" onClick={() => setGameMode("easy")}>
          <span className="mode-emoji">🌟</span>
          <span className="mode-name">简单模式</span>
          <ul className="mode-features">
            <li>适合 4-5 岁</li>
            <li>✅ 自动转向辅助</li>
            <li>最高速度 20</li>
            <li>更宽的死区</li>
          </ul>
        </button>
        <button className="mode-card mode-card-normal" onClick={() => setGameMode("normal")}>
          <span className="mode-emoji">🏎️</span>
          <span className="mode-name">标准模式</span>
          <ul className="mode-features">
            <li>适合 8 岁+</li>
            <li>🎮 身体倾斜转向</li>
            <li>最高速度 70 (涡轮)</li>
            <li>漂移加速系统</li>
          </ul>
        </button>
      </div>
    </div>
  );
}
