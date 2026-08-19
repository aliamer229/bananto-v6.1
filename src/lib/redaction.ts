/** Remove internal assistant reasoning/memory before returning a chat message. */
export function redactMessageForMember<T extends { body: Record<string, unknown> }>(message: T): T {
  if (!("support" in message.body)) return message;
  const { support: _support, ...body } = message.body;
  return { ...message, body };
}

/** Remove staff identity and private notes from an order status audit row. */
export function redactOrderHistoryForMember<T extends Record<string, unknown>>(row: T) {
  const { changed_by: _actor, note: _note, ...publicRow } = row;
  return publicRow;
}

/** Remove fields intended only for staff from the member's trade response. */
export function redactDiscTradeForMember<T extends Record<string, unknown>>(row: T) {
  const {
    admin_notes: _adminNotes,
    thread_id: _threadId,
    status_history: rawHistory,
    ...publicRow
  } = row;

  let statusHistory: unknown = rawHistory;
  if (typeof rawHistory === "string") {
    try {
      const parsed = JSON.parse(rawHistory);
      statusHistory = Array.isArray(parsed)
        ? JSON.stringify(
            parsed.map((entry) => {
              if (!entry || typeof entry !== "object") return entry;
              const record = entry as Record<string, unknown>;
              return { status: record["status"], at: record["at"] };
            }),
          )
        : "[]";
    } catch {
      statusHistory = "[]";
    }
  }

  return { ...publicRow, status_history: statusHistory };
}
