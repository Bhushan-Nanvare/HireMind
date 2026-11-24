import { parseCsv } from "../../shared/csv";

export interface QuestionInput {
  text: string;
  options: string[];
  correct: number[];
  topic?: string | undefined;
}

const MAX_SHOWN_ERRORS = 8;
const LETTERS = "abcdef";

function optionColumns(header: string[]): { letter: number; column: number }[] {
  const columns: { letter: number; column: number }[] = [];
  header.forEach((name, column) => {
    const match = /^(?:option\s*)?([a-f])$/.exec(name);
    if (match) columns.push({ letter: LETTERS.indexOf(match[1] as string), column });
  });
  return columns.sort((a, b) => a.letter - b.letter);
}

/**
 * Reads questions from CSV with a header row: question, A, B, C, D (up to F), correct, topic.
 * `correct` is a letter, or several separated by | ; or , for "select all that apply".
 */
export function parseQuestionCsv(csv: string): { questions: QuestionInput[]; errors: string[] } {
  const text = csv.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));

  const header = (rows[0] ?? []).map((name) => name.trim().toLowerCase());
  const questionColumn = header.indexOf("question");
  const correctColumn = header.indexOf("correct");
  const topicColumn = header.indexOf("topic");
  const options = optionColumns(header);

  if (questionColumn < 0 || correctColumn < 0 || options.length < 2) {
    return {
      questions: [],
      errors: ["The first row must be a header with the columns: question, A, B (and more options), correct, topic"],
    };
  }

  const questions: QuestionInput[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const fail = (message: string) => errors.push(`Row ${rowNumber}: ${message}`);
    const cell = (column: number) => (row[column] ?? "").trim();

    const questionText = cell(questionColumn);
    if (!questionText) return fail("the question is empty");

    const values = options.map((option) => cell(option.column));
    while (values.length > 0 && values[values.length - 1] === "") values.pop();
    if (values.length < 2) return fail("a question needs at least two options");
    const gap = values.findIndex((value) => value === "");
    if (gap >= 0) return fail(`option ${LETTERS.charAt(gap).toUpperCase()} is empty but a later option isn't`);

    const picked = cell(correctColumn)
      .split(/[\s|;,]+/)
      .filter(Boolean)
      .map((letter) => LETTERS.indexOf(letter.toLowerCase()));
    if (picked.length === 0) return fail("no correct answer given");
    if (picked.some((position) => position < 0 || position >= values.length)) {
      return fail(`the correct answer "${cell(correctColumn)}" doesn't match any option`);
    }
    if (new Set(picked).size !== picked.length) return fail("the same correct answer is listed twice");

    const topic = topicColumn >= 0 ? cell(topicColumn) : "";
    questions.push({ text: questionText, options: values, correct: picked, ...(topic && { topic }) });
  });

  if (questions.length === 0 && errors.length === 0) errors.push("No questions found below the header row");
  if (errors.length > MAX_SHOWN_ERRORS) {
    const hidden = errors.length - MAX_SHOWN_ERRORS;
    return { questions, errors: [...errors.slice(0, MAX_SHOWN_ERRORS), `…and ${hidden} more`] };
  }
  return { questions, errors };
}
