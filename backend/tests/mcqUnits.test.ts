import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/shared/csv";
import { median, sameSet, shuffle } from "../src/modules/mcq/grading";
import { parseQuestionCsv } from "../src/modules/mcq/import";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes and newlines", () => {
    const rows = parseCsv('a,"b, with comma","say ""hi"""\r\n"two\nlines",x,y\n');
    expect(rows).toEqual([
      ["a", "b, with comma", 'say "hi"'],
      ["two\nlines", "x", "y"],
    ]);
  });

  it("keeps a final row that has no trailing newline", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("parseQuestionCsv", () => {
  const header = "question,A,B,C,D,correct,topic";

  it("reads questions, correct answers and topics", () => {
    const { questions, errors } = parseQuestionCsv(
      `${header}\nWhat is 2+2?,3,4,5,6,B,Maths\nPick primes,2,3,4,,A|B,Maths`
    );

    expect(errors).toEqual([]);
    expect(questions).toEqual([
      { text: "What is 2+2?", options: ["3", "4", "5", "6"], correct: [1], topic: "Maths" },
      { text: "Pick primes", options: ["2", "3", "4"], correct: [0, 1], topic: "Maths" },
    ]);
  });

  it("accepts semicolon-separated files and a byte order mark, as Excel exports them", () => {
    const { questions, errors } = parseQuestionCsv("﻿question;A;B;correct\nQ1;yes;no;A");
    expect(errors).toEqual([]);
    expect(questions[0]).toMatchObject({ text: "Q1", options: ["yes", "no"], correct: [0] });
  });

  it("finds columns by name, in any order", () => {
    const { questions } = parseQuestionCsv("correct,B,A,question\nB,second,first,Which is second?");
    expect(questions[0]).toMatchObject({ options: ["first", "second"], correct: [1] });
  });

  it("reports each bad row by number instead of importing part of the file", () => {
    const { questions, errors } = parseQuestionCsv(
      [header, "Good,a,b,,,A,", "Bad letter,a,b,,,Z,", "One option,a,,,,A,", "Gap,a,,c,,A,", ",a,b,,,A,"].join("\n")
    );

    expect(questions).toHaveLength(1);
    expect(errors).toEqual([
      expect.stringContaining("Row 3"),
      expect.stringContaining("Row 4"),
      expect.stringContaining("Row 5"),
      expect.stringContaining("Row 6"),
    ]);
  });

  it("asks for a usable header", () => {
    expect(parseQuestionCsv("name,age\nx,1").errors[0]).toMatch(/header/);
  });
});

describe("grading helpers", () => {
  it("shuffles without losing or repeating anything", () => {
    const original = [0, 1, 2, 3, 4, 5, 6, 7];
    const shuffled = shuffle(original);
    expect([...shuffled].sort()).toEqual(original);
    expect(original).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("matches answers as exact sets", () => {
    expect(sameSet([0, 2], [2, 0])).toBe(true);
    expect(sameSet([0], [0, 2])).toBe(false);
    expect(sameSet([], [1])).toBe(false);
    expect(sameSet([1, 1], [1])).toBe(false);
  });

  it("takes the median of odd and even lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
