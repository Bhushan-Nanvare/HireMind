import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { prisma } from "../../shared/prisma";
import { generateEmbedding } from "../../shared/embeddings";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { removeStoredFile } from "../../shared/files";
import { storeUpload } from "../../shared/storage";

const PREVIEW_LENGTH = 200;

// What the browser gets for a resume: never the embedding or stored path, and only the start of the text
const summarySelect = {
  id: true,
  fileName: true,
  createdAt: true,
  parsedText: true,
  _count: { select: { applications: true } },
} as const;

function toSummary(resume: {
  id: string;
  fileName: string | null;
  createdAt: Date;
  parsedText: string | null;
  _count: { applications: number };
}) {
  return {
    id: resume.id,
    fileName: resume.fileName ?? "resume.pdf",
    createdAt: resume.createdAt,
    preview: resume.parsedText?.slice(0, PREVIEW_LENGTH) ?? "",
    applicationCount: resume._count.applications,
  };
}

/** The uploaded file's name, safe to store and to send back in a Content-Disposition header. */
function cleanFileName(originalName: string): string {
  const name = path.basename(originalName).replace(/[\u0000-\u001f"\\]/g, "").trim().slice(0, 200);
  return name || "resume.pdf";
}

async function getCandidateId(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
  if (!candidate) throw notFound("Candidate profile not found");
  return candidate.id;
}

async function extractPdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    // Join page texts ourselves: result.text always includes "-- 1 of N --" page markers, even for a blank PDF
    return result.pages.map((page) => page.text.trim()).filter(Boolean).join("\n\n");
  } catch {
    throw badRequest("This PDF couldn't be read. It may be damaged or password-protected.");
  } finally {
    await parser.destroy();
  }
}

export async function uploadResume(userId: string, file: { path: string; originalname: string }) {
  const candidateId = await getCandidateId(userId);

  const data = await fs.promises.readFile(file.path);
  // The file name and MIME type come from the client; the file signature is the real check
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw badRequest("This file isn't a valid PDF");
  }

  const parsedText = await extractPdfText(data);
  if (!parsedText) {
    throw badRequest("No text could be read from this PDF. Scanned or image-only resumes aren't supported.");
  }

  const embedding = await generateEmbedding(parsedText);
  const fileName = cleanFileName(file.originalname);
  const storedFile = await storeUpload(file.path, { folder: "resumes", contentType: "application/pdf", fileName });

  try {
    const resume = await prisma.resume.create({
      data: { candidateId, fileUrl: storedFile, fileName, parsedText, embedding },
      select: summarySelect,
    });
    return toSummary(resume);
  } catch (err) {
    // Don't leave the stored file behind if its row couldn't be written
    await removeStoredFile(storedFile);
    throw err;
  }
}

export async function listMyResumes(userId: string) {
  const candidateId = await getCandidateId(userId);
  const resumes = await prisma.resume.findMany({
    where: { candidateId },
    select: summarySelect,
    orderBy: { createdAt: "desc" },
  });
  return resumes.map(toSummary);
}

async function getOwnedResume(userId: string, resumeId: string) {
  const candidateId = await getCandidateId(userId);
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    select: { candidateId: true, fileUrl: true, fileName: true, _count: { select: { applications: true } } },
  });
  if (!resume || resume.candidateId !== candidateId) throw notFound("Resume not found or doesn't belong to you");
  return resume;
}

export async function getResumeFile(userId: string, resumeId: string) {
  const resume = await getOwnedResume(userId, resumeId);
  return { ref: resume.fileUrl, fileName: resume.fileName ?? "resume.pdf" };
}

export async function deleteResume(userId: string, resumeId: string) {
  const resume = await getOwnedResume(userId, resumeId);
  if (resume._count.applications > 0) {
    throw conflict("This resume was used to apply for a job, so it can't be deleted.");
  }
  await prisma.resume.delete({ where: { id: resumeId } });
  await removeStoredFile(resume.fileUrl);
}
