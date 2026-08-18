import { describe, expect, it } from "vitest";
import { simulate, type Lane } from "@/lib/queue-lanes";

const seq = (letters: string): Lane[] =>
  letters
    .split(" ")
    .map((l) => ({ P: "pro", G: "go", F: "free" })[l] as Lane);

describe("queue lane dispatch order", () => {
  it("8 pro, 8 go, 8 free", () => {
    expect(simulate({ pro: 8, go: 8, free: 8 })).toEqual(
      seq("P P G P P G P P F P P G G F G G F G G F F F F F")
    );
  });

  it("5 pro only", () => {
    expect(simulate({ pro: 5, go: 0, free: 0 })).toEqual(seq("P P P P P"));
  });

  it("3 pro, 3 go", () => {
    expect(simulate({ pro: 3, go: 3, free: 0 })).toEqual(
      seq("P P G P G G")
    );
  });

  it("6 pro, 3 go", () => {
    expect(simulate({ pro: 6, go: 3, free: 0 })).toEqual(
      seq("P P G P P G P P G")
    );
  });

  it("6 pro, 0 go, 3 free (cascade)", () => {
    expect(simulate({ pro: 6, go: 0, free: 3 })).toEqual(
      seq("P P F P P F P P F")
    );
  });

  it("0 pro, 6 go, 3 free", () => {
    expect(simulate({ pro: 0, go: 6, free: 3 })).toEqual(
      seq("G G F G G F G G F")
    );
  });

  it("single lane only is straight FIFO", () => {
    expect(simulate({ pro: 0, go: 4, free: 0 })).toEqual(seq("G G G G"));
    expect(simulate({ pro: 0, go: 0, free: 4 })).toEqual(seq("F F F F"));
  });
});
