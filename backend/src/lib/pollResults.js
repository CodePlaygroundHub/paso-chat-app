// Authoritative poll results with percentages that always sum to 100.
//
// The client computes percentages naively (round each independently), so three
// even options render as 33/33/33 = 99. This computes them server-side with the
// largest-remainder (Hamilton) method, which distributes the leftover points to
// the largest fractional remainders so the total is exactly 100. Pure — no DB,
// no socket, no request.

/**
 * @param {{ options?: Array<{ _id: any, text?: string, votes?: any[] }> }} poll
 * @returns {{ totalVotes: number, options: Array<{ _id: string, text: string, voteCount: number, percentage: number }>, leadingOptionId: string|null }}
 */
export const computePollResults = (poll) => {
  const rawOptions = Array.isArray(poll?.options) ? poll.options : [];

  const options = rawOptions.map((opt) => ({
    _id: opt?._id != null ? opt._id.toString() : "",
    text: opt?.text ?? "",
    voteCount: Array.isArray(opt?.votes) ? opt.votes.length : 0,
  }));

  const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);

  if (totalVotes === 0) {
    return {
      totalVotes: 0,
      options: options.map((o) => ({ ...o, percentage: 0 })),
      leadingOptionId: null,
    };
  }

  // Largest-remainder: floor each share, then hand the remaining points to the
  // options with the biggest fractional parts (ties broken by original order).
  const shares = options.map((o, index) => {
    const exact = (o.voteCount / totalVotes) * 100;
    const floor = Math.floor(exact);
    return { index, floor, remainder: exact - floor };
  });

  let remaining = 100 - shares.reduce((sum, s) => sum + s.floor, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  for (const share of byRemainder) {
    if (remaining <= 0) break;
    share.floor += 1;
    remaining -= 1;
  }

  const percentages = shares
    .sort((a, b) => a.index - b.index)
    .map((s) => s.floor);

  let leading = options[0];
  for (const o of options) {
    if (o.voteCount > leading.voteCount) leading = o;
  }

  return {
    totalVotes,
    options: options.map((o, i) => ({ ...o, percentage: percentages[i] })),
    leadingOptionId: leading._id,
  };
};
