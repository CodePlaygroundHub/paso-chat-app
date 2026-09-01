import { computePollResults } from "../../src/lib/pollResults.js";

const opt = (id, votes) => ({ _id: id, text: id.toUpperCase(), votes: Array(votes).fill("v") });

describe("computePollResults", () => {
  it("returns zeroes and no leader when there are no votes", () => {
    const r = computePollResults({ options: [opt("a", 0), opt("b", 0)] });
    expect(r.totalVotes).toBe(0);
    expect(r.options.map((o) => o.percentage)).toEqual([0, 0]);
    expect(r.leadingOptionId).toBeNull();
  });

  it("splits an even two-way vote 50/50", () => {
    const r = computePollResults({ options: [opt("a", 1), opt("b", 1)] });
    expect(r.options.map((o) => o.percentage)).toEqual([50, 50]);
    expect(r.options.reduce((s, o) => s + o.percentage, 0)).toBe(100);
    expect(r.leadingOptionId).toBe("a");
  });

  it("makes three even options sum to exactly 100 (largest-remainder)", () => {
    const r = computePollResults({ options: [opt("a", 1), opt("b", 1), opt("c", 1)] });
    expect(r.options.reduce((s, o) => s + o.percentage, 0)).toBe(100);
    expect(r.options.map((o) => o.percentage)).toEqual([34, 33, 33]);
  });

  it("makes six even options sum to exactly 100", () => {
    const r = computePollResults({
      options: ["a", "b", "c", "d", "e", "f"].map((id) => opt(id, 1)),
    });
    expect(r.options.reduce((s, o) => s + o.percentage, 0)).toBe(100);
  });

  it("identifies the leading option and vote counts", () => {
    const r = computePollResults({ options: [opt("a", 3), opt("b", 1)] });
    expect(r.leadingOptionId).toBe("a");
    expect(r.options.find((o) => o._id === "a").voteCount).toBe(3);
    expect(r.totalVotes).toBe(4);
    expect(r.options.reduce((s, o) => s + o.percentage, 0)).toBe(100);
  });
});
