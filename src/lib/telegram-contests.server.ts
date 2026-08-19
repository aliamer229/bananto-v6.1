import { d1First, d1All, d1Run, d1RunChanges } from "./d1.server";
import { randomId } from "./crypto.server";
import {
  sendTelegramMessage,
  editTelegramMessageText,
  getChatMember,
  escapeHtml,
} from "./telegram.server";

export async function drawContest(contestId: string) {
  const claimed = await d1RunChanges(
    `UPDATE telegram_contests SET status = 'drawing' WHERE id = ? AND status = 'active'`,
    contestId,
  );
  if (claimed !== 1) return { ok: false, winners: 0 };

  const contest = await d1First<{ winners_count: number }>(
    `SELECT winners_count FROM telegram_contests WHERE id = ?`,
    contestId,
  );
  if (!contest) return { ok: false, winners: 0 };

  const entries = await d1All<{
    telegram_user_id: number;
    telegram_username: string;
    first_name: string;
    tickets: number;
  }>(
    `SELECT telegram_user_id, telegram_username, first_name, tickets FROM telegram_contest_entries WHERE contest_id = ?`,
    contestId,
  );

  if (entries.length === 0) {
    await d1Run(`UPDATE telegram_contests SET status = 'completed' WHERE id = ?`, contestId);
    return { ok: false, winners: 0 };
  }

  const winners: any[] = [];
  const winnersCount = Math.min(contest.winners_count, entries.length);

  const remaining = [...entries];
  for (let i = 0; i < winnersCount; i++) {
    const totalTickets = remaining.reduce(
      (sum, entry) => sum + Math.max(1, Math.min(10_000, Number(entry.tickets) || 1)),
      0,
    );
    if (!totalTickets) break;
    const random = new Uint32Array(1);
    const cutoff = Math.floor(0x1_0000_0000 / totalTickets) * totalTickets;
    do crypto.getRandomValues(random);
    while (random[0]! >= cutoff);
    let ticket = random[0]! % totalTickets;
    let winnerIndex = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      ticket -= Math.max(1, Math.min(10_000, Number(remaining[index]!.tickets) || 1));
      if (ticket < 0) {
        winnerIndex = index;
        break;
      }
    }
    const [winner] = remaining.splice(winnerIndex, 1);
    if (!winner) break;
    winners.push(winner);
  }

  for (const w of winners) {
    await d1Run(
      `INSERT INTO telegram_contest_winners (id, contest_id, telegram_user_id, telegram_username, first_name, won_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      randomId("winner"),
      contestId,
      w.telegram_user_id,
      w.telegram_username,
      w.first_name,
      new Date().toISOString(),
    );
  }

  await d1Run(`UPDATE telegram_contests SET status = 'completed' WHERE id = ?`, contestId);
  return { ok: true, winners: winners.length };
}
