import { playSound } from "../utils/audio";
export default function TestAudio() {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 bg-card p-4 rounded-xl shadow-lg text-foreground">
      <button onClick={() => playSound("hover", 1)}>Play Hover</button>
      <button onClick={() => playSound("bumper_end", 1)}>Play Bumper</button>
      <button onClick={() => playSound("loading", 1)}>Play Loading</button>
    </div>
  );
}
