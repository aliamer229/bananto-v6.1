import { d1First, d1All, d1Run, d1RunChanges } from "./d1.server";
import { randomId } from "./crypto.server";
import {
  sendTelegramMessage,
  editTelegramMessageText,
  getChatMember,
  escapeHtml,
} from "./telegram.server";

export interface ContestEntryResult {
  ok: boolean;
  reason?: "not_found" | "closed" | "already_entered";
  title?: string;
  prize?: string;
  entries?: number;
}

/**
 * Register a member's entry from the contest link.
 *
 * The table's UNIQUE(contest_id, telegram_user_id) is what makes a second tap
 * harmless: the insert is attempted and a duplicate is reported as an existing
 * entry rather than adding a second ticket.
 */
export async function enterContest(
  contestId: string,
  from: { id?: unknown; username?: string; first_name?: string } | undefined,
): Promise<ContestEntryResult> {
  const telegramUserId = Number(from?.id);
  if (!contestId || !Number.isSafeInteger(telegramUserId)) {
    return { ok: false, reason: "not_found" };
  }

  const contest = await d1First<{ title: string; prize: string; status: string }>(
    `SELECT title, prize, status FROM telegram_contests WHERE id = ?`,
    contestId,
  );
  if (!contest) return { ok: false, reason: "not_found" };
  if (contest.status !== "active") {
    return { ok: false, reason: "closed", title: contest.title, prize: contest.prize };
  }

  const existing = await d1First<{ id: string }>(
    `SELECT id FROM telegram_contest_entries WHERE contest_id = ? AND telegram_user_id = ?`,
    contestId,
    telegramUserId,
  );

  if (!existing) {
    await d1Run(
      `INSERT OR IGNORE INTO telegram_contest_entries
         (id, contest_id, telegram_user_id, telegram_username, first_name, tickets, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      randomId("entry"),
      contestId,
      telegramUserId,
      from?.username ?? null,
      from?.first_name ?? null,
      new Date().toISOString(),
    );
  }

  const total = await d1First<{ count: number }>(
    `SELECT COUNT(*) as count FROM telegram_contest_entries WHERE contest_id = ?`,
    contestId,
  );

  return {
    ok: true,
    ...(existing ? { reason: "already_entered" as const } : {}),
    title: contest.title,
    prize: contest.prize,
    entries: Number(total?.count ?? 0),
  };
}

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
